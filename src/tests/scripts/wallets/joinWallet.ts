// script to test joining a wallet via the join wallet route

import { cliRequest } from "../../helpers/cliHelper.js";

/**
 * Authenticated user joins an existing wallet.
 * Usage:
 *   npx tsx src/tests/scripts/wallets/joinWallet.ts <TOKEN> <WALLET_ID>
 */
async function main() {
  const [token, walletId] = process.argv.slice(2);

  if (!token || !walletId) {
    console.error("Usage: tsx src/tests/scripts/wallets/joinWallet.ts <TOKEN> <WALLET_ID>");
    process.exit(1);
  }

  const result = await cliRequest(
    "post",
    `/wallet/${walletId}/join`,
    {},
    token
  );

  console.log("✅ Joined wallet:");
  console.log(JSON.stringify(result, null, 2));
}

main();
