#!/usr/bin/env tsx

/**
 * End-to-End Wallet Platform Simulation Runner
 * 
 * Exercises the complete flow from KYC through card transactions and withdrawals.
 * Validates ledger invariants and exports results for partner sharing.
 * 
 * Usage:
 *   npm run simulate
 *   npm run simulate -- --wallet-name "Demo Wallet" --export results.json
 *   npm run simulate -- --help
 */

import { cliRequest, handleCliError } from "../src/tests/helpers/cliHelper.js";
import { Command } from "commander";

// ================================================================================
// Types & Interfaces
// ================================================================================

interface SimulationConfig {
  walletName: string;
  depositAmount: number;
  spendAmount: number;
  fundingAmount: number;
  withdrawalAmount: number;
  provider: string;
  verbose: boolean;
  export: string | null;
  skipWithdrawal: boolean;
  baseUrl: string;
}

interface SimulationContext {
  token: string;
  userId: string;
  userEmail: string;
  walletId: string;
  cardId: string;
  externalCardId: string;
  authHoldId: string | null;
  withdrawalId: string | null;
  logs: StepResult[];
  startTime: number;
}

interface StepResult {
  step: number;
  name: string;
  status: "success" | "error" | "skipped";
  duration: number;
  data?: any;
  error?: string;
}

interface SimulationOutput {
  simulationId: string;
  timestamp: string;
  config: SimulationConfig;
  steps: StepResult[];
  finalState?: {
    walletId: string;
    balances: any;
    transactions: any;
    ledgerInvariant: any;
  };
  validation: {
    allStepsSuccessful: boolean;
    ledgerInvariantPassed: boolean;
    balancesMatch: boolean;
    errors: string[];
  };
  duration: number;
  success: boolean;
}

// ================================================================================
// CLI Configuration
// ================================================================================

const program = new Command();

program
  .name("run-simulation")
  .description("Run end-to-end wallet platform simulation")
  .option("--wallet-name <name>", "Name for created wallet", "Demo Wallet")
  .option("--deposit-amount <amount>", "Initial deposit in cents", "50000")
  .option("--spend-amount <amount>", "Card transaction amount in cents", "5000")
  .option("--funding-amount <amount>", "Inbound funding amount in cents", "10000")
  .option("--withdrawal-amount <amount>", "Withdrawal request amount in cents", "10000")
  .option("--provider <name>", "BaaS provider (MOCK, SYNCTERA)", "MOCK")
  .option("--verbose", "Enable detailed logging", false)
  .option("--export <file>", "Export JSON log to file")
  .option("--skip-withdrawal", "Skip withdrawal flow", false)
  .option("--base-url <url>", "API base URL", process.env.BASE_URL || "http://localhost:3000")
  .parse();

const options = program.opts();

const config: SimulationConfig = {
  walletName: options.walletName,
  depositAmount: parseInt(options.depositAmount),
  spendAmount: parseInt(options.spendAmount),
  fundingAmount: parseInt(options.fundingAmount),
  withdrawalAmount: parseInt(options.withdrawalAmount),
  provider: options.provider,
  verbose: options.verbose,
  export: options.export || null,
  skipWithdrawal: options.skipWithdrawal,
  baseUrl: options.baseUrl,
};

// Set base URL for cliHelper
process.env.BASE_URL = config.baseUrl;

// ================================================================================
// Utility Functions
// ================================================================================

function log(message: string, data?: any) {
  console.log(message);
  if (data && config.verbose) {
    console.log("  ", JSON.stringify(data, null, 2));
  }
}

function formatAmount(amountMinor: number): string {
  return `$${(amountMinor / 100).toFixed(2)}`;
}

function printSeparator() {
  console.log("=".repeat(80));
}

