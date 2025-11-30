# Test Scripts Guide

Ad hoc/manual scripts organized by domain. Run with `npx tsx <path>` (set `.env` as needed).

## Flows
- `flows/fullMockSpendFlow.ts` — end-to-end mock spend flow (mock BaaS, ledger).
- `flows/syncteraVirtualCardFlow.ts <EMAIL> "<NAME>" [BASE_URL]` — full Synctera sandbox flow: create user (mock), login, KYC, create wallet, issue virtual card, get widget URL (set_pin).

## Auth / Users
- `users/createUser.ts <EMAIL> "<NAME>"` — create a user (mock register).
- `users/listUsers.ts` — list users.
- `users/loginUser.ts <EMAIL>` — login helper (mock).

## Wallets
- `wallets/createWallet.ts "<NAME>" [TOKEN] [BASE_URL]` — create a wallet as current user.
- `wallets/inviteUser.ts <WALLET_ID> <EMAIL> [TOKEN] [BASE_URL]` — invite another user by email.
- `wallets/joinWallet.ts <WALLET_ID> [TOKEN] [BASE_URL]` — join a wallet as current user.

## Cards
- `cards/createCard.ts <WALLET_ID> [TOKEN] [BASE_URL]` — issue a card for a wallet (uses auth token).

## Ledger
- `ledger/deposit.ts <WALLET_ID> <USER_ID> <AMOUNT> [TOKEN] [BASE_URL]` — post deposit.
- `ledger/withdrawl.ts <WALLET_ID> <USER_ID> <AMOUNT> [TOKEN] [BASE_URL]` — withdraw.
- `ledger/cardCapture.ts <WALLET_ID> <USER_ID> <AMOUNT> [TOKEN] [BASE_URL]` — simulate card capture splits.
- `ledger/reconciliation.ts <WALLET_ID> [TOKEN] [BASE_URL]` — run reconciliation.
- `ledger/mockDeposit.ts <WALLET_ID> <AMOUNT> [TOKEN] [BASE_URL]` — mock deposit via test route.
- `ledger/inspectLedger.ts` — inspect ledger state.

## BaaS (mock)
- `baas/mockAuthWebhook.ts [BASE_URL]` — send mock AUTH webhook.
- `baas/mockClearingWebhook.ts [BASE_URL]` — send mock CLEARING webhook.
- `baas/mockAuthHoldFlow.ts [BASE_URL]` — auth/hold scenario.
- `baas/mockAuthHoldEdgeCases.ts [BASE_URL]` — edge cases for holds.

## Synctera (live sandbox)
- `synctera/helloSynctera.ts` — basic connectivity.
- `synctera/createAccount.ts <CUSTOMER_ID> [CURRENCY] [TEMPLATE_ID]` — create CHECKING account.
- `synctera/listAccountTemplates.ts [ACCOUNT_TYPE]` — list account templates.
- `synctera/createWebhookSecret.ts` — create webhook secret.
- `synctera/createWebhookSubscription.ts <WEBHOOK_URL> [EVENTS_COMMA] [DESCRIPTION]` — create webhook subscription.
- `synctera/sendWebhook.ts <PERSON_ID> <VERIFICATION_STATUS> [EVENT_ID] [BASE_URL]` — send synthetic webhook to local endpoint.
- `synctera/prospectToActive.ts` — move prospect to active.
- `synctera/testOnboardingKyc.ts <TOKEN> [BASE_URL]` — KYC flow.
- `synctera/testOnboardingKycApproved.ts <TOKEN> [BASE_URL]` — KYC flow (approved payload).
- `synctera/bootstrapApprovedUser.ts <EMAIL> "<NAME>" [BASE_URL]` — create/login user via mock routes and submit approved KYC; prints token/personId.
- `synctera/wipeSandbox.ts` — wipe Synctera sandbox (requires SYNCTERA_API_KEY).

## Notes
- These scripts are manual aids, they are not automated tests.
- Ensure required env vars are set (`.env`), especially for Synctera scripts.
- Use auth tokens from `/auth/google` or `/auth/debug-login` for protected routes.
