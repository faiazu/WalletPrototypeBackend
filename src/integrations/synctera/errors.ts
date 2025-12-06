import type { AxiosError } from "axios";

export class SyncteraError extends Error {
  status?: number;
  code?: string;
  detail?: string;
  type?: string;
  raw?: unknown;

  constructor(message: string, opts?: { status?: number; code?: string; detail?: string; type?: string; raw?: unknown }) {
    super(message);
    this.name = "SyncteraError";
    if (opts?.status !== undefined) this.status = opts.status;
    if (opts?.code !== undefined) this.code = opts.code;
    if (opts?.detail !== undefined) this.detail = opts.detail;
    if (opts?.type !== undefined) this.type = opts.type;
    if (opts?.raw !== undefined) this.raw = opts.raw;
  }
}

export function normalizeAxiosError(err: AxiosError): SyncteraError {
  const status = err.response?.status;
  const data: any = err.response?.data ?? {};
  const code = data.code || data.type;
  const detail = data.detail || err.message;
  const type = data.type;
  const message = `Synctera request failed${status ? ` (${status})` : ""}${code ? ` [${code}]` : ""}${detail ? `: ${detail}` : ""}`;
  
  const opts: { 
    status?: number; 
    code?: string; 
    detail?: string; 
    type?: string; 
    raw?: unknown 
  } = { raw: data,};
  
  if (status !== undefined) opts.status = status;
  if (code !== undefined) opts.code = String(code);
  if (detail !== undefined) opts.detail = String(detail);
  if (type !== undefined) opts.type = String(type);
  
  return new SyncteraError(message, opts);
}

export function asSyncteraError(err: unknown): SyncteraError {
  if ((err as any)?.isAxiosError) {
    return normalizeAxiosError(err as AxiosError);
  }
  if (err instanceof SyncteraError) return err;
  return new SyncteraError((err as any)?.message ?? "Unknown Synctera error", { raw: err });
}