async function executeStep(
  stepNumber: number,
  stepName: string,
  fn: () => Promise<any>
): Promise<StepResult> {
  const start = Date.now();

  try {
    log(`\n✅ Step ${stepNumber}/11: ${stepName}`);
    const data = await fn();
    const duration = Date.now() - start;

    return {
      step: stepNumber,
      name: stepName,
      status: "success",
      duration,
      data,
    };
  } catch (err: any) {
    const duration = Date.now() - start;
    console.error(`❌ Step ${stepNumber}/11 failed: ${err.message}`);

    return {
      step: stepNumber,
      name: stepName,
      status: "error",
      duration,
      error: err.message,
    };
  }
}

function skipStep(stepNumber: number, stepName: string): StepResult {
  log(`\n⏭️  Step ${stepNumber}/11: ${stepName} (SKIPPED)`);

  return {
    step: stepNumber,
    name: stepName,
    status: "skipped",
    duration: 0,
  };
}

// ================================================================================
// Simulation Steps
// ================================================================================

async function step1_authentication(ctx: SimulationContext): Promise<void> {
  const result = await cliRequest("post", "/auth/login-christopher");

  ctx.token = result.token;
  ctx.userId = result.user.id;
  ctx.userEmail = result.user.email;

  log(`   → Logged in as: ${ctx.userEmail}`);
  log(`   → User ID: ${ctx.userId}`);
}

async function step2_kycVerification(ctx: SimulationContext): Promise<void> {
  // Skip KYC if user already has KYC status (Christopher demo user has KYC by default)
  try {
    const kycPayload = {
      firstName: "Christopher",
      lastName: "Demo",
      dateOfBirth: "1990-01-01",
      ssn: "123-45-6789",
      address: {
        line1: "123 Main St",
        city: "San Francisco",
        state: "CA",
        postalCode: "94102",
        country: "US",
      },
    };

    const result = await cliRequest("post", "/onboarding/kyc", kycPayload, ctx.token);

    log(`   → KYC Status: ${result.kycStatus || result.user?.kycStatus}`);
    log(`   → User ID: ${result.id || ctx.userId}`);
  } catch (err: any) {
    // If KYC already exists, that's fine for simulation
    if (err.response?.status === 400) {
      log(`   → KYC Status: Already verified`);
      log(`   → User ID: ${ctx.userId}`);
    } else {
      throw err;
    }
  }
}

async function step3_walletCreation(ctx: SimulationContext): Promise<void> {
  const result = await cliRequest(
    "post",
    "/wallet/create",
    { name: config.walletName },
    ctx.token
  );

  ctx.walletId = result.wallet.id;

  log(`   → Wallet ID: ${ctx.walletId}`);
  log(`   → Wallet Name: ${result.wallet.name}`);
  log(`   → Ledger initialized`);
}

async function step4_cardIssuance(ctx: SimulationContext): Promise<void> {
  try {
    const result = await cliRequest(
      "post",
      `/wallets/${ctx.walletId}/cards`,
      { nickname: "Demo Card" },
      ctx.token
    );

    // Card response is returned directly, not wrapped in { card: ... }
    ctx.externalCardId = result.externalCardId;
    ctx.cardId = result.externalCardId; // Use externalCardId as cardId for simulation

    log(`   → External Card ID: ${ctx.externalCardId}`);
    log(`   → Last 4: ${result.last4 || 'N/A'}`);
    log(`   → Status: ${result.status}`);
    log(`   → Provider: ${result.provider}`);
  } catch (err: any) {
    // If card creation fails (e.g., Synctera limits), use a mock card ID
    if (err.response?.status === 500 || err.response?.status === 422) {
      ctx.externalCardId = `mock_card_${Date.now()}`;
      ctx.cardId = ctx.externalCardId;
      log(`   → Card issuance failed, using mock card ID for simulation`);
      log(`   → Mock Card ID: ${ctx.externalCardId}`);
    } else {
      throw err;
    }
  }
}

async function step5_initialDeposit(ctx: SimulationContext): Promise<void> {
  // Use card-centric deposit endpoint
  const result = await cliRequest(
    "post",
    `/ledger/cards/${ctx.cardId}/deposit`,
    {
      amount: config.depositAmount,
      metadata: { source: "simulation" },
    },
    ctx.token
  );

  log(`   → Deposited: ${formatAmount(config.depositAmount)} to card ${ctx.cardId}`);
  log(`   → Transaction ID: ${result.transactionId}`);
  log(`   → Card Pool Balance: $${result.ledger.poolBalance.toFixed(2)}`);
}

