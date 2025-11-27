import axios, { type AxiosInstance } from "axios";
import { config } from "../../../core/config.js";

/**
 * Lazily create a Synctera HTTP client.
 * Throws if apiKey is missing when called.
 */
export function getSyncteraClient(): AxiosInstance {
  if (!config.synctera.apiKey) {
    throw new Error("SYNCTERA_API_KEY is not set in environment");
  }

  return axios.create({
    baseURL: config.synctera.baseUrl,
    headers: {
      Authorization: `Bearer ${config.synctera.apiKey}`,
      "Content-Type": "application/json",
    },
  });
}
