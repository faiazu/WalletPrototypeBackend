# API Quick Reference (frontend-ready with examples)

- Base URL (dev): `http://localhost:3000` (override with `BASE_URL`)
- Auth header on protected routes: `Authorization: Bearer <token>`
- `cardId` = provider externalCardId from issuance (not internal DB ID)
- Errors: typically `{ "error": "message", "details"?: any }`

## Start to End Path (Virtual Card)
1) **Auth**: `POST /auth/google` `{ "idToken": "<google_id_token>" }` → `{ user, token }`  
   (Dev alt: `POST /auth/debug-login` `{ "email": "user@example.com" }` → `{ user, token }`)
2) **KYC**: `POST /onboarding/kyc` (see payload) → `verificationStatus` (ACCEPTED)
3) **Create wallet**: `POST /wallet/create` `{ "name": "My Wallet" }` → `walletId`
4) **Issue card**: `POST /wallets/:walletId/cards` → `{ externalCardId, last4?, status }` (virtual auto-activates)
5) **PIN / PAN via widgets (PCI-safe)**:
   - Widget URL: `GET /cards/:cardId/widget-url?widgetType=set_pin`
   - Client token: `POST /cards/:cardId/client-token`
   - Single-use token: `POST /cards/:cardId/single-use-token`
   Embed URL/tokens in Synctera widgets; backend never exposes PAN/CVV directly.

## Auth
- `POST /auth/login` (email-only; creates user if needed)
  - Body: `{ "email": "user@example.com" }`
  - Response: `{ "user": { "id": "...", "email": "...", "name": "..." }, "token": "..." }`
- `POST /auth/login-christopher` (demo login; ensures KYC)
  - No body required (uses configured demo user; default email `christopher.albertson@example.com`)
  - Response: `{ "user": { "id": "...", "email": "...", "name": "...", "kycStatus": "ACCEPTED" }, "token": "...", "personId": "..." }`
- `POST /auth/google` (optional; requires GOOGLE_CLIENT_ID)
  - Body: `{ "idToken": "<google_id_token>" }`
  - Response: `{ "user": { "id": "...", "email": "...", "name": "..." }, "token": "..." }`
- `POST /auth/debug-login` (dev only)
  - Body: `{ "email": "user@example.com" }`
  - Response: `{ "user": { "id": "...", "email": "..." }, "token": "..." }`

## User
- `GET /user/me` — returns `{ "id": "...", "email": "...", "name": "...", "kycStatus"?: "..." }`
- `GET /user/overview` — convenience response for onboarding/dashboard:
  ```jsonc
  {
    "user": { "id": "...", "email": "...", "name": "...", "kycStatus": "ACCEPTED" },
    "hasWallets": true,
    "requirements": { "kycRequired": false },
    "metadata": {
      "defaultWalletName": "Household",
      "isWalletAdmin": true
    },
    "wallets": [
      {
        "id": "...",
        "name": "Shared Groceries",
        "role": "admin",
        "isAdmin": true,
        "memberCount": 3,
        "cardCount": 2,
        "hasCardForCurrentUser": true,
        "joinedAt": "...",
        "createdAt": "..."
      }
    ],
    "cardsForCurrentUser": [
      {
        "walletId": "...",
        "externalCardId": "card_123",
        "last4": "1234",
        "status": "ACTIVE",
        "providerName": "SYNCTERA",
        "createdAt": "..."
      }
    ]
  }
  ```
  Use `hasWallets` + `wallets.length` to decide whether to show the onboarding screen shown in the mockup.

## Wallets
- `GET /wallet` — list wallets the current user belongs to; frontend can show the onboarding screen when this returns an empty array.
- `POST /wallet/create`
  - Requires the user’s `kycStatus` to be `ACCEPTED`; otherwise the route returns `403 KycRequired`.
  - Body: `{ "name": "My Wallet" }`
  - Response: `{ "wallet": { "id": "...", ... }, "ledger": ... }`
- `POST /wallet/:id/invite`
  - Body: `{ "email": "invitee@example.com", "role": "member" }` (role optional); admin only
