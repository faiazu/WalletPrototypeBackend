// Wipe Synctera sandbox data.
// Usage: npx tsx src/tests/scripts/synctera/wipeSandbox.ts
// Requires: SYNCTERA_API_KEY in env; optional SYNCTERA_BASE_URL (defaults to sandbox).

import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const apiKey = process.env.SYNCTERA_API_KEY;
const baseUrl = process.env.SYNCTERA_BASE_URL || "https://api-sandbox.synctera.com/v0";

async function main() {
  if (!apiKey) {
    console.error("Missing SYNCTERA_API_KEY in environment.");
    process.exit(1);
  }

  const url = `${baseUrl.replace(/\/+$/, "")}/wipe`;

  try {
    const res = await axios.post(
      url,
      {},
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );
    console.log("✅ Synctera sandbox wiped:", res.status, res.statusText);
  } catch (err: any) {
    console.error("❌ Failed to wipe Synctera sandbox");
    if (err?.response) {
      console.error("Status:", err.response.status);
      console.error("Body:", err.response.data);
    } else {
      console.error(err?.message || err);
    }
    process.exit(1);
  }
}

main();
