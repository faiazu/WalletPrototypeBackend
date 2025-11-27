// script to test withdrawing funds from a wallet via the MOCK withdraw route

import { cliRequest, handleCliError } from "../../helpers/cliHelper.js";

/**
 * Withdraws funds from a wallet using the MOCK withdraw route.
 * Usage:
 *   npx tsx src/tests/scripts/ledger/withdrawl.ts <TOKEN> <WALLET_ID> <AMOUNT>
 */
async function main() {
  try {
    const [token, walletId, amountStr] = process.argv.slice(2);

    if (!token || !walletId || !amountStr) {
      console.error("Usage: tsx src/tests/scripts/ledger/withdrawl.ts <TOKEN> <WALLET_ID> <AMOUNT>");
      process.exit(1);
    }

    const amount = Number(amountStr);

    const result = await cliRequest(
      "post",
      `/ledger/${walletId}/withdraw`,
      { amount: amount },
      token
    );

    console.log("✅ Withdrew funds:");
    console.log(JSON.stringify(result, null, 2));
  } catch (err: any) {
    handleCliError(err);
  }
}

main();
