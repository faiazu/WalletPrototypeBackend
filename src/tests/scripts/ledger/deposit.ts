// script to test depositing funds into a wallet via the deposit route

import { cliRequest, handleCliError } from "../../helpers/cliHelper.js";

/**
 * Deposits funds into a wallet using the deposit route.
 * Usage:
 *   npx tsx src/tests/scripts/ledger/deposit.ts <TOKEN> <WALLET_ID> <AMOUNT>
 */
async function main() {
  try {
    const [token, walletId, amountStr] = process.argv.slice(2);

    if (!token || !walletId || !amountStr) {
      console.error("Usage: tsx src/tests/scripts/ledger/deposit.ts <TOKEN> <WALLET_ID> <AMOUNT>");
      process.exit(1);
    }

    const amount = Number(amountStr);

    const result = await cliRequest(
      "post",
      `/ledger/${walletId}/deposit`,
      { amount: amount },
      token
    );

    console.log("✅ Deposited funds:");
    console.log(JSON.stringify(result, null, 2));
  } catch (err: any) {
    handleCliError(err);
  }
}

main();
