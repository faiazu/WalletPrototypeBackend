// script to test withdrawing funds from a card via the card-centric withdraw route

import { cliRequest, handleCliError } from "../../helpers/cliHelper.js";

/**
 * Withdraws funds from a card using the card-centric withdraw route.
 * Usage:
 *   npx tsx src/tests/scripts/ledger/withdrawl.ts <TOKEN> <CARD_ID> <AMOUNT>
 */
async function main() {
  try {
    const [token, cardId, amountStr] = process.argv.slice(2);

    if (!token || !cardId || !amountStr) {
      console.error("Usage: tsx src/tests/scripts/ledger/withdrawl.ts <TOKEN> <CARD_ID> <AMOUNT>");
      process.exit(1);
    }

    const amount = Number(amountStr);

    const result = await cliRequest(
      "post",
      `/ledger/cards/${cardId}/withdraw`,
      { amount: amount },
      token
    );

    console.log("✅ Withdrew funds from card:");
    console.log(JSON.stringify(result, null, 2));
  } catch (err: any) {
    handleCliError(err);
  }
}

main();
