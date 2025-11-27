// Creates a Synctera webhook subscription.
// Usage:
//   npx tsx src/tests/scripts/synctera/createWebhookSubscription.ts <WEBHOOK_URL> [EVENTS_COMMA_SEPARATED] [DESCRIPTION]
// Note: wrap wildcard args in quotes to avoid shell expansion, e.g. "VERIFICATION.*"
//
// Example:
//   npx tsx src/tests/scripts/synctera/createWebhookSubscription.ts https://<ngrok>.ngrok.io/webhooks/synctera VERIFICATION.* "Local test webhook"

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
  const [url, eventsArg, descriptionArg] = process.argv.slice(2);

  if (!url) {
    console.error(
      'Usage: tsx src/tests/scripts/synctera/createWebhookSubscription.ts <WEBHOOK_URL> [EVENTS_COMMA_SEPARATED] [DESCRIPTION]'
    );
    process.exit(1);
  }

  const enabledEvents = eventsArg
    ? eventsArg.split(",").map((e) => e.trim()).filter(Boolean)
    : ["ACCOUNT.*"];

  const description = descriptionArg || "Synctera webhook subscription";

  const payload = {
    url,
    description,
    enabled_events: enabledEvents,
    metadata: "divvi-webhook",
    is_enabled: true,
  };

  try {
    const res = await client.post("/webhooks", payload);
    console.log(`✅ Webhook subscription created. Status: ${res.status}`);
    console.log(JSON.stringify(res.data, null, 2));
  } catch (err: any) {
    console.error("❌ Failed to create webhook subscription");
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
