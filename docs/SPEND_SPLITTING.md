# Wallet Spend Splitting System

## Overview

The Wallet Prototype supports configurable per-wallet spend splitting policies that determine how card transaction amounts are divided among wallet members. This document explains the available policies, implementation details, and caching strategy.

## Spend Policies

Each wallet has a `spendPolicy` field (enum `WalletSpendPolicy`) that controls how card clearing transactions are split:

### PAYER_ONLY (Default)

- **Behavior**: The cardholder pays 100% of the transaction amount
- **Use Case**: Individual responsibility model where each person pays for their own purchases
- **Example**: Alice uses her card for a $100 purchase → Alice's equity account is debited $100

### EQUAL_SPLIT

- **Behavior**: Transaction amount is divided equally among all wallet members
- **Use Case**: Shared expense model for families, roommates, or groups
- **Example**: Alice uses her card for a $100 purchase in a 3-member wallet → Each member's equity account is debited $33.33 (with remainder distributed to ensure exact split)
- **Rounding**: Uses floor division with remainder distribution to the first N members to ensure total equals exactly the transaction amount

## Architecture

### Components

1. **SplittingPolicyService** (`src/services/wallet/splittingPolicyService.ts`)
   - Core service that calculates split amounts based on wallet policy
   - Includes in-memory LRU cache for wallet policies
   - Provides `calculateSplits()` method that returns array of `{ userId, amountMinor }` splits

2. **CardProgramService** (`src/services/baas/cardProgramService.ts`)
   - Handles card authorization and clearing events
   - On clearing, calls `splittingPolicyService.calculateSplits()` to determine splits
   - Passes splits to ledger service for posting

3. **LedgerService** (`src/services/ledger/ledgerService.ts`)
   - `postCardCapture()` method accepts splits array
   - Creates ledger entries for each split (debit member_equity, credit wallet_pool)

### Data Flow

```
Card Clearing Event
    ↓
CardProgramService.handleClearing()
    ↓
SplittingPolicyService.calculateSplits()
    ↓ (checks cache → DB if needed)
Returns splits: [{ userId, amountMinor }, ...]
    ↓
LedgerService.postCardCapture()
    ↓
Creates ledger entries for each split
```

## Caching Strategy

### Cache Implementation

- **Type**: In-memory LRU (Least Recently Used) cache
- **Max Size**: 1000 entries
- **TTL**: 60 seconds
- **Eviction**: When cache is full, oldest entry is removed

### Cache Operations

1. **Read**: `getWalletPolicy(walletId)`
   - Checks cache first
   - If valid (within TTL), returns cached value
   - Otherwise, fetches from DB and updates cache

2. **Invalidation**: `invalidateCache(walletId)`
   - Called automatically when wallet spend policy is updated via PATCH endpoint
   - Ensures next card clearing uses new policy

3. **Clear**: `clearCache()`
   - Utility method for testing
   - Clears entire cache

### Cache Benefits

- **Performance**: Avoids DB query on every card clearing transaction
- **Scalability**: Reduces DB load for high-volume wallets
- **Freshness**: 60-second TTL ensures policies update reasonably quickly
- **Explicit Invalidation**: Policy changes immediately invalidate cache for instant effect

## API Endpoints

### Update Wallet Spend Policy

**Endpoint**: `PATCH /wallet/:id/spend-policy`

**Auth**: Requires authentication, wallet admin only

**Request Body**:
```json
{
  "spendPolicy": "PAYER_ONLY" | "EQUAL_SPLIT"
}
```

**Response**:
```json
{
  "wallet": {
    "id": "wallet-uuid",
    "name": "Family Wallet",
    "spendPolicy": "EQUAL_SPLIT",
    ...
  },
  "message": "Spend policy updated successfully"
}
```

**Error Responses**:
- `403 AccessDenied`: User is not wallet admin
- `400 Invalid request body`: Invalid spendPolicy value

### Get Wallet Details

**Endpoint**: `GET /wallet/:id`

**Response** includes `spendPolicy` field:
```json
{
  "wallet": {
    "id": "wallet-uuid",
    "name": "Family Wallet",
    "spendPolicy": "EQUAL_SPLIT",
    "adminId": "user-uuid",
    ...
  },
  ...
}
```

## Database Schema

### Wallet Model

```prisma
enum WalletSpendPolicy {
  PAYER_ONLY
  EQUAL_SPLIT
}

model Wallet {
  id          String             @id @default(uuid())
  name        String
  adminId     String
  spendPolicy WalletSpendPolicy  @default(PAYER_ONLY)
  ...
}
```

**Migration**: `20251202103137_add_wallet_spend_policy`

## Implementation Examples

### Example 1: PAYER_ONLY with $50 transaction

**Wallet Members**: Alice, Bob, Charlie
**Transaction**: Alice's card, $50
**Splits**:
```typescript
[
  { userId: "alice-id", amountMinor: 5000 }
]
```
**Ledger Entries**:
- Debit: Alice's member_equity: $50
- Credit: wallet_pool: $50

### Example 2: EQUAL_SPLIT with $100 transaction, 3 members

**Wallet Members**: Alice, Bob, Charlie
**Transaction**: Alice's card, $100
**Calculation**: $100 / 3 = $33.33... → floor($100/3) = $33, remainder = $1
**Splits**:
```typescript
[
  { userId: "alice-id", amountMinor: 3334 },  // $33.34 (gets remainder)
  { userId: "bob-id", amountMinor: 3333 },    // $33.33
  { userId: "charlie-id", amountMinor: 3333 } // $33.33
]
```
**Ledger Entries**:
- Debit: Alice's member_equity: $33.34
- Debit: Bob's member_equity: $33.33
- Debit: Charlie's member_equity: $33.33
- Credit: wallet_pool: $100.00

## Testing Considerations

### Unit Tests

Test `SplittingPolicyService.calculateSplits()`:
- PAYER_ONLY returns single split
- EQUAL_SPLIT divides correctly
- Remainder distribution is correct
- Cache hit/miss behavior
- Cache invalidation works

### Integration Tests

Test end-to-end card clearing:
- Simulate CARD_CLEARING webhook with PAYER_ONLY policy
- Simulate CARD_CLEARING webhook with EQUAL_SPLIT policy
- Verify ledger entries are correct
- Test policy update and cache invalidation
- Verify subsequent clearing uses new policy

### Edge Cases

- Wallet with 1 member (EQUAL_SPLIT should work same as PAYER_ONLY)
- Very small amounts (e.g., $0.01)
- Large number of members
- Concurrent policy updates

## Future Enhancements

Potential future policies:

1. **CUSTOM_SPLIT**: Admin defines fixed percentages per member
2. **WEIGHTED_SPLIT**: Based on member income/contribution levels
3. **DYNAMIC_SPLIT**: Members can claim portions of transactions after the fact
4. **CATEGORY_BASED**: Different policies for different merchant categories

## Related Documentation

- [API Documentation](api.md)
- [Ledger System](../src/services/ledger/README.md)
- [Card Program Service](../src/services/baas/cardProgramService.ts)
- [PRD Section 5.3: Transaction Splitting](../.taskmaster/docs/prd.txt#L257)

