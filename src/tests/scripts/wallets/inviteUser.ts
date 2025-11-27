// script to test inviting a user to a wallet via the invite-user route

import { cliRequest } from "../../helpers/cliHelper.js";

/**
 * Admin invites another user by email to a wallet.
 * Usage:
 *   npx tsx src/tests/scripts/wallets/inviteUser.ts <TOKEN> <WALLET_ID> invitee@example.com
 *   TOKEN: Auth token of the admin user
 *   WALLET_ID: ID of the wallet to invite the user to
 */
async function main() {
  const [token, walletId, email] = process.argv.slice(2);

  if (!token || !walletId || !email) {
    console.error("Usage: tsx src/tests/scripts/wallets/inviteUser.ts <TOKEN> <WALLET_ID> <EMAIL>");
    process.exit(1);
  }

  const result = await cliRequest(
    "post",
    `/wallet/${walletId}/invite`,
    { email },
    token
  );

  console.log("✅ Invited user to wallet:");
  console.log(JSON.stringify(result, null, 2));
}

main();
