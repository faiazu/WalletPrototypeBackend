// Calls the onboarding KYC endpoint with a payload that should pass sandbox KYC.
// Usage:
//   npx tsx src/tests/scripts/synctera/testOnboardingKycApproved.ts <TOKEN> [BASE_URL]

import { cliRequest, getBaseUrl } from "../../helpers/cliHelper.js";

async function main() {
  const [tokenArg, baseArg] = process.argv.slice(2);

  if (!tokenArg) {
    console.error("Usage: tsx src/tests/scripts/synctera/testOnboardingKycApproved.ts <TOKEN> [BASE_URL]");
    process.exit(1);
  }

  const baseURL = baseArg || getBaseUrl();
  const token = tokenArg;

  // Sample KYC payload expected to succeed in sandbox (US data)
  const payload = {
    status: "ACTIVE",
    first_name: "Christopher",
    last_name: "Albertson",
    dob: "1985-06-14",
    phone_number: "+16045551212",
    email: `chris.${Date.now()}@example.com`,
    ssn: "456-78-9999",
    legal_address: {
      address_line_1: "123 Main St.",
      city: "Beverly Hills",
      state: "CA",
      postal_code: "90210",
      country_code: "US",
    },
    customer_ip_address: "184.233.47.237",
  };

  try {
    const res = await cliRequest(
      "post",
      "/onboarding/kyc",
      payload,
      token,
    );

    console.log("✅ KYC request sent (approved sample):");
    console.log(JSON.stringify(res, null, 2));
  } catch (err) {
    process.exit(1);
  }
}

main();
