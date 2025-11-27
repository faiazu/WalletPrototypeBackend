// Script to test creating a wallet via the create wallet route

import { cliRequest, handleCliError } from "../../helpers/cliHelper.js";

/**
 * Creates a wallet for the authenticated user.
 * Usage:
 *   npx tsx src/tests/scripts/wallets/createWallet.ts <TOKEN> "Trip Wallet"
 */
async function main() {
  try {
    const [token, name] = process.argv.slice(2);

    if (!token || !name) {
      console.error('Usage: tsx src/tests/scripts/wallets/createWallet.ts <TOKEN> "<WALLET_NAME>"');
      process.exit(1);
    }

    const result = await cliRequest(
      "post",
      "/wallet/create",
      { name },
      token
    );

    console.log("✅ Wallet created:");
    console.log(JSON.stringify(result, null, 2));
  } catch (err: any) {
    handleCliError(err);
  }
}

main();