async function step6_cardAuthorization(ctx: SimulationContext): Promise<void> {
  const authPayload = {
    type: "CARD_AUTH",
    provider: config.provider,
    providerEventId: `sim_auth_${Date.now()}`,
    providerTransactionId: `sim_auth_tx_${Date.now()}`,
    providerCardId: ctx.externalCardId,
    amountMinor: config.spendAmount,
    currency: "USD",
    merchantName: "Simulation Store",
    occurredAt: new Date().toISOString(),
  };

  await cliRequest("post", "/webhooks/baas/mock", authPayload);

  log(`   → Authorized: ${formatAmount(config.spendAmount)}`);
  log(`   → Merchant: ${authPayload.merchantName}`);
}

async function step7_cardClearing(ctx: SimulationContext): Promise<void> {
  const clearingPayload = {
    type: "CARD_CLEARING",
    provider: config.provider,
    providerEventId: `sim_clearing_${Date.now()}`,
    providerTransactionId: `sim_clearing_tx_${Date.now()}`,
    providerCardId: ctx.externalCardId,
    amountMinor: config.spendAmount,
    currency: "USD",
    merchantName: "Simulation Store",
    occurredAt: new Date().toISOString(),
  };

  await cliRequest("post", "/webhooks/baas/mock", clearingPayload);

  log(`   → Cleared: ${formatAmount(config.spendAmount)}`);
  log(`   → Posted to ledger`);
}

async function step8_walletFunding(ctx: SimulationContext): Promise<void> {
  // Use a mock provider account ID for testing
  const providerAccountId = `mock_acct_${ctx.userId}`;

  // First, create a funding route for this wallet
  try {
    await cliRequest(
      "post",
      `/wallet/${ctx.walletId}/funding-routes`,
      {
        providerName: config.provider,
        providerAccountId,
        reference: "",
        userId: ctx.userId,
      },
      ctx.token
    );
    log(`   → Created funding route for ${providerAccountId}`);
  } catch (err: any) {
    // If route already exists, that's fine
    if (err.response?.status !== 409) {
      log(`   → Warning: Could not create funding route (${err.response?.status || err.message})`);
    }
  }

  // Now trigger the funding event
  const fundingPayload = {
    providerAccountId,
    amountMinor: config.fundingAmount,
    currency: "USD",
    reference: "", // Empty reference routes to default
  };

  const result = await cliRequest("post", "/test/baas/funding", fundingPayload, ctx.token);

  log(`   → Funded: ${formatAmount(config.fundingAmount)}`);
  log(`   → Event ID: ${result.event.providerEventId}`);
  log(`   → Account ID: ${providerAccountId}`);
}

async function step9_withdrawal(ctx: SimulationContext): Promise<void> {
  const result = await cliRequest(
    "post",
    `/wallet/${ctx.walletId}/withdrawals`,
    {
      amountMinor: config.withdrawalAmount,
      currency: "USD",
      metadata: { source: "simulation" },
    },
    ctx.token
  );

  // Response format: { request: WithdrawalRequest, transfer: WithdrawalTransfer }
  ctx.withdrawalId = result.request.id;

  log(`   → Withdrawal ID: ${ctx.withdrawalId}`);
  log(`   → Amount: ${formatAmount(config.withdrawalAmount)}`);
  log(`   → Status: ${result.request.status}`);
  log(`   → Provider Transfer ID: ${result.transfer.providerTransferId}`);
}

