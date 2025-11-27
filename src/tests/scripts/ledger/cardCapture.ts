// script to test card capture via the MOCK ledger card capture route

import { cliRequest, handleCliError } from "../../helpers/cliHelper.js";

/**
 * Captures a card using the MOCK ledger card capture route.
 * Usage:
 *   npx tsx src/tests/scripts/ledger/cardCapture.ts <TOKEN> <WALLET_ID>
 */
async function main() {
  try {
    const [token, walletId] = process.argv.slice(2);

    if (!token || !walletId) {
      console.error("Usage: tsx src/tests/scripts/ledger/cardCapture.ts <TOKEN> <WALLET_ID>");
      process.exit(1);
    }

    // For testing purposes, use two fixed user IDs with hardcoded split amounts
    // TODO: replace userIds with actual user IDs from test database
    const splits = [
      { userId: "USER_ID_1", amount: 3000 },
      { userId: "USER_ID_2", amount: 3000 },
    ];

    const result = await cliRequest(
      "post",
      `/ledger/${walletId}/cardCapture`,
      { splits: splits },
      token
    );

    console.log("✅ Mock card capture result:");
    console.log(JSON.stringify(result, null, 2));
  } catch (err: any) {
    handleCliError(err);
  }
}

main();
