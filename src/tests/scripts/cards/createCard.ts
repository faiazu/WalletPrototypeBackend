// Create a card for the authenticated user on a given wallet.
// Usage:
//   npx tsx src/tests/scripts/cards/createCard.ts <TOKEN> <WALLET_ID>

import { cliRequest, handleCliError } from "../../helpers/cliHelper.js";

async function main() {
  try {
    const [token, walletId] = process.argv.slice(2);

    if (!token || !walletId) {
      console.error("Usage: tsx src/tests/scripts/cards/createCard.ts <TOKEN> <WALLET_ID>");
      process.exit(1);
    }

    const result = await cliRequest(
      "post",
      `/wallets/${walletId}/cards`,
      {},
      token
    );

    console.log("✅ Card created:");
    console.log(JSON.stringify(result, null, 2));
  } catch (err: any) {
    handleCliError(err);
  }
}

main();