- `POST /wallet/:id/join`
  - Join as member
- `GET /wallet/:id`
  - Returns wallet details (members, ledger accounts) and `balances` snapshot if admin/member
- `GET /wallets/:walletId/cards`
  - Requires wallet membership.
  - Response: `{ "cards": [ { "id": "...", "externalCardId": "...", "last4": "...", "user": { "id": "...", "email": "...", "name": "..." } } ] }`

## Onboarding (Synctera KYC)
- `POST /onboarding/kyc`
  - Body example:
    ```json
    {
      "first_name": "Christopher",
      "last_name": "Albertson",
      "dob": "1985-06-14",
      "phone_number": "+16045551212",
      "email": "user@example.com",
      "ssn": "456-78-9999",
      "legal_address": {
        "address_line_1": "123 Main St.",
        "city": "Beverly Hills",
        "state": "CA",
        "postal_code": "90210",
        "country_code": "US"
      },
      "disclosures": [
        { "type": "REG_DD", "version": "1.0" }
      ],
      "customer_ip_address": "184.233.47.237"
    }
    ```
  - Response: `{ "personId": "...", "verificationStatus": "ACCEPTED", "user": { "id": "...", "kycStatus": "ACCEPTED" } }`

## Cards (Synctera)
- Issue card: `POST /wallets/:walletId/cards`
  - Optional body: `{ "nickname": "Groceries card" }`
  - Requires wallet membership.
  - Response: `{ "provider": "SYNCTERA", "externalCardId": "...", "last4": "1234", "status": "ACTIVE", "nickname": "Groceries card" }`
- List cards in wallet: `GET /wallets/:walletId/cards`
  - Requires wallet membership.
  - Response: `{ "cards": [ { "id": "...", "externalCardId": "...", "last4": "...", "status": "...", "nickname": "Groceries card", "user": { "id": "...", "email": "...", "name": "..." } } ] }`
- Get card details: `GET /cards/:cardId`
  - Requires wallet membership.
  - Response: `{ "card": { "id": "...", "externalCardId": "...", "walletId": "...", "status": "...", "last4": "...", "nickname": "Groceries card", "providerName": "...", "user": { "id": "...", "email": "...", "name": "..." }, "expiryMonth": null, "expiryYear": null, ... }, "balances": { "poolDisplay": ..., "memberEquity": [...] } }`
- Update card status: `PATCH /cards/:cardId/status` with body `{ "status": "ACTIVE" | "LOCKED" | "CANCELED" | "SUSPENDED" }`
  - Requires wallet membership.
  - Response: `{ "status": "..." }`
- Update card nickname: `PATCH /cards/:cardId/nickname` with body `{ "nickname": "Travel Spending" }`
  - Requires wallet membership.
  - Response: `{ "card": { "externalCardId": "...", "nickname": "Travel Spending", "status": "...", "last4": "1234" } }`
- Widget URL: `GET /cards/:cardId/widget-url?widgetType=activate_card|set_pin`
  - Response: `{ "url": "https://..." }`
- Client token: `POST /cards/:cardId/client-token`
  - Response: `{ "clientToken": "..." }`
- Single-use token: `POST /cards/:cardId/single-use-token`
  - Response: `{ "token": "...", "expires": "...", "customerAccountMappingId": "..." }`
- Notes:
  - Virtual cards auto-activate; emboss name derived from user name/email (sent as line_1).
  - `cardId` is the provider external card ID from issuance.
  - Use the returned URL/tokens with Synctera widgets for PAN/CVV/PIN display/set PIN (PCI-safe).

## Ledger (wallet member required)
- `POST /ledger/:walletId/deposit` — `{ "amount": 1000, "metadata": { "note": "topup" } }`
- `POST /ledger/:walletId/withdraw` — `{ "amount": 500, "metadata": { "note": "cashout" } }`
- `POST /ledger/:walletId/card-capture` — `{ "splits": [{ "userId": "<payer_user_id>", "amount": 1234 }], "metadata": { "merchant": "Acme" } }`
- `POST /ledger/:walletId/adjustment` — `{ "fromAccountId": "...", "toAccountId": "...", "amount": 100 }`
- `GET /ledger/:walletId/reconciliation` — reconciliation summary

