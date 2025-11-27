// Simple connectivity check to Synctera sandbox.
// Usage:
//   npx tsx src/tests/scripts/synctera/helloSynctera.ts

import dotenv from "dotenv";
import axios from "axios";

dotenv.config();

const token = process.env.SYNCTERA_API_KEY;
const baseURL = process.env.SYNCTERA_BASE_URL;

if (!token) {
  console.error("❌ SYNCTERA_API_KEY is not set in .env");
  process.exit(1);
}

if (!baseURL) {
  console.error("❌ SYNCTERA_BASE_URL is not set in .env");
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
    const res = await client.get("/customers");
    console.log(`✅ Synctera response status: ${res.status}`);
    console.log(JSON.stringify(res.data, null, 2));
  } catch (err: any) {
    console.error("❌ Synctera request failed");
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
