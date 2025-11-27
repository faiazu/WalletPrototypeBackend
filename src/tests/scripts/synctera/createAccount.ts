// Creates a Synctera CHECKING account for a given customer.
// Usage:
//   npx tsx src/tests/scripts/synctera/createAccount.ts <CUSTOMER_ID> [CURRENCY] [TEMPLATE_ID]

import dotenv from "dotenv";
import axios from "axios";

dotenv.config();

const token = process.env.SYNCTERA_API_KEY;
const baseURL =
  process.env.SYNCTERA_BASE_URL || "https://api-sandbox.synctera.com/v0";

if (!token) {
  console.error("❌ SYNCTERA_API_KEY is not set in .env");
  process.exit(1);
}

const client = axios.create({
  baseURL,
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
});

async function main() {
  const [customerId, currency = "CAD"] = process.argv.slice(2);

  if (!customerId) {
    console.error(
      "Usage: tsx src/tests/scripts/synctera/createAccount.ts <CUSTOMER_ID> [CURRENCY]"
    );
    process.exit(1);
  }

  try {
    const payload = {
      account_type: "CHECKING",
      account_template_id: "03e76ead-f3bd-48c3-8bf4-150a7d3502ea", // Standard Checking Account
      currency,
      relationships: [
        {
          relationship_type: "PRIMARY_ACCOUNT_HOLDER",
          customer_id: customerId,
        },
      ],
    };

    const res = await client.post("/accounts", payload);
    console.log(`✅ Account created. Status: ${res.status}`);
    console.log(JSON.stringify(res.data, null, 2));
  } 
  catch (err: any) {
    console.error("❌ Synctera account creation failed");
    if (err.response) {
      console.error("Status:", err.response.status);
      console.error("Body:", err.response.data);
    } else {
      console.error(err.message || err);
    }
    process.exit(1);
  }
}

main();