## Webhooks (server-facing)
- `POST /webhooks/synctera` — raw body, Synctera signature headers (handled server-side)
- `POST /webhooks/baas/:provider` — mock provider webhooks (for testing)

## Withdrawals (Phase 2)

### Create Withdrawal
- `POST /wallet/:id/withdrawals`
  - Body: `{ "amountMinor": 50000, "currency": "USD", "metadata": {} }`
  - Response: `{ "withdrawalRequest": {...}, "withdrawalTransfer": {...}, "message": "..." }`
  - Requires: Wallet membership, sufficient equity
  - Flow: Creates request, moves funds to pending, initiates provider payout

### List Withdrawals
- `GET /wallet/:id/withdrawals?limit=50&offset=0&status=PENDING`
  - Response: `{ "withdrawals": [...], "count": 10, "limit": 50, "offset": 0 }`
  - Requires: Wallet membership

### Get Withdrawal Details
- `GET /wallet/:id/withdrawals/:withdrawalId`
  - Response: `{ "withdrawal": { "id": "...", "status": "...", "transfers": [...] } }`
  - Requires: Wallet membership

### Withdrawal Statuses
- `PENDING` - Request created, not yet processed
- `PROCESSING` - Provider payout initiated
- `COMPLETED` - Payout confirmed by provider
- `FAILED` - Payout failed (funds returned to equity)
- `CANCELLED` - Cancelled before processing

## Wallet Configuration (Admin Only)

### Funding Routes
- `POST /wallet/:id/funding-routes`
  - Body: `{ "providerName": "MOCK", "providerAccountId": "...", "reference": "", "userId": "...", "baasAccountId": "..." }`
  - Response: `{ "route": {...} }`
  - Requires: Wallet admin
  - Purpose: Map inbound funding to specific wallets/users

- `GET /wallet/:id/funding-routes`
  - Response: `{ "routes": [...] }`
  - Requires: Wallet membership

### Spend Policy
- `PATCH /wallet/:id/spend-policy`
  - Body: `{ "spendPolicy": "PAYER_ONLY" | "EQUAL_SPLIT" }`
  - Response: `{ "wallet": {...}, "message": "..." }`
  - Requires: Wallet admin
  - Purpose: Configure how card transactions are split among members

## Simulation & Testing

### End-to-End Simulation Runner

Run a complete platform simulation from KYC through transactions:

```bash
# Basic simulation
npm run simulate

# Custom configuration
npm run simulate -- \
  --wallet-name "Demo Wallet" \
  --deposit-amount 100000 \
  --spend-amount 10000 \
  --funding-amount 25000 \
  --withdrawal-amount 15000 \
  --export demo-results.json \
  --verbose

# Skip withdrawal flow
npm run simulate -- --skip-withdrawal

# CI mode with JSON export
npm run simulate:ci
```

