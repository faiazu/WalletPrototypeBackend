// Walks a Synctera PERSON from PROSPECT -> signed disclosures -> ACTIVE -> KYC verify.
// Usage:
//   npx tsx src/tests/scripts/synctera/prospectToActive.ts

import dotenv from "dotenv";
import axios, { type AxiosInstance } from "axios";

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

const client: AxiosInstance = axios.create({
  baseURL,
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
});

// Create a PERSON with PROSPECT status.
async function createProspectPerson(): Promise<string> {
  const payload = {
    "status": "PROSPECT",
    "email": `testuser+${Date.now()}@example.com`,
    "is_customer": true,
  };

  const res = await client.post("/persons", payload);
  const id = res.data.id;

  if (!id) throw new Error("Customer ID not returned");
  console.log(`✅ Created prospect customer: ${id}`);
  return id;
}

// Sign a single disclosure for a PERSON.
async function signDisclosure(personId: string, disclosureType: string, disclosureVersion: string): Promise<void> {
  const payload = {
    "person_id": personId,
    "type": disclosureType,
    "version": disclosureVersion,
    "event_type": "ACKNOWLEDGED",
    "disclosure_date": new Date().toISOString(),
  };

  const disclosureResult = await client.post(
    `/disclosures`,
    payload
  );

  const disclosureID = disclosureResult.data.id;
  if (!disclosureID) throw new Error(`❌ Disclosure ${disclosureType} not returned`);

  console.log(`✅ Disclosure ${disclosureType} accepted for person with disclosure ID: ${disclosureID}`);
}

// Sign all required disclosures for a PERSON.
async function signDisclosures(personId: string): Promise<void> {
  const disclosures = [
    { type: "REG_DD", version: "1.0" },
    { type: "KYC_DATA_COLLECTION", version: "1.0" },
    { type: "REG_E", version: "1.0" },
    { type: "REG_CC", version: "1.0" },
    { type: "E_SIGN", version: "1.0" },
    { type: "PRIVACY_NOTICE", version: "1.0" },
    { type: "TERMS_AND_CONDITIONS", version: "1.0" },
  ]
  for (const disclosure of disclosures) {
    await signDisclosure(personId, disclosure.type, disclosure.version);
  }

  console.log("✅ All disclosures signed");
}

// Activate a PERSON by updating status and adding required info.
async function activatePerson(personId: string): Promise<void> {
  const payload = {
    "status": "ACTIVE",
    "first_name": "Christopher",
    "last_name": "Albertson",
    "dob": "1985-06-14",
    "phone_number": "+16045551212",
    "email": "chris@example.com",
    "ssn": "456-78-9999",
    "legal_address": {
      "address_line_1": "123 Main St.",
      "city": "Beverly Hills",
      "state": "CA",
      "postal_code": "90210",
      "country_code": "US"
    }
  }

  await client.patch(`/persons/${personId}`, payload);
  console.log("✅ Person activated with additional info");
}

async function getIpAddress(): Promise<string> {
  const res = await axios.get("https://api.ipify.org?format=json");
  return res.data.ip;
}

// Run KYC verification for a PERSON.
async function runKyc(personId: string, ipAddress: string): Promise<void> {
  const payload = {
    "customer_consent": true,
    "customer_ip_address": "184.233.47.237",
    "person_id": personId
  };

  const res = await client.post("/verifications/verify", payload);
  console.log(`✅ KYC verification requested. Status: ${res.status}`);
  console.log(JSON.stringify(res.data, null, 2));
}

async function getPerson(personId: string): Promise<any> {
  const res = await client.get(`/persons/${personId}`);
  return res.data;
}

async function getPersonKycStatus(personId: string): Promise<string> {
  const person = await getPerson(personId);
  if (!person) throw new Error("Person not found");
  if (!person.verification_status) throw new Error("Person verification status not found");
  console.log(`✅ Person KYC status: ${person.verification_status}`);
  return person.verification_status;
}

async function main() {
  try {
    const personId = await createProspectPerson();
    await signDisclosures(personId);
    await activatePerson(personId);
    await runKyc(personId, await getIpAddress());

    // Poll for KYC status until it's not PENDING.
    let kycStatus = await getPersonKycStatus(personId);
    const maxRetries = 10;
    let retries = 0;

    while (kycStatus === "PENDING" && retries < maxRetries) {
      console.log("⏳ KYC is still pending. Waiting 5 seconds before retrying...");
      await new Promise(res => setTimeout(res, 5000));
      kycStatus = await getPersonKycStatus(personId);
      retries++;
    }

    if (kycStatus != "ACCEPTED") {
      throw new Error(`KYC not approved. Final status: ${kycStatus}`);
    }

    console.log(`✅ KYC approved for person: ${personId}`);
    console.log("\n🎉 Synctera prospect -> active -> KYC flow completed.");
  } 
  catch (err: any) {
    console.error("❌ Synctera flow failed");
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
