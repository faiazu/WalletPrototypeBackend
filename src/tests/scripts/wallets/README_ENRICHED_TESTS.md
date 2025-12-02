# Enriched Wallet Context Tests

These integration tests verify that the `/wallet/:id/invite` and `/wallet/:id/join` endpoints return enriched wallet context including wallet details, balances, and member information.

## Test Scripts

### testEnrichedJoin.ts
Tests the enriched response from the join wallet endpoint.

**Usage:**
```bash
npx tsx src/tests/scripts/wallets/testEnrichedJoin.ts <TOKEN> <WALLET_ID>
```

**What it validates:**
- ✓ Response includes `wallet` field with id and members
- ✓ Response includes `balances` field with poolDisplay and memberEquity
- ✓ Response includes `member` field with walletId and userId
- ✓ New member appears in wallet.members array
- ✓ New member has a ledger equity account entry in balances.memberEquity

### testEnrichedInvite.ts
Tests the enriched response from the invite member endpoint.

**Usage:**
```bash
npx tsx src/tests/scripts/wallets/testEnrichedInvite.ts <ADMIN_TOKEN> <WALLET_ID> <INVITEE_EMAIL>
```

**What it validates:**
- ✓ Response includes `wallet` field with id and members
- ✓ Response includes `balances` field with poolDisplay and memberEquity
- ✓ Response includes `member` field with correct role
- ✓ Invited member appears in wallet.members array
- ✓ Invited member has a ledger equity account entry

## Example Test Flow

```bash
# 1. Create two users and get their tokens
TOKEN_ADMIN=$(npx tsx src/tests/scripts/users/loginUser.ts admin@example.com password123 | jq -r '.token')
TOKEN_USER=$(npx tsx src/tests/scripts/users/loginUser.ts user@example.com password123 | jq -r '.token')

# 2. Create a wallet as admin
WALLET_ID=$(npx tsx src/tests/scripts/wallets/createWallet.ts "$TOKEN_ADMIN" "Test Wallet" | jq -r '.wallet.id')

# 3. Test enriched invite response
npx tsx src/tests/scripts/wallets/testEnrichedInvite.ts "$TOKEN_ADMIN" "$WALLET_ID" "invitee@example.com"

# 4. Test enriched join response (with a different user)
npx tsx src/tests/scripts/wallets/testEnrichedJoin.ts "$TOKEN_USER" "$WALLET_ID"
```

## Requirements

These tests validate that:
1. The backend properly fetches wallet details after adding a member
2. The backend fetches current balance snapshots
3. Ledger accounts are seeded before the response is sent
4. All three response fields (wallet, balances, member) are properly populated
5. The iOS app can immediately update state without additional API calls