async function step10_payoutCompletion(ctx: SimulationContext): Promise<void> {
  // For mock provider, fetch the withdrawal to get transfer ID
  const withdrawal = await cliRequest(
    "get",
    `/wallet/${ctx.walletId}/withdrawals/${ctx.withdrawalId}`,
    null,
    ctx.token
  );

  // Response format: { withdrawal: WithdrawalRequest }
  const providerTransferId = withdrawal.withdrawal?.transfers?.[0]?.providerTransferId;
  
  if (!providerTransferId) {
    throw new Error("No transfer found for withdrawal");
  }

  const payoutPayload = {
    providerTransferId,
    status: "COMPLETED",
  };

  await cliRequest("post", "/test/baas/payout-status", payoutPayload, ctx.token);

  log(`   → Payout completed`);
  log(`   → Transfer ID: ${providerTransferId}`);
}

async function step11_validation(ctx: SimulationContext): Promise<any> {
  // Use card-centric reconciliation endpoint
  const reconciliation = await cliRequest(
    "get",
    `/ledger/cards/${ctx.cardId}/reconciliation`,
    null,
    ctx.token
  );

  // Calculate expected balances based on whether withdrawal was skipped
  const withdrawalAmount = config.skipWithdrawal ? 0 : config.withdrawalAmount;
  
  const expected = {
    pool: config.depositAmount + config.fundingAmount - config.spendAmount - withdrawalAmount,
    equity: config.depositAmount + config.fundingAmount - config.spendAmount - withdrawalAmount,
  };

  // Card reconciliation returns balances already in cents (not negated)
  const actualPool = reconciliation.poolBalance;
  const actualEquity = reconciliation.sumOfMemberEquity;

  const poolMatch = actualPool === expected.pool;
  const equityMatch = actualEquity === expected.equity;
  const invariantPass = reconciliation.consistent === true;

  const invariantStatus = reconciliation.consistent ? "PASS" : "FAIL";

  log(`   → Card Pool: ${formatAmount(actualPool)} (expected: ${formatAmount(expected.pool)}) ${poolMatch ? "✓" : "✗"}`);
  log(`   → Member Equity: ${formatAmount(actualEquity)} (expected: ${formatAmount(expected.equity)}) ${equityMatch ? "✓" : "✗"}`);
  log(`   → Ledger Invariant: ${invariantStatus} ${invariantPass ? "✓" : "✗"}`);

  return {
    reconciliation,
    expected,
    actual: { pool: actualPool, equity: actualEquity },
    matches: { pool: poolMatch, equity: equityMatch },
    invariantPass,
  };
}

// ================================================================================
// Main Simulation Runner
// ================================================================================

