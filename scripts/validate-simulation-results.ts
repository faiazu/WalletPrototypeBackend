#!/usr/bin/env tsx

/**
 * Validate Simulation Results
 * 
 * Validates that a simulation run's JSON output meets all quality checks.
 * Used in CI/CD pipelines to ensure platform integrity.
 * 
 * Usage:
 *   npm run validate-results -- ci-results.json
 *   tsx scripts/validate-simulation-results.ts <results-file>
 */

import fs from "fs/promises";

interface SimulationOutput {
  simulationId: string;
  timestamp: string;
  config: any;
  steps: Array<{
    step: number;
    name: string;
    status: "success" | "error" | "skipped";
    duration: number;
    data?: any;
    error?: string;
  }>;
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

async function validateResults(filePath: string): Promise<boolean> {
  console.log("🔍 Validating simulation results...\n");

  try {
    // Read and parse results file
    const content = await fs.readFile(filePath, "utf-8");
    const results: SimulationOutput = JSON.parse(content);

    console.log(`📋 Simulation ID: ${results.simulationId}`);
    console.log(`⏱️  Completed: ${results.timestamp}`);
    console.log(`⏳ Duration: ${(results.duration / 1000).toFixed(2)}s\n`);

    let allChecksPass = true;

    // Check 1: Overall success flag
    console.log("✓ Check 1: Overall Success");
    if (!results.success) {
      console.error("  ❌ FAILED: Simulation success flag is false");
      allChecksPass = false;
    } else {
      console.log("  ✅ PASS: Simulation completed successfully");
    }

    // Check 2: All steps succeeded (or skipped)
    console.log("\n✓ Check 2: Step Completion");
    const failedSteps = results.steps.filter((s) => s.status === "error");
    if (failedSteps.length > 0) {
      console.error(`  ❌ FAILED: ${failedSteps.length} step(s) failed:`);
      failedSteps.forEach((step) => {
        console.error(`    - Step ${step.step} (${step.name}): ${step.error}`);
      });
      allChecksPass = false;
    } else {
      const successCount = results.steps.filter((s) => s.status === "success").length;
      const skippedCount = results.steps.filter((s) => s.status === "skipped").length;
      console.log(`  ✅ PASS: ${successCount} steps succeeded, ${skippedCount} skipped`);
    }

    // Check 3: Ledger invariant
    console.log("\n✓ Check 3: Ledger Invariant");
    if (!results.validation.ledgerInvariantPassed) {
      console.error("  ❌ FAILED: Ledger invariant check failed");
      console.error("    Sum of member equity must equal negative wallet pool");
      allChecksPass = false;
    } else {
      console.log("  ✅ PASS: Ledger invariant satisfied");
    }

    // Check 4: Balance matching
    console.log("\n✓ Check 4: Balance Validation");
    if (!results.validation.balancesMatch) {
      console.error("  ❌ FAILED: Final balances don't match expected values");
      if (results.finalState) {
        console.error("  Expected vs Actual mismatch detected");
      }
      allChecksPass = false;
    } else {
      console.log("  ✅ PASS: All balances match expected values");
    }

    // Check 5: No validation errors
    console.log("\n✓ Check 5: Validation Errors");
    if (results.validation.errors.length > 0) {
      console.error(`  ❌ FAILED: ${results.validation.errors.length} validation error(s):`);
      results.validation.errors.forEach((err, idx) => {
        console.error(`    ${idx + 1}. ${err}`);
      });
      allChecksPass = false;
    } else {
      console.log("  ✅ PASS: No validation errors");
    }

    // Check 6: Performance threshold
    console.log("\n✓ Check 6: Performance");
    const maxDurationMs = 30000; // 30 seconds
    if (results.duration > maxDurationMs) {
      console.warn(`  ⚠️  WARNING: Simulation took ${(results.duration / 1000).toFixed(1)}s (threshold: ${maxDurationMs / 1000}s)`);
      // Don't fail on performance, just warn
    } else {
      console.log(`  ✅ PASS: Completed in ${(results.duration / 1000).toFixed(1)}s`);
    }

    // Check 7: Transaction completeness
    console.log("\n✓ Check 7: Transaction Completeness");
    if (results.finalState?.transactions) {
      const txs = results.finalState.transactions;
      const expectedMinimum = {
        deposits: 1,
        cardAuths: 1,
        cardClearings: 1,
        fundings: 1,
      };

      let txCheckPass = true;
      Object.entries(expectedMinimum).forEach(([type, min]) => {
        const actual = txs[type] || 0;
        if (actual < min) {
          console.error(`  ❌ FAILED: Expected at least ${min} ${type}, got ${actual}`);
          txCheckPass = false;
          allChecksPass = false;
        }
      });

      if (txCheckPass) {
        console.log("  ✅ PASS: All expected transaction types present");
        console.log(`    - Deposits: ${txs.deposits}`);
        console.log(`    - Card Auths: ${txs.cardAuths}`);
        console.log(`    - Card Clearings: ${txs.cardClearings}`);
        console.log(`    - Fundings: ${txs.fundings}`);
        console.log(`    - Withdrawals: ${txs.withdrawals || 0}`);
      }
    } else {
      console.error("  ❌ FAILED: No transaction data in final state");
      allChecksPass = false;
    }

    // Final summary
    console.log("\n" + "=".repeat(80));
    if (allChecksPass) {
      console.log("✅ ALL CHECKS PASSED - Simulation results valid");
      console.log("=".repeat(80) + "\n");
      return true;
    } else {
      console.error("❌ VALIDATION FAILED - One or more checks did not pass");
      console.log("=".repeat(80) + "\n");
      return false;
    }
  } catch (err: any) {
    console.error("\n💥 Validation script error:");
    console.error(err.message);
    if (err.code === "ENOENT") {
      console.error(`File not found: ${filePath}`);
    }
    return false;
  }
}

// Entry point
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error("Usage: tsx scripts/validate-simulation-results.ts <results-file>");
    console.error("Example: tsx scripts/validate-simulation-results.ts ci-results.json");
    process.exit(1);
  }

  const filePath = args[0];
  const isValid = await validateResults(filePath);

  process.exit(isValid ? 0 : 1);
}

main();

