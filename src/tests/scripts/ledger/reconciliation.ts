import { cliRequest, handleCliError } from "../../helpers/cliHelper.js";

/**
 * Runs card-centric reconciliation (sum(member_equity) vs card_pool).
 * Usage:
 *   npx tsx src/tests/scripts/ledger/reconciliation.ts <TOKEN> <CARD_ID>
 */
async function main() {
  try {
    const [token, cardId] = process.argv.slice(2);

    if (!token || !cardId) {
      console.error("Usage: tsx src/tests/scripts/ledger/reconciliation.ts <TOKEN> <CARD_ID>");
      process.exit(1);
    }

    const result = await cliRequest(
      "get",
      `/ledger/cards/${cardId}/reconciliation`,
      undefined,
      token
    );

    console.log("🧐 Card reconciliation result:");
    console.log(JSON.stringify(result, null, 2));

    if (result.consistent) {
      console.log("✅ Card ledger is consistent.");
    } else {
      console.log("❌ Card ledger inconsistency detected!");
    }
  } catch (err: any) {
    handleCliError(err);
  }
}

main();
