import axios, { type AxiosInstance, type AxiosRequestConfig } from "axios";
import crypto from "crypto";
import { config } from "../../core/config.js";
import { logger } from "../../core/logger.js";
import { asSyncteraError } from "./errors.js";

export interface RequestOptions {
  idempotencyKey?: string;
}

export interface CreateCustomerRequest {
  email?: string;
  phone?: string;
  full_name?: string;
  external_id?: string;
}

export interface CreateAccountRequest {
  customer_id: string;
  template_id: string;
  currency?: string;
}

export interface CreateCardRequest {
  customer_id: string;
  account_id: string;
  product_id: string;
  card_type?: "VIRTUAL" | "PHYSICAL";
  nickname?: string;
}

export interface WidgetUrlRequest {
  card_id?: string;
  account_id: string;
  customer_id: string;
  widget_type: "activate_card" | "set_pin";
}

export interface ClientTokenRequest {
  card_id: string;
  customer_id: string;
}

export interface SingleUseTokenRequest {
  card_id: string;
  account_id: string;
  customer_id: string;
}

function buildClient(): AxiosInstance {
  const instance = axios.create({
    baseURL: config.SYNCTERA_BASE_URL,
    timeout: 10000,
    headers: {
      Authorization: `Bearer ${config.SYNCTERA_API_KEY}`,
      "Content-Type": "application/json",
    },
  });
  // logging interceptors
  instance.interceptors.request.use((req) => {
    logger.debug(
      {
        service: "synctera",
        method: req.method,
        url: req.url,
        params: req.params,
        idempotencyKey: req.headers?.["Idempotency-Key"],
      },
      "synctera request"
    );
    return req;
  });

  instance.interceptors.response.use(
    (res) => {
      logger.debug(
        {
          service: "synctera",
          status: res.status,
          url: res.config.url,
        },
        "synctera response"
      );
      return res;
    },
    async (err) => {
      const norm = asSyncteraError(err);
      const config = err.config as AxiosRequestConfig & { _retryCount?: number };
      const status = norm.status ?? err.response?.status;
      const shouldRetry = status === 429 || (status !== undefined && status >= 500);
      const retryCount = config?._retryCount ?? 0;

      if (shouldRetry && retryCount < 2 && config) {
        config._retryCount = retryCount + 1;
        const delay = Math.min(1000 * Math.pow(2, retryCount), 4000);
        logger.warn({ service: "synctera", status, retry: config._retryCount }, "synctera retrying");
        await new Promise((resolve) => setTimeout(resolve, delay));
        return instance.request(config);
      }

      logger.warn(
        {
          service: "synctera",
          status: norm.status,
          code: norm.code,
          detail: norm.detail,
          type: norm.type,
        },
        "synctera error"
      );
      return Promise.reject(norm);
    }
  );
  return instance;
}

const http = buildClient();

function applyIdempotency(options?: RequestOptions) {
  if (!options?.idempotencyKey) return {};
  return { "Idempotency-Key": options.idempotencyKey };
}

export async function createCustomer(payload: CreateCustomerRequest, options?: RequestOptions) {
  const res = await http.post("/customers", payload, {
    headers: applyIdempotency(options),
  });
  return res.data;
}

export async function createDepositAccount(payload: CreateAccountRequest, options?: RequestOptions) {
  const body = {
    customer_id: payload.customer_id,
    template_id: payload.template_id,
    currency: payload.currency ?? config.SYNCTERA_ACCOUNT_CURRENCY,
  };
  const res = await http.post("/accounts", body, {
    headers: applyIdempotency(options),
  });
  return res.data;
}

export async function createCard(payload: CreateCardRequest, options?: RequestOptions) {
  const body = {
    customer_id: payload.customer_id,
    account_id: payload.account_id,
    product_id: payload.product_id,
    card_type: payload.card_type ?? "VIRTUAL",
    nickname: payload.nickname,
  };
  const res = await http.post("/cards", body, {
    headers: applyIdempotency(options),
  });
  return res.data;
}

export async function getWidgetUrl(payload: WidgetUrlRequest, options?: RequestOptions) {
  const res = await http.get("/cards/card_widget_url", {
    params: {
      card_id: payload.card_id,
      account_id: payload.account_id,
      customer_id: payload.customer_id,
      widget_type: payload.widget_type,
    },
    headers: applyIdempotency(options),
  });
  return res.data as { url: string };
}

export async function createClientToken(payload: ClientTokenRequest, options?: RequestOptions) {
  const res = await http.post(
    `/cards/${payload.card_id}/client_token`,
    {},
    { headers: applyIdempotency(options) }
  );
  return res.data as { client_token: string };
}

export async function createSingleUseToken(payload: SingleUseTokenRequest, options?: RequestOptions) {
  const res = await http.post(
    "/cards/single_use_token",
    {
      card_id: payload.card_id,
      account_id: payload.account_id,
      customer_id: payload.customer_id,
    },
    { headers: applyIdempotency(options) }
  );
  return res.data as { token: string; expires?: string; customer_account_mapping_id?: string };
}

export function verifyWebhookSignature(rawBody: string | Buffer, providedSignature: string | undefined) {
  if (!providedSignature) return false;
  const hmac = crypto.createHmac("sha256", config.SYNCTERA_WEBHOOK_SECRET);
  hmac.update(rawBody);
  const expected = hmac.digest("hex");
  const given = Buffer.from(providedSignature);
  const expectedBuf = Buffer.from(expected);
  if (given.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, given);
}

export const syncteraClient = {
  createCustomer,
  createDepositAccount,
  createCard,
  getWidgetUrl,
  createClientToken,
  createSingleUseToken,
  verifyWebhookSignature,
};
