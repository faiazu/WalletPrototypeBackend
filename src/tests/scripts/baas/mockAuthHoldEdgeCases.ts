// Edge case checks for auth holds using HTTP routes only.
// Assumes the wallet/card has sufficient balance to approve the initial auth.
//
// Usage:
//   npx tsx src/tests/scripts/baas/mockAuthHoldEdgeCases.ts <WALLET_ID> <EXTERNAL_CARD_ID> <AMOUNT_MINOR> [CURRENCY]

import { cliRequest } from "../../helpers/cliHelper.js";
import { AuthHoldStatus } from "../../../generated/prisma/enums.js";

function logStep(label: string) {
  console.log(`\n💡 DEBUG: ${label}`);
}

type HoldsResponse = {
  holds: Array<{
    id: string;
    providerAuthId: string;
    status: AuthHoldStatus;
    amountMinor: number;
    currency: string;
    providerCardId: string;
  }>;
};

async function getHolds(walletId: string): Promise<HoldsResponse["holds"]> {
  const { holds } = await cliRequest<HoldsResponse>("get", `/test/baas/holds/${walletId}`);
  return holds;
}

async function main() {
  const [walletId, cardId, amountStr, currency = "CAD"] = process.argv.slice(2);

  if (!walletId || !cardId || !amountStr) {
    console.error(
      "Usage: tsx src/tests/scripts/baas/mockAuthHoldEdgeCases.ts <WALLET_ID> <EXTERNAL_CARD_ID> <AMOUNT_MINOR> [CURRENCY]"
    );
    process.exit(1);
  }

  const amountMinor = Number(amountStr);
  if (Number.isNaN(amountMinor) || amountMinor <= 0) {
    console.error("Amount must be a positive integer (minor units).");
    process.exit(1);
  }

  try {
    // Baseline holds
    const baseline = await getHolds(walletId);
    const baselineCount = baseline.length;
    logStep(`Baseline holds count: ${baselineCount}`);

    const authId = `edge_auth_${Date.now()}`;
    const authEventId = `edge_auth_evt_${Date.now()}`;
    const clearEventId = `edge_clear_evt_${Date.now()}`;
    const clearTxId = `edge_clear_tx_${Date.now()}`;

    // 1) Send AUTH
    logStep("Sending initial CARD_AUTH (should approve and create 1 hold)...");
    await cliRequest("post", "/webhooks/baas/mock", {
      type: "CARD_AUTH",
      id: authEventId,
      txId: authId,
      cardId,
      amountMinor,
      currency,
      occurredAt: new Date().toISOString(),
    });

    const afterAuth = await getHolds(walletId);
    const hold = afterAuth.find((h) => h.providerAuthId === authId);
    if (!hold || hold.status !== AuthHoldStatus.PENDING) {
      throw new Error("Auth hold not recorded as PENDING after initial auth");
    }
    logStep("   -> Hold recorded as PENDING.");

    // 2) Duplicate AUTH with same txId should not create another hold
    logStep("Sending duplicate CARD_AUTH with same txId (should not create duplicate hold)...");
    await cliRequest("post", "/webhooks/baas/mock", {
      type: "CARD_AUTH",
      id: `${authEventId}_dup`,
      txId: authId,
      cardId,
      amountMinor,
      currency,
      occurredAt: new Date().toISOString(),
    });
    const afterDupAuth = await getHolds(walletId);
    const dupCount = afterDupAuth.filter((h) => h.providerAuthId === authId).length;
    if (dupCount !== 1) {
      throw new Error(`Duplicate auth created ${dupCount} holds (expected 1)`);
    }
    logStep("   -> Duplicate auth did not create additional holds.");

    // 3) Clearing without authId (missing hold) should not throw; hold remains PENDING
    logStep("Sending CARD_CLEARING with unrelated authId (expect warning, no status change)...");
    await cliRequest("post", "/webhooks/baas/mock", {
      type: "CARD_CLEARING",
      id: `${clearEventId}_orphan`,
      txId: `${clearTxId}_orphan`,
      authId: "unknown_auth",
      cardId,
      amountMinor,
      currency,
      occurredAt: new Date().toISOString(),
    });
    const afterOrphanClear = await getHolds(walletId);
    const holdAfterOrphan = afterOrphanClear.find((h) => h.providerAuthId === authId);
    if (!holdAfterOrphan || holdAfterOrphan.status !== AuthHoldStatus.PENDING) {
      throw new Error("Hold status changed unexpectedly after orphan clearing");
    }
    logStep("   -> Orphan clearing did not change hold status.");

    // 4) Proper clearing with authId should clear the hold
    logStep("Sending CARD_CLEARING linked to auth (should clear hold)...");
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
    const afterClear = await getHolds(walletId);
    const holdAfterClear = afterClear.find((h) => h.providerAuthId === authId);
    if (!holdAfterClear || holdAfterClear.status !== AuthHoldStatus.CLEARED) {
      throw new Error("Hold not marked CLEARED after proper clearing");
    }
    logStep("   -> Hold marked CLEARED after proper clearing.");

    // 5) Duplicate clearing should leave hold CLEARED
    logStep("Sending duplicate CARD_CLEARING (should be idempotent for hold)...");
    await cliRequest("post", "/webhooks/baas/mock", {
      type: "CARD_CLEARING",
      id: `${clearEventId}_dup`,
      txId: clearTxId,
      authId,
      cardId,
      amountMinor,
      currency,
      occurredAt: new Date().toISOString(),
    });
    const afterDupClear = await getHolds(walletId);
    const holdAfterDupClear = afterDupClear.find((h) => h.providerAuthId === authId);
    if (!holdAfterDupClear || holdAfterDupClear.status !== AuthHoldStatus.CLEARED) {
      throw new Error("Hold status changed unexpectedly after duplicate clearing");
    }
    logStep("   -> Duplicate clearing left hold CLEARED (idempotent).");

    // Summary
    logStep(
      `   -> Holds snapshot: ${JSON.stringify(
        afterDupClear.filter((h) => h.providerAuthId === authId),
        null,
        2
      )}`
    );
    logStep("🎉 Edge case hold checks completed.");
  } catch (err: any) {
    console.error("❌ Flow failed:", err?.message ?? err);
    process.exit(1);
  }
}

main();
