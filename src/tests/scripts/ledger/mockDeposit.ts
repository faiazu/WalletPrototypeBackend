// Deposit funds into a wallet via the ledger route.
// Usage:
//   npx tsx src/tests/scripts/ledger/mockDeposit.ts <TOKEN> <WALLET_ID> <AMOUNT_MINOR>

import { cliRequest, handleCliError } from "../../helpers/cliHelper.js";

async function main() {
  try {
    const [token, walletId, amountStr] = process.argv.slice(2);

    if (!token || !walletId || !amountStr) {
      console.error("Usage: tsx src/tests/scripts/ledger/mockDeposit.ts <TOKEN> <WALLET_ID> <AMOUNT_MINOR>");
      process.exit(1);
    }

    const amount = Number(amountStr);
    if (Number.isNaN(amount) || amount <= 0) {
      console.error("Amount must be a positive number (minor units, e.g., cents).");
      process.exit(1);
    }

    const result = await cliRequest(
      "post",
      `/ledger/${walletId}/deposit`,
      { amount },
      token
    );

    console.log("✅ Mock deposit result:");
    console.log(JSON.stringify(result, null, 2));
  } catch (err: any) {
    handleCliError(err);
  }
}

main();
