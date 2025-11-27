// Simulate a Synctera webhook POST to the local server.
// Usage:
//   npx tsx src/tests/scripts/synctera/sendWebhook.ts <PERSON_ID> <VERIFICATION_STATUS> [EVENT_ID] [BASE_URL]
//
// Example:
//   npx tsx src/tests/scripts/synctera/sendWebhook.ts person_123 ACCEPTED mock_evt_1 http://localhost:3000

import dotenv from "dotenv";
import axios from "axios";
import crypto from "crypto";

dotenv.config();

if (!process.env.SYNCTERA_WEBHOOK_SECRET) {
  console.error("❌ SYNCTERA_WEBHOOK_SECRET is not set in .env");
  process.exit(1);
}

const secret: string = process.env.SYNCTERA_WEBHOOK_SECRET;
const defaultBaseUrl = "http://localhost:3000";

async function main() {
  const [personId, status, eventIdArg, baseUrlArg] = process.argv.slice(2);

  if (!personId || !status) {
    console.error(
      "Usage: tsx src/tests/scripts/synctera/sendWebhook.ts <PERSON_ID> <VERIFICATION_STATUS> [EVENT_ID] [BASE_URL]"
    );
    process.exit(1);
  }

  const eventId = eventIdArg || `mock_evt_${Date.now()}`;
  const baseUrl = baseUrlArg || defaultBaseUrl;

  const payload = {
    id: eventId,
    type: "VERIFICATION_STATUS",
    data: {
      person_id: personId,
      verification_status: status,
    },
  };

  const rawBody = JSON.stringify(payload);
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(rawBody);
  const signature = hmac.digest("hex");

  try {
    const res = await axios.post(`${baseUrl}/webhooks/synctera`, rawBody, {
      headers: {
        "Content-Type": "application/json",
        "X-Tnsa-Signature": signature,
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      validateStatus: () => true,
    });

    console.log(`➡️ Sent webhook to ${baseUrl}/webhooks/synctera`);
    console.log(`Status: ${res.status}`);
    console.log("Response:", res.data);
  } catch (err: any) {
    console.error("❌ Failed to send webhook");
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
