// Creates a Synctera webhook secret via API.
// Usage:
//   npx tsx src/tests/scripts/synctera/createWebhookSecret.ts

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
  try {
    const res = await client.post("/webhook_secrets");
    console.log(`✅ Webhook secret created. Status: ${res.status}`);
    console.log(JSON.stringify(res.data, null, 2));
    console.log(
      "\n✅ Webhook Signature Secret: " + res.data.secret
    );
  } 
  catch (err: any) {
    console.error("❌ Failed to create webhook secret");
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
