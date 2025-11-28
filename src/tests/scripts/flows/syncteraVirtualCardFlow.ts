// End-to-end flow: create user (mock), login, KYC, create wallet, issue virtual card, get widget URL.
// Usage:
//   npx tsx src/tests/scripts/flows/syncteraVirtualCardFlow.ts <EMAIL> "<NAME>" [BASE_URL]

import { cliRequest, getBaseUrl, handleCliError } from "../../helpers/cliHelper.js";

async function main() {
  try {
    const [emailArg, nameArg, baseArg] = process.argv.slice(2);
    if (!emailArg || !nameArg) {
      console.error(
        'Usage: tsx src/tests/scripts/flows/syncteraVirtualCardFlow.ts <EMAIL> "<NAME>" [BASE_URL]'
      );
      process.exit(1);
    }

    if (baseArg) {
      process.env.BASE_URL = baseArg;
    }

    const email = emailArg;
    const name = nameArg;
    const baseURL = getBaseUrl();

    console.log(`➡️  Base URL: ${baseURL}`);
    console.log(`➡️  User: ${email} (${name})`);

    // 1) Create user via mock register
    const userCreate = await cliRequest("post", "/test/auth/mock-register", {
      email,
      name,
    });
    console.log("✅ User created (mock-register):", userCreate.user?.id || userCreate.userId || "");

    // 2) Login via mock-login to get token
    const login = await cliRequest("post", "/test/auth/mock-login", { email });
    const token = (login as any).token;
    if (!token) {
      throw new Error("Login did not return a token");
    }
    console.log("✅ Logged in (mock-login), token acquired");

    // 3) KYC
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
      customer_ip_address: "184.233.47.237",
    };
    const kyc = await cliRequest("post", "/onboarding/kyc", kycPayload, token);
    console.log("✅ KYC submitted. Status:", kyc.verificationStatus);

    // 4) Create wallet
    const walletName = `Synctera Wallet ${Date.now()}`;
    const wallet = await cliRequest("post", "/wallet/create", { name: walletName }, token);
    const walletId = wallet?.wallet?.id || wallet?.walletId || wallet?.id;
    if (!walletId) throw new Error("Wallet creation did not return walletId");
    console.log("✅ Wallet created:", walletId);

    // 5) Issue card
    const card = await cliRequest(
      "post",
      `/wallets/${walletId}/cards`,
      {},
      token
    );
    const externalCardId = card?.externalCardId || card?.cardId || card?.id;
    console.log("✅ Card issued:", externalCardId, "last4:", card?.last4, "status:", card?.status);

    if (!externalCardId) {
      throw new Error("Card issuance did not return externalCardId");
    }

    // 6) Widget URL (set_pin)
    const widget = await cliRequest(
      "get",
      `/cards/${externalCardId}/widget-url?widgetType=set_pin`,
      undefined,
      token
    );
    console.log("✅ Widget URL (set_pin):", widget?.url);

    console.log("\n🎯 Flow complete.");
    console.log(JSON.stringify({ walletId, externalCardId, widgetUrl: widget?.url }, null, 2));
  } catch (err: any) {
    handleCliError(err);
  }
}

main();
