# Funding Route Management Tests

Integration tests for the funding route management system that routes WALLET_FUNDING webhook events to the correct wallet and user.

## Test Scripts

### testFundingRoutes.ts
Tests the funding route CRUD API endpoints.

**Usage:**
```bash
npx tsx src/tests/scripts/wallets/testFundingRoutes.ts <ADMIN_TOKEN> <WALLET_ID> <MEMBER_USER_ID>
```

**What it validates:**
- ✓ Creating funding routes with specific references
- ✓ Creating funding routes with default (empty) references
- ✓ Listing all routes for a wallet
- ✓ Upserting routes (update existing by composite key)
- ✓ All route fields are properly stored and returned
- ✓ Admin-only access control

### testFundingWebhook.ts
Tests WALLET_FUNDING webhook ingestion and routing based on funding routes.

**Usage:**
```bash
npx tsx src/tests/scripts/wallets/testFundingWebhook.ts <ADMIN_TOKEN> <WALLET_ID> <MEMBER_USER_ID>
```

**What it validates:**
- ✓ Webhooks are routed to correct wallet/user via funding routes
- ✓ Reference-specific routing works correctly
- ✓ Fallback to default route (empty reference) when specific reference not found
- ✓ Ledger balances (pool and member equity) are updated correctly
- ✓ Webhook idempotency and processing

## Complete Test Flow

```bash
# 1. Set up users and wallet
TOKEN_ADMIN=$(npx tsx src/tests/scripts/users/loginUser.ts admin@example.com | jq -r '.token')
TOKEN_MEMBER=$(npx tsx src/tests/scripts/users/loginUser.ts member@example.com | jq -r '.token')

# Get user IDs (you'll need these from your database or user service)
ADMIN_USER_ID="..." 
MEMBER_USER_ID="..."

# 2. Create a wallet as admin
WALLET_ID=$(npx tsx src/tests/scripts/wallets/createWallet.ts "$TOKEN_ADMIN" "Test Wallet" | jq -r '.wallet.id')

# 3. Invite member to wallet
npx tsx src/tests/scripts/wallets/inviteUser.ts "$TOKEN_ADMIN" "$WALLET_ID" member@example.com

# 4. Test funding route management
npx tsx src/tests/scripts/wallets/testFundingRoutes.ts "$TOKEN_ADMIN" "$WALLET_ID" "$MEMBER_USER_ID"

# 5. Test webhook ingestion
npx tsx src/tests/scripts/wallets/testFundingWebhook.ts "$TOKEN_ADMIN" "$WALLET_ID" "$MEMBER_USER_ID"
```

## Funding Route Concepts

### Composite Key
Funding routes are uniquely identified by:
- `providerName` (e.g., "MOCK", "SYNCTERA")
- `providerAccountId` (external account identifier)
- `reference` (optional label/memo, defaults to empty string)

### Reference Handling
- Specific references: Used for simulation contexts or specific funding sources
- Empty reference: Acts as default/fallback route for an account
- Fallback logic: If webhook reference doesn't match, tries default route

### Webhook Routing Flow
1. Webhook arrives with `providerAccountId` and optional `reference`
2. System looks up exact match: `(provider, accountId, reference)`
3. If not found and reference was provided, tries default: `(provider, accountId, "")`
4. If found, routes funds to the mapped `walletId` and `userId`
5. If not found, logs structured warning for monitoring

## API Endpoints

### POST /wallet/:id/funding-routes
Create or update a funding route (admin only).

**Request:**
```json
{
  "providerName": "MOCK",
  "providerAccountId": "ext-account-123",
  "reference": "optional-ref",
  "userId": "user-uuid",
  "baasAccountId": "optional-baas-account-id"
}
```

**Response:**
```json
{
  "route": {
    "id": "route-uuid",
    "providerName": "MOCK",
    "providerAccountId": "ext-account-123",
    "reference": "optional-ref",
    "walletId": "wallet-uuid",
    "userId": "user-uuid",
    "baasAccountId": "baas-account-id",
    "createdAt": "2025-12-02T..."
  }
}
```

### GET /wallet/:id/funding-routes
List all funding routes for a wallet (admin or member).

**Response:**
```json
{
  "routes": [
    {
      "id": "route-uuid",
      "providerName": "MOCK",
      "providerAccountId": "ext-account-123",
      "reference": "",
      "walletId": "wallet-uuid",
      "userId": "user-uuid",
      "user": { ... },
      "baasAccount": { ... },
      "createdAt": "2025-12-02T..."
    }
  ]
}
```

## Monitoring & Debugging

When funding routes are misconfigured, structured warnings are logged:

```json
{
  "severity": "ERROR",
  "code": "FUNDING_ROUTE_NOT_FOUND",
  "message": "Wallet funding route not found after all fallback attempts",
  "context": {
    "provider": "MOCK",
    "providerAccountId": "ext-account-123",
    "reference": "unknown-ref",
    "providerEventId": "event-123",
    "providerTransactionId": "tx-456",
    "amountMinor": 10000,
    "currency": "USD",
    "timestamp": "2025-12-02T..."
  }
}
```

Monitor these logs to identify:
- Missing funding routes
- Incorrect account mappings
- Reference mismatches
- Provider account configuration issues

## Integration with BaasService

When accounts are provisioned via `BaasService.ensureAccountForUser`:
```typescript
await baasService.ensureAccountForUser(userId, walletId, "optional-reference");
```

The funding route table is automatically updated with the new mapping, ensuring deposits to that account are correctly routed.

## Related Files

- Service: `src/services/baas/fundingRouteService.ts`
- Controllers: `src/domain/wallet/controller.ts`
- Routes: `src/domain/wallet/routes.ts`
- Validators: `src/domain/wallet/validator.ts`
- Webhook Ingestion: `src/services/baas/baasWebhookService.ts`
- Types: `src/services/baas/baasTypes.ts`
- Schema: `prisma/schema.prisma` (BaasFundingRoute model)

