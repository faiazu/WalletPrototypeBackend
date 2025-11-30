// Create a dev user, login, and submit a KYC-approved payload.
// Usage:
//   npx tsx src/tests/scripts/synctera/bootstrapApprovedUser.ts <EMAIL> "<NAME>" [BASE_URL]
//
// Requires backend running and .env loaded for BASE_URL (optional arg overrides).

import { cliRequest, getBaseUrl, handleCliError } from "../../helpers/cliHelper.js";

async function main() {
  try {
    const [emailArg, nameArg, baseArg] = process.argv.slice(2);
    if (!emailArg || !nameArg) {
      console.error(
        'Usage: tsx src/tests/scripts/synctera/bootstrapApprovedUser.ts <EMAIL> "<NAME>" [BASE_URL]'
      );
      process.exit(1);
    }

    if (baseArg) {
      process.env.BASE_URL = baseArg;
    }
    const baseURL = getBaseUrl();
    const email = emailArg;
    const name = nameArg;

    console.log(`➡️  Base URL: ${baseURL}`);
    console.log(`➡️  User: ${email} (${name})`);

    // 1) Create user (mock register)
    const register = await cliRequest("post", "/test/auth/mock-register", {
      email,
      name,
    });
    console.log("✅ User created (mock-register):", register.user?.id || register.userId || "");

    // 2) Login to get token
    const login = await cliRequest<{ token: string }>("post", "/test/auth/mock-login", { email });
    const token = login.token;
    if (!token) throw new Error("Login did not return token");
    console.log("✅ Logged in (mock-login), token acquired");

    // 3) Submit KYC with approved-ish payload (from docs/api.md sample)
    const kycPayload = {
      first_name: "Christopher",
      last_name: "Albertson",
      dob: "1985-06-14",
      phone_number: "+16045551212",
      email,
      ssn: "456-78-9999",
      legal_address: {
        address_line_1: "123 Main St.",
        city: "Beverly Hills",
        state: "CA",
        postal_code: "90210",
        country_code: "US",
      },
      disclosures: [{ type: "REG_DD", version: "1.0" }],
      customer_ip_address: "184.233.47.237",
    };

    const kyc = await cliRequest("post", "/onboarding/kyc", kycPayload, token);
    console.log("✅ KYC submitted. Status:", kyc.verificationStatus);

    console.log(
      JSON.stringify(
        {
          baseURL,
          email,
          token,
          personId: kyc.personId,
          verificationStatus: kyc.verificationStatus,
          user: kyc.user,
        },
        null,
        2
      )
    );
  } catch (err: any) {
    handleCliError(err);
  }
}

main();
