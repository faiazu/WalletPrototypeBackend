import { Debugger } from "../../../core/debugger.js";
import { config } from "../../../core/config.js";
import {
  BaasProviderName,
} from "../../../generated/prisma/enums.js";
import type {
  BaasClient,
  CreateAccountParams,
  CreateAccountResult,
  CreateCardParams,
  CreateCardResult,
  CreateCustomerParams,
  CreateCustomerResult,
} from "../baasClient.js";
import { createProspectPerson } from "./personService.js";
import { getSyncteraClient } from "./syncteraClient.js";

/**
 * Synctera implementation of BaasClient for customer, account, and card creation.
 */
export class SyncteraBaasClient implements BaasClient {
  private provider = BaasProviderName.SYNCTERA;

  async createCustomer(params: CreateCustomerParams): Promise<CreateCustomerResult> {
    const person = await createProspectPerson({ email: params.email });

    Debugger.logInfo(
      `[SyncteraBaasClient] Created PERSON prospect ${person.id} for user ${params.userId}`
    );

    return {
      provider: this.provider,
      externalCustomerId: person.id,
    };
  }

  async createAccount(params: CreateAccountParams): Promise<CreateAccountResult> {
    const client = getSyncteraClient();
    const accountType = params.accountType ?? "CHECKING";
    const currency =
      params.currency ??
      config.synctera.defaultAccountCurrency ??
      "USD";

    const payload: any = {
      account_type: accountType,
      currency,
      relationships: [
        {
          relationship_type: "PRIMARY_ACCOUNT_HOLDER",
          customer_id: params.externalCustomerId,
        },
      ],
      // Enable core rails so downstream card issuance/funding works.
      is_card_enabled: true,
      is_ach_enabled: true,
      is_external_card_enabled: true,
    };

    const accountTemplateId =
      params.accountTemplateId ?? config.synctera.accountTemplateId;
    if (accountTemplateId) {
      payload.account_template_id = accountTemplateId;
    }

    const res = await client.post("/accounts", payload);
    const data = res.data ?? {};

    Debugger.logInfo(
      `[SyncteraBaasClient] Created account ${data.id} for customer ${params.externalCustomerId}`
    );

    return {
      provider: this.provider,
      externalAccountId: data.id,
      status: data.status ?? data.access_status,
      accessStatus: data.access_status,
      accountType: data.account_type ?? accountType,
      currency: data.currency ?? currency,
      accountNumberLast4:
        data.account_number_masked ??
        (typeof data.account_number === "string"
          ? data.account_number.slice(-4)
          : undefined),
      routingNumber: data.bank_routing,
      rawResponse: data,
    };
  }

  async createCard(params: CreateCardParams): Promise<CreateCardResult> {
    if (!params.externalAccountId) {
      throw new Error("Synctera card issuance requires externalAccountId");
    }

    const cardProductId =
      params.cardProductId ?? config.synctera.cardProductId;
    if (!cardProductId) {
      throw new Error(
        "Synctera card issuance requires cardProductId (set SYNCTERA_CARD_PRODUCT_ID)"
      );
    }

    const client = getSyncteraClient();
    const payload: any = {
      card_product_id: cardProductId,
      type: params.cardType ?? "VIRTUAL",
      customer_id: params.externalCustomerId,
      account_id: params.externalAccountId,
      status: "ACTIVE",
    };

    const res = await client.post("/cards", payload);
    const data = res.data ?? {};

    Debugger.logInfo(
      `[SyncteraBaasClient] Issued card ${data.id ?? data.card_id ?? "unknown"} for customer ${params.externalCustomerId}`
    );

    return {
      provider: this.provider,
      externalCardId: data.id ?? data.card_id ?? data.token,
      last4: data.pan_last_four ?? data.last4 ?? data.last_four,
      status: data.status ?? "ACTIVE",
    };
  }
}
