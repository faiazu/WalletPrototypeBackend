import { getSyncteraClient } from "./syncteraClient.js";
import { Debugger } from "../../../core/debugger.js";

export interface CreateProspectPersonInput {
  email: string;
}

export interface SyncteraPerson {
  id: string;
  status: string;
  email?: string;
  verification_status?: string;
  [key: string]: unknown;
}

export async function createProspectPerson(
  input: CreateProspectPersonInput
): Promise<SyncteraPerson> {
  const payload = {
    status: "PROSPECT",
    email: input.email,
    is_customer: true,
  };

  const client = getSyncteraClient();
  const res = await client.post("/persons", payload);
  return res.data as SyncteraPerson;
}

export async function markPersonInactive(personId: string): Promise<SyncteraPerson> {
  const payload = {
    status: "INACTIVE",
  };

  const client = getSyncteraClient();
  const res = await client.patch(`/persons/${personId}`, payload);
  return res.data as SyncteraPerson;
}

// Accept one or more disclosures for a PERSON.
export interface DisclosureAcceptance {
  type: string;
  version: string;
}

export async function acceptDisclosures(
  personId: string,
  disclosures: DisclosureAcceptance[]
): Promise<void> {
  const client = getSyncteraClient();

  for (const disclosure of disclosures) {
    const payload = {
      person_id: personId,
      type: disclosure.type,
      version: disclosure.version,
      event_type: "ACKNOWLEDGED",
      disclosure_date: new Date().toISOString(),
    };
    await client.post("/disclosures", payload);
  }
}

// Activate a PERSON with KYC details
export interface ActivatePersonInput {
  personId: string;
  first_name: string;
  last_name: string;
  dob: string; // ISO date string
  phone_number: string;
  email: string;
  ssn?: string;
  legal_address: {
    address_line_1: string;
    city: string;
    state: string;
    postal_code: string;
    country_code: string;
  };
}

export async function activatePerson(input: ActivatePersonInput): Promise<SyncteraPerson> {
  const { personId, ...body } = input;
  const payload = {
    status: "ACTIVE",
    ...body,
  };

  const client = getSyncteraClient();
  try {
  const res = await client.patch(`/persons/${personId}`, payload);
    Debugger.logInfo(`[Synctera] Activated person ${personId}`);
  return res.data as SyncteraPerson;
  } catch (err: any) {
    Debugger.logError(`[Synctera] Failed to activate person ${personId}: ${err.message}`);
    if (err.response?.data) {
      Debugger.logJSON("[Synctera] Activation error details", err.response.data);
    }
    throw err;
  }
}

// Run KYC verification for a PERSON
export interface RunKycInput {
  personId: string;
  customer_ip_address: string;
  verification_types?: string[]; // default KYC_BASIC if omitted
}

export async function runKyc(input: RunKycInput): Promise<any> {
  const client = getSyncteraClient();
  const payload = {
    customer_consent: true,
    customer_ip_address: input.customer_ip_address,
    person_id: input.personId,
    verification_types: input.verification_types ?? ["KYC_BASIC"],
  };

  try {
  const res = await client.post("/verifications/verify", payload);
    Debugger.logInfo(`[Synctera] KYC verification initiated for person ${input.personId}`);
  return res.data;
  } catch (err: any) {
    Debugger.logError(`[Synctera] KYC verification failed for person ${input.personId}: ${err.message}`);
    if (err.response?.data) {
      Debugger.logJSON("[Synctera] KYC error details", err.response.data);
    }
    throw err;
  }
}

export async function getPerson(personId: string): Promise<SyncteraPerson> {
  const client = getSyncteraClient();
  const res = await client.get(`/persons/${personId}`);
  return res.data as SyncteraPerson;
}

export async function getPersonVerificationStatus(personId: string): Promise<string | null> {
  const person = await getPerson(personId);
  return person.verification_status ?? null;
}
