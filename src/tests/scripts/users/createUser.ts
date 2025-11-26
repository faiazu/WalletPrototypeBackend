// Script to test creating a user via the mock register route

import { cliRequest } from "../../helpers/cliHelper.js";

/**
 * Creates a user via dev mock route.
 * Usage:
 *   npx ts-node src/tests/scripts/users/createUser.ts test@example.com "Test User"
 */
async function main() {
  const [email, name] = process.argv.slice(2);

  if (!email || !name) {
    console.error('Usage: ts-node src/tests/scripts/users/createUser.ts <EMAIL> "<NAME>"');
    process.exit(1);
  }

  const result = await cliRequest(
    "post",
    "/test/auth/mock-register",
    { email, name }
  );

  console.log("✅ User created (via mock-register route):");
  console.log(JSON.stringify(result, null, 2));
}

main();
