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
  - Response: `{ "user": { "id": "...", "email": "..." }, "token": "..." }`
- `POST /auth/login-christopher` (demo login; ensures KYC)
  - No body required (uses configured demo user; default email `christopher.albertson@example.com`)
  - Response: `{ "user": { "id": "...", "email": "...", "kycStatus": "ACCEPTED" }, "token": "...", "personId": "..." }`
- `POST /auth/google` (optional; requires GOOGLE_CLIENT_ID)
  - Body: `{ "idToken": "<google_id_token>" }`
  - Response: `{ "user": { "id": "...", "email": "..." }, "token": "..." }`
- `POST /auth/debug-login` (dev only)
  - Body: `{ "email": "user@example.com" }`
  - Response: `{ "user": { "id": "...", "email": "..." }, "token": "..." }`

## User
- `GET /user/me` — returns `{ "id": "...", "email": "..." }`

## Wallets
- `GET /wallet` — list wallets the current user belongs to.
- `POST /wallet/bootstrap` — ensure a default wallet (env `DEFAULT_WALLET_NAME` or "Groceries"), ensure membership, ensure a card for the current user, and return `{ wallet, card, balances }`.
- Errors on wallet creation/bootstrap will return `UserNotFound` (re-login) if the JWT points to a missing user (e.g., after DB reset).
- `POST /wallet/create`
  - Body: `{ "name": "My Wallet" }`
  - Response: `{ "wallet": { "id": "...", ... }, "ledger": ... }`
- `POST /wallet/:id/invite`
  - Body: `{ "email": "invitee@example.com", "role": "member" }` (role optional); admin only
- `POST /wallet/:id/join`
  - Join as member
- `GET /wallet/:id`
  - Returns wallet details (members, ledger accounts) if admin/member

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
  - Requires wallet membership.
  - Response: `{ "provider": "SYNCTERA", "externalCardId": "...", "last4": "1234", "status": "ACTIVE" }`
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
