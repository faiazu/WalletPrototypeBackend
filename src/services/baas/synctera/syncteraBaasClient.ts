import { Debugger } from "../../../core/debugger.js";
import { config } from "../../../core/config.js";
import {
  BaasProviderName,
} from "../../../generated/prisma/enums.js";
import { randomUUID } from "crypto";
import type {
  BaasClient,
  CreateAccountParams,
  CreateAccountResult,
  CreateCardParams,
  CreateCardResult,
  CreateCustomerParams,
  CreateCustomerResult,
  InitiatePayoutParams,
  InitiatePayoutResult,
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
      // Enable card usage; avoid ACH/external card rails for this partner to prevent rule violation.
      is_card_enabled: true,
      is_ach_enabled: false,
      is_external_card_enabled: false,
    };

    const accountTemplateId =
      params.accountTemplateId ?? config.synctera.accountTemplateId;
    if (accountTemplateId) {
      payload.account_template_id = accountTemplateId;
    }

    let data: any;
    try {
      const res = await client.post("/accounts", payload);
      data = res.data ?? {};
    } catch (err: any) {
      const status = err?.response?.status;
      const body = err?.response?.data;
      Debugger.logError(`[SyncteraBaasClient] Account creation failed: status=${status}`);
      if (body) {
        Debugger.logJSON("[SyncteraBaasClient] Account creation response body", body);
      }
      throw err;
    }

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
      // Synctera schema expects: form (PHYSICAL|VIRTUAL) and type (DEBIT/CREDIT/PREPAID)
      form: "VIRTUAL",
      type: params.cardType ?? "PREPAID",
      customer_id: params.externalCustomerId,
      account_id: params.externalAccountId,
      emboss_name: params.embossName ? { line_1: params.embossName } : undefined,
      status: "ACTIVE",
    };

    let data: any;
    try {
      const res = await client.post("/cards", payload);
      data = res.data ?? {};
    } catch (err: any) {
      const status = err?.response?.status;
      const body = err?.response?.data;
      Debugger.logError(`[SyncteraBaasClient] Card issuance failed: status=${status}`);
      if (body) {
        Debugger.logJSON("[SyncteraBaasClient] Card issuance response body", body);
      }
      throw err;
    }
    const cardId = data.id ?? data.card_id ?? data.token;
    let finalStatus: string | undefined = data.card_status ?? data.status ?? "ACTIVE";

    // If the card comes back UNACTIVATED (some providers), activate immediately for smooth UX.
    if (cardId && finalStatus === "UNACTIVATED") {
      try {
        const idempotencyKey = randomUUID();
        const activationRes = await client.patch(
          `/cards/${cardId}`,
          { card_status: "ACTIVE" },
          { headers: { "Idempotency-Key": idempotencyKey } }
        );
        finalStatus =
          activationRes.data?.card_status ??
          activationRes.data?.status ??
          "ACTIVE";
        Debugger.logInfo(
          `[SyncteraBaasClient] Auto-activated card ${cardId} after issuance`
        );
      } catch (err: any) {
        Debugger.logWarn(
          `[SyncteraBaasClient] Auto-activation failed for card ${cardId}: ${err?.message || err}`
        );
      }
    }

    Debugger.logInfo(
      `[SyncteraBaasClient] Issued card ${cardId ?? "unknown"} for customer ${params.externalCustomerId}`
    );

    return {
      provider: this.provider,
      externalCardId: cardId,
      last4: data.pan_last_four ?? data.last4 ?? data.last_four,
      status: finalStatus ?? "ACTIVE",
    };
  }

  async updateCardStatus(cardId: string, status: string): Promise<void> {
    const client = getSyncteraClient();
    const payload: any = { card_status: status };
    await client.patch(`/cards/${cardId}`, payload);
    Debugger.logInfo(`[SyncteraBaasClient] Updated card ${cardId} status -> ${status}`);
  }

  /**
   * Initiate an instant card payout (PUSH) for Canadian users.
   * Pushes funds from Synctera account to user's external debit card.
   * 
   * @param params - Payout parameters including account ID, amount, currency (CAD)
   * @returns Result with transfer ID and status
   */
  async initiatePayout(params: InitiatePayoutParams): Promise<InitiatePayoutResult> {
    const client = getSyncteraClient();

    // Map InitiatePayoutParams to Synctera's external card transfer format
    // NOTE: externalAccountId in our params refers to the SOURCE account (wallet pool)
    // We need the external_card_id (destination card) which should be in metadata
    const externalCardId = params.metadata?.externalCardId;
    if (!externalCardId) {
      throw new Error(
        "[SyncteraBaasClient] initiatePayout requires metadata.externalCardId (destination card token)"
      );
    }

    const payload: any = {
      external_card_id: externalCardId,
      originating_account_id: params.externalAccountId, // Source: wallet pool account
      amount: params.amountMinor, // Amount in cents
      currency: params.currency, // CAD for Canadian users
      type: "PUSH", // PUSH = payout (send money TO external card)
    };

    // Add optional merchant descriptor if provided
    if (params.metadata?.merchant) {
      payload.merchant = params.metadata.merchant;
    }

    // Add optional reference/memo
    if (params.reference) {
      payload.merchant = payload.merchant || {};
      payload.merchant.name = payload.merchant.name || `Withdrawal ${params.reference}`;
    }

    try {
      const res = await client.post("/external_cards/transfers", payload);
      const data = res.data;

      Debugger.logInfo(
        `[SyncteraBaasClient] Initiated PUSH payout ${data.id} for ${params.amountMinor} ${params.currency}`
      );
      Debugger.logJSON("[SyncteraBaasClient] Payout response", data);

      return {
        provider: this.provider,
        externalTransferId: data.id,
        status: data.status, // SUCCEEDED, PENDING, DECLINED, CANCELED, UNKNOWN
        estimatedCompletionDate: data.created_time, // Instant payouts complete immediately
      };
    } catch (err: any) {
      const status = err?.response?.status;
      const body = err?.response?.data;
      Debugger.logError(
        `[SyncteraBaasClient] PUSH payout failed: status=${status}, message=${err.message}`
      );
      if (body) {
        Debugger.logJSON("[SyncteraBaasClient] Payout error body", body);
      }
      throw err;
    }
  }
}
