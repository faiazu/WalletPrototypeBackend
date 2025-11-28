import { randomUUID } from "crypto";
import { Debugger } from "../../../core/debugger.js";
import { getSyncteraClient } from "./syncteraClient.js";

export type WidgetType = "activate_card" | "set_pin";

export interface CardWidgetUrlParams {
  cardId: string;       // provider card id
  accountId: string;    // provider account id
  customerId: string;   // provider customer id
  widgetType: WidgetType;
}

export interface CardWidgetUrlResult {
  url: string;
}

export interface SingleUseTokenParams {
  accountId: string;    // provider account id
  customerId: string;   // provider customer id
}

export interface SingleUseTokenResult {
  token: string;
  expires?: string;
  customerAccountMappingId?: string;
}

export interface ClientAccessTokenParams {
  cardId: string; // provider card id
}

export interface ClientAccessTokenResult {
  clientToken: string;
}

/**
 * Wraps Synctera widget/token endpoints for PCI-safe flows.
 */
export const syncteraWidgetService = {
  /**
   * Retrieve a widget URL for activate_card or set_pin.
   */
  async getCardWidgetUrl(
    params: CardWidgetUrlParams
  ): Promise<CardWidgetUrlResult> {
    const client = getSyncteraClient();
    const res = await client.get("/cards/card_widget_url", {
      params: {
        card_id: params.cardId,
        account_id: params.accountId,
        customer_id: params.customerId,
        widget_type: params.widgetType,
      },
    });

    const url: string | undefined = res.data?.url;
    if (!url) {
      throw new Error("WidgetUrlMissing");
    }

    Debugger.logInfo(
      `[SyncteraWidget] Retrieved widget URL for card=${params.cardId}, type=${params.widgetType}`
    );

    return { url };
  },

  /**
   * Create a single-use token (for one-time card display via widget/client).
   */
  async getSingleUseToken(
    params: SingleUseTokenParams
  ): Promise<SingleUseTokenResult> {
    const client = getSyncteraClient();
    const res = await client.post(
      "/cards/single_use_token",
      {
        account_id: params.accountId,
        customer_id: params.customerId,
      },
      {
        headers: {
          "Idempotency-Key": randomUUID(),
        },
      }
    );

    const data = res.data ?? {};
    const token: string | undefined = data.token;
    if (!token) {
      throw new Error("SingleUseTokenMissing");
    }

    Debugger.logInfo(
      `[SyncteraWidget] Created single-use token for account=${params.accountId}`
    );

    return {
      token,
      expires: data.expires,
      customerAccountMappingId: data.customer_account_mapping_id,
    };
  },

  /**
   * Create a client access token for a specific card (for viewing PAN/PIN via widget).
   */
  async getClientAccessToken(
    params: ClientAccessTokenParams
  ): Promise<ClientAccessTokenResult> {
    const client = getSyncteraClient();
    const res = await client.post(
      `/cards/${params.cardId}/client_token`,
      {},
      {
        headers: {
          "Idempotency-Key": randomUUID(),
        },
      }
    );

    const clientToken: string | undefined = res.data?.client_token;
    if (!clientToken) {
      throw new Error("ClientTokenMissing");
    }

    Debugger.logInfo(
      `[SyncteraWidget] Created client token for card=${params.cardId}`
    );

    return { clientToken };
  },
};