**CLI Options**:
- `--wallet-name <name>` - Wallet name (default: "Demo Wallet")
- `--deposit-amount <cents>` - Initial deposit (default: 50000 = $500)
- `--spend-amount <cents>` - Card transaction (default: 5000 = $50)
- `--funding-amount <cents>` - Inbound funding (default: 10000 = $100)
- `--withdrawal-amount <cents>` - Withdrawal request (default: 10000 = $100)
- `--provider <name>` - BaaS provider (default: "MOCK")
- `--verbose` - Detailed logging
- `--export <file>` - Export JSON results
- `--skip-withdrawal` - Skip withdrawal flow
- `--base-url <url>` - API URL (default: http://localhost:3000)

**Simulation Steps**:
1. Authentication (Christopher demo user)
2. KYC Verification
3. Wallet Creation
4. Card Issuance
5. Initial Deposit
6. Card Authorization
7. Card Clearing
8. Wallet Funding (inbound ACH)
9. Withdrawal Request
10. Payout Completion
11. Ledger Validation

**Output**: Console summary + optional JSON export with full step details, balances, and validation results.

**JSON Export Structure**:
```json
{
  "simulationId": "sim_...",
  "timestamp": "2024-12-02T10:30:00Z",
  "config": { "walletName": "...", "depositAmount": 50000, ... },
  "steps": [
    { "step": 1, "name": "authentication", "status": "success", "duration": 120, "data": {...} },
    ...
  ],
  "finalState": {
    "walletId": "...",
    "balances": {...},
    "ledgerInvariant": {...}
  },
  "validation": {
    "allStepsSuccessful": true,
    "ledgerInvariantPassed": true,
    "balancesMatch": true,
    "errors": []
  },
  "duration": 3245,
  "success": true
}
```

### Test-Only Routes (Development)

**IMPORTANT**: These routes are only available when `NODE_ENV !== "production"`.

#### Ledger Testing
- `POST /test/ledger/deposit/:walletId` - Direct deposit (bypasses BaaS)
- `POST /test/ledger/withdraw/:walletId` - Direct withdrawal (bypasses BaaS)
- `POST /test/ledger/card-capture/:walletId` - Direct card capture
- `GET /test/ledger/reconciliation/:walletId` - Ledger reconciliation

#### BaaS Testing
- `GET /test/baas/holds` - List all auth holds
- `POST /test/baas/funding` - Trigger WALLET_FUNDING event
  - Body: `{ "providerAccountId": "...", "amountMinor": 10000, "currency": "USD", "reference": "" }`
- `POST /test/baas/payout-status` - Trigger PAYOUT_STATUS webhook
  - Body: `{ "providerTransferId": "...", "status": "COMPLETED" | "FAILED" | "REVERSED", "failureReason": "..." }`
- `POST /test/baas/reset` - **DANGEROUS**: Reset database state (preserves users only)
- `GET /test/state` - Get current system entity counts

#### Auth Testing
- `POST /test/auth/login` - Mock login
- `POST /test/auth/register` - Mock registration
- `GET /test/auth/list-users` - List all users

**Security**: All test routes are automatically disabled in production environments.

## Example Workflows

### Quick Demo Flow

```bash
# 1. Start server
npm run dev

# 2. Run simulation
npm run simulate

# 3. View results in console
```

### Partner Integration Testing

```bash
# 1. Run simulation with export
npm run simulate -- \
  --wallet-name "Synctera Integration" \
  --export synctera-demo.json \
  --verbose

# 2. Share synctera-demo.json with partner
# Contains full trace of API calls and ledger state
```

### Manual Testing Sequence

```bash
# 1. Login
curl -X POST http://localhost:3000/auth/login-christopher

# 2. Create wallet
curl -X POST http://localhost:3000/wallet/create \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Wallet"}'

# 3. Issue card
curl -X POST http://localhost:3000/wallets/<walletId>/cards \
  -H "Authorization: Bearer <token>"

# 4. Deposit funds
curl -X POST http://localhost:3000/test/ledger/deposit/<walletId> \
  -H "Authorization: Bearer <token>" \
  -d '{"amount": 100000}'

# 5. Simulate card clearing
curl -X POST http://localhost:3000/webhooks/baas/mock \
  -H "Content-Type: application/json" \
  -d '{
    "type": "CARD_CLEARING",
    "provider": "MOCK",
    "providerEventId": "evt_123",
    "providerTransactionId": "tx_456",
    "providerCardId": "<externalCardId>",
    "amountMinor": 5000,
    "currency": "USD",
    "occurredAt": "2024-12-02T10:00:00Z"
  }'

# 6. Check balances
curl -X GET http://localhost:3000/wallet/<walletId> \
  -H "Authorization: Bearer <token>"
```

## Related Documentation

- [Simulation Design](SIMULATION_DESIGN.md) - Detailed simulation architecture
- [Withdrawal & Payout](WITHDRAWAL_PAYOUT.md) - Withdrawal pipeline details
- [Spend Splitting](SPEND_SPLITTING.md) - Spend policy documentation
- [Test Scripts](../src/tests/scripts/README.md) - Integration test suite
