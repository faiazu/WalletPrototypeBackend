import { cliRequest } from "../../helpers/cliHelper.js";

/**
 * Logs in (mock) and returns a JWT token.
 * Usage:
 *   npx ts-node src/tests/scripts/users/loginUser.ts test@example.com
 */
async function main() {
  const [email] = process.argv.slice(2);

  if (!email) {
    console.error("Usage: ts-node src/tests/scripts/users/loginUser.ts <EMAIL>");
    process.exit(1);
  }

  const result = await cliRequest(
    "post",
    "/test/auth/mock-login",
    { email }
  );

  console.log("✅ Mock login successful:");
  console.log(JSON.stringify(result, null, 2));
  console.log("\n🔑 TOKEN:");
  console.log(result.token);
}

main();
