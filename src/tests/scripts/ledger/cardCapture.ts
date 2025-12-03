// script to test card capture via the card-centric capture route

import { cliRequest, handleCliError } from "../../helpers/cliHelper.js";

/**
 * Captures a card transaction using the card-centric capture route.
 * Usage:
 *   npx tsx src/tests/scripts/ledger/cardCapture.ts <TOKEN> <CARD_ID> <USER_ID_1> <AMOUNT_1> [<USER_ID_2> <AMOUNT_2> ...]
 */
async function main() {
  try {
    const [token, cardId, ...splitArgs] = process.argv.slice(2);

    if (!token || !cardId || splitArgs.length < 2) {
      console.error("Usage: tsx src/tests/scripts/ledger/cardCapture.ts <TOKEN> <CARD_ID> <USER_ID_1> <AMOUNT_1> [<USER_ID_2> <AMOUNT_2> ...]");
      console.error("Example: tsx src/tests/scripts/ledger/cardCapture.ts <TOKEN> card123 user1 3000 user2 3000");
      process.exit(1);
    }

    // Parse splits from arguments (userId, amount pairs)
    const splits = [];
    for (let i = 0; i < splitArgs.length; i += 2) {
      if (i + 1 >= splitArgs.length) break;
      splits.push({
        userId: splitArgs[i],
        amount: Number(splitArgs[i + 1]),
      });
    }

    if (splits.length === 0) {
      console.error("Error: No valid splits provided");
      process.exit(1);
    }

    const result = await cliRequest(
      "post",
      `/ledger/cards/${cardId}/capture`,
      { splits: splits },
      token
    );

    console.log("✅ Card capture result:");
    console.log(JSON.stringify(result, null, 2));
  } catch (err: any) {
    handleCliError(err);
  }
}

main();
