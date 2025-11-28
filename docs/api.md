# API Quick Reference

Minimal endpoint guide for frontend usage.

- Base URL: (e.g.) `http://localhost:3000`
- Auth header on all protected routes: `Authorization: Bearer <token>`
- `cardId` in card endpoints = provider external card ID returned from issuance (not internal DB ID)

## Start to End Flow (Virtual Card)
1) Auth: `POST /auth/google` with `{ idToken }` → get `{ token }`
2) KYC: `POST /onboarding/kyc` with user info → get `verificationStatus` (ACCEPTED)
3) Create wallet: `POST /wallet/create` `{ name }` → get `walletId`
4) Issue card: `POST /wallets/:walletId/cards` → returns `{ externalCardId, last4, status }` (virtual auto-activates)
5) Set PIN / display card via widgets (PCI-safe):
   - Widget URL: `GET /cards/:cardId/widget-url?widgetType=set_pin`
   - Client token: `POST /cards/:cardId/client-token`
   - Single-use token: `POST /cards/:cardId/single-use-token`
   Embed returned URL/token in Synctera widgets; we never expose PAN/CVV directly.

## Auth
- `POST /auth/google` — body `{ idToken }` (Google Sign-In) → `{ user, token }`
- `POST /auth/debug-login` — body `{ email }` (dev only) → `{ user, token }`

## User
- `GET /user/me` — returns `{ id, email }`

## Wallets
- `POST /wallet/create` — `{ name }`; creates wallet, caller = admin
- `POST /wallet/:id/invite` — `{ email, role? }`; admin only
- `POST /wallet/:id/join` — join as member
- `GET /wallet/:id` — wallet details (members, ledger accounts) if admin/member

## Onboarding (Synctera KYC)
- `POST /onboarding/kyc` — body:
  ```
  {
    first_name, last_name, dob,
    phone_number, email, ssn,
    legal_address: { address_line_1, city, state, postal_code, country_code },
    disclosures?: [{ type, version }],
    customer_ip_address?: string
  }
  ```
  Returns `{ personId, verificationStatus, user: { id, kycStatus } }`

## Cards (Synctera)
- Issue: `POST /wallets/:walletId/cards` — requires wallet membership; returns `{ provider, externalCardId, last4?, status? }`
- Widget URL: `GET /cards/:cardId/widget-url?widgetType=activate_card|set_pin` — returns `{ url }`
- Client token: `POST /cards/:cardId/client-token` — returns `{ clientToken }`
- Single-use token: `POST /cards/:cardId/single-use-token` — returns `{ token, expires?, customerAccountMappingId? }`
- Notes:
  - Virtual cards auto-activate; emboss name derived from user name/email.
  - Widget/token endpoints are PCI-safe; embed in Synctera widgets for PAN/CVV/PIN flows.

## Ledger (wallet member required)
- `POST /ledger/:walletId/deposit` — `{ amount, metadata? }`
- `POST /ledger/:walletId/withdraw` — `{ amount, metadata? }`
- `POST /ledger/:walletId/card-capture` — `{ splits: [{ userId, amount }], metadata? }`
- `POST /ledger/:walletId/adjustment` — `{ fromAccountId, toAccountId, amount, metadata? }`
- `GET /ledger/:walletId/reconciliation` — reconciliation summary

## Webhooks (server-facing)
- `POST /webhooks/synctera` — raw body, Synctera signature headers
- `POST /webhooks/baas/:provider` — mock provider webhooks
