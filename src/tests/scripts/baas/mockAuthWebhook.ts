// Sends a mock CARD_AUTH webhook and verifies the BaasEvent row is created.
// Usage:
//   npx tsx src/tests/scripts/baas/mockAuthWebhook.ts <EXTERNAL_CARD_ID> <AMOUNT_MINOR> [CURRENCY]

import { cliRequest } from "../../helpers/cliHelper.js";
import { prisma } from "../../../core/db.js";
import { BaasProviderName } from "../../../generated/prisma/enums.js";

async function main() {
  const [externalCardId, amountStr, currency = "CAD"] = process.argv.slice(2);

  if (!externalCardId || !amountStr) {
    console.error(
      "Usage: tsx src/tests/scripts/baas/mockAuthWebhook.ts <EXTERNAL_CARD_ID> <AMOUNT_MINOR> [CURRENCY]"
    );
    process.exit(1);
  }

  const amountMinor = Number(amountStr);
  if (Number.isNaN(amountMinor) || amountMinor <= 0) {
    console.error("Amount must be a positive number of minor units.");
    process.exit(1);
  }

  const providerEventId = `mock_auth_${Date.now()}`;
  const providerTransactionId = `mock_auth_tx_${Date.now()}`;

  const payload = {
    type: "CARD_AUTH",
    id: providerEventId,
    txId: providerTransactionId,
    cardId: externalCardId,
    amountMinor,
    currency,
    occurredAt: new Date().toISOString(),
  };

  try {
    console.log("➡️  Sending mock CARD_AUTH webhook...");
    await cliRequest("post", "/webhooks/baas/mock", payload);

    const event = await prisma.baasEvent.findUnique({
      where: {
        providerName_providerEventId: {
          providerName: BaasProviderName.MOCK,
          providerEventId,
        },
      },
    });

    console.log("✅ Auth webhook processed. BaasEvent stored:", Boolean(event));
  } catch (err: any) {
    console.error("❌ Auth webhook test failed:", err?.message ?? err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
