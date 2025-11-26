import axios from "axios";
import type { AxiosRequestConfig } from "axios";

const DEFAULT_BASE_URL = "http://localhost:3000";

export function getBaseUrl(): string {
  return process.env.BASE_URL || DEFAULT_BASE_URL;
}

export async function cliRequest<T = any>(
  method: "get" | "post" | "put" | "delete",
  path: string,
  body?: any,
  token?: string
): Promise<T> {

  const baseURL = getBaseUrl();

  const config: AxiosRequestConfig = {
    method,
    url: `${baseURL}${path}`,
    data: body,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  };

  try {

    const res = await axios(config);
    return res.data as T;

  } catch (err: any) {

    console.error("\n❌ CLI request failed");

    if (err.response) {
      console.error("Status:", err.response.status);
      console.error("Body:", err.response.data);
    } 
    else {
      console.error(err.message || err);
    }

    process.exit(1);

  }

}
