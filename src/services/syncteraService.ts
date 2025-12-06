import {
  synctera,
  type CreateCustomerRequest,
  type CreateAccountRequest,
  type CreateCardRequest,
  type WidgetUrlRequest,
  type ClientTokenRequest,
  type SingleUseTokenRequest,
  type SyncteraAccountResponse,
  type SyncteraCardResponse,
  type SyncteraCustomerResponse,
  type SyncteraClientTokenResponse,
  type SyncteraWidgetUrlResponse,
  type SyncteraSingleUseTokenResponse,
} from "../integrations/synctera/index.js";

/**
 * Thin service wrapper around Synctera client to keep controllers clean.
 */
export const syncteraService = {
  createCustomer(input: CreateCustomerRequest, opts?: { idempotencyKey?: string }): Promise<SyncteraCustomerResponse> {
    return synctera.createCustomer(input, opts);
  },

  createDepositAccount(input: CreateAccountRequest, opts?: { idempotencyKey?: string }): Promise<SyncteraAccountResponse> {
    return synctera.createDepositAccount(input, opts);
  },

  createCard(input: CreateCardRequest, opts?: { idempotencyKey?: string }): Promise<SyncteraCardResponse> {
    return synctera.createCard(input, opts);
  },

  getWidgetUrl(input: WidgetUrlRequest, opts?: { idempotencyKey?: string }): Promise<SyncteraWidgetUrlResponse> {
    return synctera.getWidgetUrl(input, opts);
  },

  createClientToken(input: ClientTokenRequest, opts?: { idempotencyKey?: string }): Promise<SyncteraClientTokenResponse> {
    return synctera.createClientToken(input, opts);
  },

  createSingleUseToken(
    input: SingleUseTokenRequest,
    opts?: { idempotencyKey?: string }
  ): Promise<SyncteraSingleUseTokenResponse> {
    return synctera.createSingleUseToken(input, opts);
  },

  verifyWebhookSignature: synctera.verifyWebhookSignature,
};
