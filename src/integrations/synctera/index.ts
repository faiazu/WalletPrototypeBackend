import {
  createCustomer,
  createDepositAccount,
  createCard,
  getWidgetUrl,
  createClientToken,
  createSingleUseToken,
  verifyWebhookSignature,
} from "./client.js";
import type {
  CreateCustomerRequest,
  CreateAccountRequest,
  CreateCardRequest,
  WidgetUrlRequest,
  ClientTokenRequest,
  SingleUseTokenRequest,
} from "./client.js";
import type {
  SyncteraAccountResponse,
  SyncteraCardResponse,
  SyncteraCustomerResponse,
  SyncteraClientTokenResponse,
  SyncteraWidgetUrlResponse,
  SyncteraSingleUseTokenResponse,
} from "./types.js";

export const synctera = {
  createCustomer: (
    payload: CreateCustomerRequest,
    options?: { idempotencyKey?: string }
  ): Promise<SyncteraCustomerResponse> => createCustomer(payload, options),
  createDepositAccount: (
    payload: CreateAccountRequest,
    options?: { idempotencyKey?: string }
  ): Promise<SyncteraAccountResponse> => createDepositAccount(payload, options),
  createCard: (
    payload: CreateCardRequest,
    options?: { idempotencyKey?: string }
  ): Promise<SyncteraCardResponse> => createCard(payload, options),
  getWidgetUrl: (
    payload: WidgetUrlRequest,
    options?: { idempotencyKey?: string }
  ): Promise<SyncteraWidgetUrlResponse> => getWidgetUrl(payload, options),
  createClientToken: (
    payload: ClientTokenRequest,
    options?: { idempotencyKey?: string }
  ): Promise<SyncteraClientTokenResponse> => createClientToken(payload, options),
  createSingleUseToken: (
    payload: SingleUseTokenRequest,
    options?: { idempotencyKey?: string }
  ): Promise<SyncteraSingleUseTokenResponse> => createSingleUseToken(payload, options),
  verifyWebhookSignature,
};

export type {
  SyncteraAccountResponse,
  SyncteraCardResponse,
  SyncteraCustomerResponse,
  SyncteraClientTokenResponse,
  SyncteraWidgetUrlResponse,
  SyncteraSingleUseTokenResponse,
} from "./types.js";
export type {
  CreateCustomerRequest,
  CreateAccountRequest,
  CreateCardRequest,
  WidgetUrlRequest,
  ClientTokenRequest,
  SingleUseTokenRequest,
} from "./client.js";
