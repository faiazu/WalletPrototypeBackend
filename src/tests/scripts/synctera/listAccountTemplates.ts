// Lists Synctera account templates.
// Usage:
//   npx tsx src/tests/scripts/synctera/listAccountTemplates.ts [ACCOUNT_TYPE]

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
  const [accountType] = process.argv.slice(2);

  try {
    const res = await client.get("/accounts/templates", {
      params: accountType ? { account_type: accountType } : undefined,
    });
    console.log(`✅ Templates fetched. Status: ${res.status}`);
    console.log(JSON.stringify(res.data, null, 2));
  } catch (err: any) {
    console.error("❌ Failed to list account templates");
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
