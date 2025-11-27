import { prisma } from "../../../core/db.js";
import { config } from "../../../core/config.js";
import { BaasProviderName } from "../../../generated/prisma/enums.js";
import { linkUserToSynctera } from "./userSyncteraService.js";
import {
  acceptDisclosures,
  activatePerson,
  getPersonVerificationStatus,
  runKyc,
} from "./personService.js";

export interface KycAddress {
  address_line_1: string;
  city: string;
  state: string;
  postal_code: string;
  country_code: string;
}

export interface KycInput {
  first_name: string;
  last_name: string;
  dob: string;
  phone_number: string;
  email: string;
  ssn: string;
  legal_address: KycAddress;
  disclosures?: Array<{ type: string; version: string }>;
  customer_ip_address?: string;
}

// Drives PROSPECT -> ACTIVE -> KYC verify for a user with a Synctera PERSON mapping.
export async function completeUserKyc(userId: string, input: KycInput) {
  if (!config.synctera.apiKey) {
    throw new Error("Synctera is not configured (SYNCTERA_API_KEY missing)");
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new Error("User not found");
  }

  // Ensure the user is linked to a Synctera PERSON (BaasCustomer)
  await linkUserToSynctera(user);

  const syncteraCustomer = await prisma.baasCustomer.findUnique({
    where: { userId },
  });

  if (!syncteraCustomer || syncteraCustomer.providerName !== BaasProviderName.SYNCTERA) {
    throw new Error("Synctera PERSON link not found for user");
  }

  const personId = syncteraCustomer.externalCustomerId;

  // Accept disclosures (use provided list or a default set)
  const disclosures =
    input.disclosures && input.disclosures.length > 0
      ? input.disclosures
      : [
          { type: "REG_DD", version: "1.0" },
          { type: "KYC_DATA_COLLECTION", version: "1.0" },
          { type: "REG_E", version: "1.0" },
          { type: "REG_CC", version: "1.0" },
          { type: "E_SIGN", version: "1.0" },
          { type: "PRIVACY_NOTICE", version: "1.0" },
          { type: "TERMS_AND_CONDITIONS", version: "1.0" },
        ];
  await acceptDisclosures(personId, disclosures);

  // Activate PERSON with provided KYC info
  await activatePerson({
    personId,
    first_name: input.first_name,
    last_name: input.last_name,
    dob: input.dob,
    phone_number: input.phone_number,
    email: input.email,
    ssn: input.ssn,
    legal_address: input.legal_address,
  });

  // Run KYC verification
  const verifyResult = await runKyc({
    personId,
    customer_ip_address: input.customer_ip_address || "127.0.0.1",
  });

  // Get the latest verification status
  const verificationStatus =
    (verifyResult as any).verification_status ||
    (await getPersonVerificationStatus(personId)) ||
    "PENDING";

  // Persist KYC status on user
  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: { kycStatus: verificationStatus },
  });

  return {
    personId,
    verificationStatus,
    user: updatedUser,
    verifyResult,
  };
}
