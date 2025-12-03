import { Registry, Counter, Gauge, Histogram } from "prom-client";

// Create a registry to hold metrics
export const register = new Registry();

// Prefix all metric names
const prefix = "divvi_";

// ========================================
// COUNTERS - Track total counts
// ========================================

export const webhookCounter = new Counter({
  name: `${prefix}webhooks_processed_total`,
  help: "Total number of webhooks processed",
  labelNames: ["provider", "eventType", "status"],
  registers: [register],
});

export const ledgerPostingCounter = new Counter({
  name: `${prefix}ledger_postings_total`,
  help: "Total number of ledger postings",
  labelNames: ["type", "walletId"],
  registers: [register],
});

export const cardAuthCounter = new Counter({
  name: `${prefix}card_authorizations_total`,
  help: "Total number of card authorizations",
  labelNames: ["decision", "walletId"],
  registers: [register],
});

export const cardClearingCounter = new Counter({
  name: `${prefix}card_clearings_total`,
  help: "Total number of card clearings",
  labelNames: ["walletId"],
  registers: [register],
});

// ========================================
// GAUGES - Track current values
// ========================================

export const walletGauge = new Gauge({
  name: `${prefix}wallets_total`,
  help: "Total number of wallets in the system",
  registers: [register],
});

export const cardGauge = new Gauge({
  name: `${prefix}cards_total`,
  help: "Total number of cards in the system",
  registers: [register],
});

export const poolBalanceGauge = new Gauge({
  name: `${prefix}pool_balance_minor`,
  help: "Sum of all wallet pool balances (in minor currency units)",
  registers: [register],
});

// ========================================
// HISTOGRAMS - Track distributions
// ========================================

export const webhookLatency = new Histogram({
  name: `${prefix}webhook_latency_seconds`,
  help: "Webhook processing latency in seconds",
  labelNames: ["provider", "eventType"],
  buckets: [0.001, 0.01, 0.1, 0.5, 1, 2, 5], // 1ms to 5s
  registers: [register],
});

export const ledgerOperationLatency = new Histogram({
  name: `${prefix}ledger_operation_latency_seconds`,
  help: "Ledger operation latency in seconds",
  labelNames: ["operation"],
  buckets: [0.001, 0.01, 0.1, 0.5, 1],
  registers: [register],
});

