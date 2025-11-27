// Tests auth hold lifecycle via HTTP routes only (no direct Prisma).
// Usage:
//   npx tsx src/tests/scripts/baas/mockAuthHoldFlow.ts <WALLET_ID> <EXTERNAL_CARD_ID> <AMOUNT_MINOR> [CURRENCY]

import { cliRequest } from "../../helpers/cliHelper.js";
import { AuthHoldStatus } from "../../../generated/prisma/enums.js";

function logStep(label: string) {
  console.log(`\n💡 DEBUG: ${label}`);
}

type HoldsResponse = {
  holds: Array<{
    providerAuthId: string;
    status: AuthHoldStatus;
    amountMinor: number;
    currency: string;
    providerCardId: string;
  }>;
};

async function fetchHoldStatus(walletId: string, providerAuthId: string): Promise<AuthHoldStatus> {
  const { holds } = await cliRequest<HoldsResponse>("get", `/test/baas/holds/${walletId}`);
  const hold = holds.find((h) => h.providerAuthId === providerAuthId);
  if (!hold) {
    throw new Error(
      `Hold not found for authId=${providerAuthId}. Possible reasons: auth declined/duplicate/no hold created. Returned holds: ${holds.length}`
    );
  }
  return hold.status;
}

async function expectHoldStatus(walletId: string, providerAuthId: string, expected: AuthHoldStatus) {
  const status = await fetchHoldStatus(walletId, providerAuthId);
  if (status !== expected) {
    throw new Error(
      `Hold status mismatch for authId=${providerAuthId}: expected ${expected}, got ${status}`
    );
  }
}

async function authThenClearing(
  walletId: string,
  cardId: string,
  amountMinor: number,
  currency: string
) {
  const authId = `mock_auth_${Date.now()}`;
  const authEventId = `mock_auth_evt_${Date.now()}`;
  const clearEventId = `mock_clear_evt_${Date.now()}`;
  const clearTxId = `mock_clear_tx_${Date.now()}`;

  logStep("Sending CARD_AUTH for clearing path...");
  await cliRequest("post", "/webhooks/baas/mock", {
    type: "CARD_AUTH",
    id: authEventId,
    txId: authId,
    cardId,
    amountMinor,
    currency,
    occurredAt: new Date().toISOString(),
  });
  await expectHoldStatus(walletId, authId, AuthHoldStatus.PENDING);
  logStep("   -> Hold recorded as PENDING.");

  logStep("Sending CARD_CLEARING linked to auth...");
  await cliRequest("post", "/webhooks/baas/mock", {
    type: "CARD_CLEARING",
    id: clearEventId,
    txId: clearTxId,
    authId,
    cardId,
    amountMinor,
    currency,
    occurredAt: new Date().toISOString(),
  });
  await expectHoldStatus(walletId, authId, AuthHoldStatus.CLEARED);
  logStep("   -> Hold marked CLEARED after clearing.");
}

async function authThenReversal(
  walletId: string,
  cardId: string,
  amountMinor: number,
  currency: string
) {
  const authId = `mock_auth_${Date.now() + 1}`;
  const authEventId = `mock_auth_evt_${Date.now() + 1}`;
  const revEventId = `mock_rev_evt_${Date.now() + 1}`;

  logStep("Sending CARD_AUTH for reversal path...");
  await cliRequest("post", "/webhooks/baas/mock", {
    type: "CARD_AUTH",
    id: authEventId,
    txId: authId,
    cardId,
    amountMinor,
    currency,
    occurredAt: new Date().toISOString(),
  });
  await expectHoldStatus(walletId, authId, AuthHoldStatus.PENDING);
  logStep("   -> Hold recorded as PENDING.");

  logStep("Sending CARD_AUTH_REVERSAL...");
  await cliRequest("post", "/webhooks/baas/mock", {
    type: "CARD_AUTH_REVERSAL",
    id: revEventId,
    authId,
    cardId,
    amountMinor,
    currency,
    occurredAt: new Date().toISOString(),
  });
  await expectHoldStatus(walletId, authId, AuthHoldStatus.REVERSED);
  logStep("   -> Hold marked REVERSED.");
}

async function dumpHolds(walletId: string) {
  const { holds } = await cliRequest<HoldsResponse>("get", `/test/baas/holds/${walletId}`);
  logStep(`   -> Holds: ${JSON.stringify(holds, null, 2)}`);
}

async function main() {
  const [walletId, cardId, amountStr, currency = "CAD"] = process.argv.slice(2);

  if (!walletId || !cardId || !amountStr) {
    console.error(
      "Usage: tsx src/tests/scripts/baas/mockAuthHoldFlow.ts <WALLET_ID> <EXTERNAL_CARD_ID> <AMOUNT_MINOR> [CURRENCY]"
    );
    process.exit(1);
  }

  const amountMinor = Number(amountStr);
  if (Number.isNaN(amountMinor) || amountMinor <= 0) {
    console.error("Amount must be a positive integer (minor units).");
    process.exit(1);
  }

  try {
    await authThenClearing(walletId, cardId, amountMinor, currency);
    await authThenReversal(walletId, cardId, amountMinor, currency);
    logStep("Dumping holds for wallet");
    await dumpHolds(walletId);
    logStep("🎉 Auth hold flow completed.");
  } catch (err: any) {
    console.error("❌ Flow failed:", err?.message ?? err);
    process.exit(1);
  }
}

main();
