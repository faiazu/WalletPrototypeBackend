// Calls the onboarding KYC endpoint with sample data.
// Usage:
//   npx tsx src/tests/scripts/synctera/testOnboardingKyc.ts <TOKEN> [BASE_URL]
//
// Example:
//   npx tsx src/tests/scripts/synctera/testOnboardingKyc.ts eyJhbGciOi... http://localhost:3000

import { cliRequest, getBaseUrl } from "../../helpers/cliHelper.js";

async function main() {
  const [tokenArg, baseArg] = process.argv.slice(2);

  if (!tokenArg) {
    console.error("Usage: tsx src/tests/scripts/synctera/testOnboardingKyc.ts <TOKEN> [BASE_URL]");
    process.exit(1);
  }

  const baseURL = baseArg || getBaseUrl();
  const token = tokenArg;

  // Sample KYC payload; adjust to real user data
  const payload = {
    first_name: "Test",
    last_name: "User",
    dob: "1990-01-01",
    phone_number: "+14165550000",
    email: `test.user.${Date.now()}@example.com`,
    ssn: "456-78-9999",
    legal_address: {
      address_line_1: "123 Main St",
      city: "Toronto",
      state: "ON",
      postal_code: "M5V1A1",
      country_code: "CA",
    },
    customer_ip_address: "127.0.0.1",
  };

  try {
    const res = await cliRequest(
      "post",
      "/onboarding/kyc",
      payload,
      token,
    );

    console.log("✅ KYC request sent:");
    console.log(JSON.stringify(res, null, 2));
  } catch (err) {
    // cliRequest already logs/throws; this is just to satisfy types
    process.exit(1);
  }
}

main();
