// Script to list users via the mock users route

import { cliRequest, handleCliError } from "../../helpers/cliHelper.js";

/**
 * Lists all users via dev mock route.
 * Usage:
 *   npx tsx src/tests/scripts/users/listUsers.ts
 */
async function main() {
  try {
    const result = await cliRequest(
      "get",
      "/test/auth/users"
    );

    console.log("👥 Users:");
    console.log(JSON.stringify(result, null, 2));
  } catch (err: any) {
    handleCliError(err);
  }
}

main();