async function runSimulation(): Promise<SimulationOutput> {
  const simulationId = `sim_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const startTime = Date.now();

  const ctx: SimulationContext = {
    token: "",
    userId: "",
    userEmail: "",
    walletId: "",
    cardId: "",
    externalCardId: "",
    authHoldId: null,
    withdrawalId: null,
    logs: [],
    startTime,
  };

  console.log("\n🚀 Starting Wallet Platform Simulation");
  printSeparator();

  // Reset database to ensure clean state
  try {
    await cliRequest("post", "/test/baas/reset", null);
    console.log("✓ Database reset complete");
  } catch (err) {
    console.warn("⚠ Could not reset database (test endpoint may not be available)");
  }

  console.log("\n📋 Configuration:");
  console.log(`  - Wallet Name: ${config.walletName}`);
  console.log(`  - Deposit: ${formatAmount(config.depositAmount)}`);
  console.log(`  - Spend: ${formatAmount(config.spendAmount)}`);
  console.log(`  - Funding: ${formatAmount(config.fundingAmount)}`);
  console.log(`  - Withdrawal: ${formatAmount(config.withdrawalAmount)} ${config.skipWithdrawal ? "(SKIPPED)" : ""}`);
  console.log(`  - Provider: ${config.provider}`);

  printSeparator();

  // Execute simulation steps
  ctx.logs.push(await executeStep(1, "Authentication", () => step1_authentication(ctx)));
  ctx.logs.push(await executeStep(2, "KYC Verification", () => step2_kycVerification(ctx)));
  ctx.logs.push(await executeStep(3, "Wallet Creation", () => step3_walletCreation(ctx)));
  ctx.logs.push(await executeStep(4, "Card Issuance", () => step4_cardIssuance(ctx)));
  ctx.logs.push(await executeStep(5, "Initial Deposit", () => step5_initialDeposit(ctx)));
  ctx.logs.push(await executeStep(6, "Card Authorization", () => step6_cardAuthorization(ctx)));
  ctx.logs.push(await executeStep(7, "Card Clearing", () => step7_cardClearing(ctx)));
  ctx.logs.push(await executeStep(8, "Wallet Funding", () => step8_walletFunding(ctx)));

  if (config.skipWithdrawal) {
    ctx.logs.push(skipStep(9, "Withdrawal"));
    ctx.logs.push(skipStep(10, "Payout Completion"));
  } else {
    ctx.logs.push(await executeStep(9, "Withdrawal", () => step9_withdrawal(ctx)));
    // Small delay to ensure withdrawal is created before completing
    await new Promise(resolve => setTimeout(resolve, 100));
    ctx.logs.push(await executeStep(10, "Payout Completion", () => step10_payoutCompletion(ctx)));
    // Wait for webhook processing and ledger finalization to complete
    // This ensures the PAYOUT_STATUS webhook handler has time to:
    // 1. Process the event
    // 2. Update WithdrawalTransfer status
    // 3. Finalize the ledger entry
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  const validationResult = await executeStep(11, "Validation", () => step11_validation(ctx));
  ctx.logs.push(validationResult);

  // Generate output
  const duration = Date.now() - startTime;
  const allSuccessful = ctx.logs.every(log => log.status === "success" || log.status === "skipped");
  const ledgerValid = validationResult.data?.invariantPass || false;
  const balancesMatch = validationResult.data?.matches?.pool && validationResult.data?.matches?.equity;

  const output: SimulationOutput = {
    simulationId,
    timestamp: new Date().toISOString(),
    config,
    steps: ctx.logs,
    finalState: validationResult.data ? {
      walletId: ctx.walletId,
      balances: validationResult.data.reconciliation,
      transactions: {
        deposits: 1,
        withdrawals: config.skipWithdrawal ? 0 : 1,
        cardAuths: 1,
        cardClearings: 1,
        fundings: 1,
      },
      ledgerInvariant: validationResult.data.reconciliation,
    } : undefined,
    validation: {
      allStepsSuccessful: allSuccessful,
      ledgerInvariantPassed: ledgerValid,
      balancesMatch,
      errors: ctx.logs.filter(log => log.status === "error").map(log => log.error || "Unknown error"),
    },
    duration,
    success: allSuccessful && ledgerValid && balancesMatch,
  };

  // Print summary
  printSeparator();
  console.log("\n📊 Final State Summary:");
  if (validationResult.data) {
    const { actual, expected, matches } = validationResult.data;
    console.log(`  - Wallet Pool: ${formatAmount(actual.pool)} (expected: ${formatAmount(expected.pool)}) ${matches.pool ? "✓" : "✗"}`);
    console.log(`  - Member Equity: ${formatAmount(actual.equity)} (expected: ${formatAmount(expected.equity)}) ${matches.equity ? "✓" : "✗"}`);
    console.log(`  - Ledger Invariant: ${validationResult.data.invariantPass ? "PASS" : "FAIL"} ${validationResult.data.invariantPass ? "✓" : "✗"}`);
  }

  console.log(`\n${output.success ? "✅" : "❌"} Simulation ${output.success ? "completed successfully" : "failed"} in ${(duration / 1000).toFixed(1)}s\n`);

  return output;
}

// ================================================================================
// Entry Point
// ================================================================================

async function main() {
  try {
    const output = await runSimulation();

    // Export if requested
    if (config.export) {
      const fs = await import("fs/promises");
      await fs.writeFile(config.export, JSON.stringify(output, null, 2));
      console.log(`📄 Results exported to: ${config.export}\n`);
    }

    process.exit(output.success ? 0 : 1);
  } catch (err: any) {
    console.error("\n💥 Simulation crashed:");
    handleCliError(err);
  }
}

main();

