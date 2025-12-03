// script to test depositing funds into a card via the card-centric deposit route

import { cliRequest, handleCliError } from "../../helpers/cliHelper.js";

/**
 * Deposits funds into a card using the card-centric deposit route.
 * Usage:
 *   npx tsx src/tests/scripts/ledger/deposit.ts <TOKEN> <CARD_ID> <AMOUNT>
 */
async function main() {
  try {
    const [token, cardId, amountStr] = process.argv.slice(2);

    if (!token || !cardId || !amountStr) {
      console.error("Usage: tsx src/tests/scripts/ledger/deposit.ts <TOKEN> <CARD_ID> <AMOUNT>");
      process.exit(1);
    }

    const amount = Number(amountStr);

    const result = await cliRequest(
      "post",
      `/ledger/cards/${cardId}/deposit`,
      { amount: amount },
      token
    );

    console.log("✅ Deposited funds to card:");
    console.log(JSON.stringify(result, null, 2));
  } catch (err: any) {
    handleCliError(err);
  }
}

main();
