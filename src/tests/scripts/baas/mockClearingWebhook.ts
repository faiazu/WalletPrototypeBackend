// Sends a mock CARD_CLEARING webhook and checks BaasEvent + ledger entries.
// Usage:
//   npx tsx src/tests/scripts/baas/mockClearingWebhook.ts <WALLET_ID> <EXTERNAL_CARD_ID> <AMOUNT_MINOR> [CURRENCY]
// Example:
//   npx tsx src/tests/scripts/baas/mockClearingWebhook.ts 0000-... mock_card_user123 2500 USD

import { cliRequest } from "../../helpers/cliHelper.js";
import { prisma } from "../../../core/db.js";
import { BaasProviderName } from "../../../generated/prisma/enums.js";

async function main() {
  const [walletId, externalCardId, amountStr, currency = "CAD"] =
    process.argv.slice(2);

  if (!walletId || !externalCardId || !amountStr) {
    console.error(
      "Usage: tsx src/tests/scripts/baas/mockClearingWebhook.ts <WALLET_ID> <EXTERNAL_CARD_ID> <AMOUNT_MINOR> [CURRENCY]"
    );
    process.exit(1);
  }

  const amountMinor = Number(amountStr);
  if (Number.isNaN(amountMinor) || amountMinor <= 0) {
    console.error("Amount must be a positive number of minor units (e.g., cents).");
    process.exit(1);
  }

  const providerEventId = `mock_evt_${Date.now()}`;
  const providerTransactionId = `mock_tx_${Date.now()}`;

  const payload = {
    type: "CARD_CLEARING",
    id: providerEventId,
    txId: providerTransactionId,
    cardId: externalCardId,
    amountMinor,
    currency,
    occurredAt: new Date().toISOString(),
  };

  try {
    console.log("➡️  Sending mock CARD_CLEARING webhook...");
    await cliRequest("post", "/webhooks/baas/mock", payload);

    const event = await prisma.baasEvent.findUnique({
      where: {
        providerName_providerEventId: {
          providerName: BaasProviderName.MOCK,
          providerEventId,
        },
      },
    });

    const entries = await prisma.ledgerEntry.findMany({
      where: { transactionId: providerTransactionId },
    });

    console.log("✅ First delivery processed.");
    console.log(`   BaasEvent stored: ${event ? "yes" : "no"}`);
    console.log(`   Ledger entries for tx ${providerTransactionId}: ${entries.length}`);

    console.log("➡️  Sending duplicate webhook to test idempotency...");
    await cliRequest("post", "/webhooks/baas/mock", payload);

    const entriesAfterDup = await prisma.ledgerEntry.findMany({
      where: { transactionId: providerTransactionId },
    });

    console.log("✅ Duplicate delivery handled.");
    console.log(
      `   Ledger entries remain: ${entriesAfterDup.length} (should match first call)`
    );

    if (entriesAfterDup.length !== entries.length) {
      console.warn("⚠️  Idempotency check failed: entry counts differ.");
    } else {
      console.log("🎯 Idempotency verified: no extra ledger postings on duplicate.");
    }
  } catch (err: any) {
    console.error("❌ Test failed:", err?.message ?? err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
