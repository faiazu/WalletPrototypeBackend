import { prisma } from "../../../core/db.js";
import { config } from "../../../core/config.js";
import { BaasProviderName } from "../../../generated/prisma/enums.js";
import type { User } from "../../../generated/prisma/client.js";
import {
  createProspectPerson,
  markPersonInactive,
} from "./personService.js";

export async function linkUserToSynctera(user: User): Promise<void> {
  if (!config.synctera.apiKey) return;

  // Already linked?
  const existing = await prisma.baasCustomer.findUnique({
    where: { userId: user.id },
  });
  if (existing && existing.providerName === BaasProviderName.SYNCTERA) {
    return;
  }

  try {
    const person = await createProspectPerson({ email: user.email });
    await prisma.baasCustomer.upsert({
      where: { userId: user.id },
      update: {
        externalCustomerId: person.id,
        providerName: BaasProviderName.SYNCTERA,
      },
      create: {
        userId: user.id,
        providerName: BaasProviderName.SYNCTERA,
        externalCustomerId: person.id,
      },
    });
    console.log(`[Synctera] Created prospect person ${person.id} for user ${user.id}`);
  } catch (err: any) {
    console.error(
      `[Synctera] Failed to create prospect person for user ${user.id}: ${err?.message || err}`
    );
    // TODO: add retry/alerting; leaving BaasCustomer unmapped for now.
  }
}

export async function deactivateSyncteraPersonForUser(userId: string): Promise<void> {
  if (!config.synctera.apiKey) return;

  const syncteraCustomer = await prisma.baasCustomer.findUnique({
    where: { userId },
  });

  if (!syncteraCustomer || syncteraCustomer.providerName !== BaasProviderName.SYNCTERA) {
    return;
  }

  try {
    await markPersonInactive(syncteraCustomer.externalCustomerId);
    console.log(
      `[Synctera] Marked person ${syncteraCustomer.externalCustomerId} INACTIVE for user ${userId}`
    );
  } catch (err: any) {
    console.error(
      `[Synctera] Failed to mark person ${syncteraCustomer.externalCustomerId} inactive: ${
        err?.message || err
      }`
    );
    // TODO: add retry/alerting; best-effort only.
  }
}
