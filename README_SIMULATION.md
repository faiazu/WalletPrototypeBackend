# Wallet Platform Simulation - Quick Start Guide

## Overview

The simulation system provides comprehensive end-to-end testing of the wallet platform, from KYC through card transactions and withdrawals, with automatic ledger validation.

## Quick Start

### Run Default Simulation
```bash
npm run simulate
```

### Run All Test Scenarios (Recommended)
```bash
npm run test:all-simulations
```

## Available Commands

### Basic Simulation
```bash
# Default configuration
npm run simulate

# With custom amounts
npm run simulate -- --deposit-amount 100000 --spend-amount 10000

# Skip withdrawal (faster)
npm run simulate -- --skip-withdrawal

# Export results to JSON
npm run simulate -- --export results.json

# Verbose mode
npm run simulate -- --verbose
```

### Comprehensive Testing
```bash
# Run all 12 test scenarios
npm run test:all-simulations

# This tests:
# - Default configuration
# - Small amounts
# - Large amounts  
# - Custom wallet names
# - Skip withdrawal mode
# - JSON export
# - Verbose logging
# - Edge cases (zero spend, max withdrawal, etc.)
# - Stability (5 consecutive runs)
# - Flag combinations
```

## CLI Options

| Option | Description | Default | Example |
|--------|-------------|---------|---------|
| `--wallet-name <name>` | Name for the wallet | "Demo Wallet" | `--wallet-name "Test Wallet"` |
| `--deposit-amount <cents>` | Initial deposit | 50000 ($500) | `--deposit-amount 100000` |
| `--spend-amount <cents>` | Card transaction | 5000 ($50) | `--spend-amount 10000` |
| `--funding-amount <cents>` | Inbound funding | 10000 ($100) | `--funding-amount 20000` |
| `--withdrawal-amount <cents>` | Withdrawal request | 10000 ($100) | `--withdrawal-amount 15000` |
| `--provider <name>` | BaaS provider | MOCK | `--provider SYNCTERA` |
| `--skip-withdrawal` | Skip withdrawal steps | false | `--skip-withdrawal` |
| `--export <file>` | Export JSON results | none | `--export results.json` |
| `--verbose` | Detailed logging | false | `--verbose` |
| `--base-url <url>` | API base URL | localhost:3000 | `--base-url https://api.example.com` |

## What Gets Tested

### 11 Simulation Steps
1. **Authentication** - User login and token generation
2. **KYC Verification** - Identity verification (or skip if already verified)
3. **Wallet Creation** - Multi-user wallet with ledger initialization
4. **Card Issuance** - Virtual card creation
5. **Initial Deposit** - Add funds to wallet
6. **Card Authorization** - Authorization hold placement
7. **Card Clearing** - Transaction clearing with spend splits
8. **Wallet Funding** - Inbound ACH/transfer with routing
9. **Withdrawal** - Member initiates payout request
10. **Payout Completion** - Provider confirms payout
11. **Validation** - Ledger reconciliation and invariant check

### Validation Checks
- ✅ All steps execute successfully
- ✅ Wallet pool balance matches expected
- ✅ Member equity balance matches expected  
- ✅ Ledger invariant passes (assets = liabilities)
- ✅ Exit code 0 on success

## Example Scenarios

### Minimum Viable Transaction
```bash
npm run simulate -- \
  --deposit-amount 2000 \
  --spend-amount 500 \
  --funding-amount 1000 \
  --withdrawal-amount 1000
```

### High-Value Institution Test
```bash
npm run simulate -- \
  --deposit-amount 1000000 \
  --spend-amount 100000 \
  --funding-amount 50000 \
  --withdrawal-amount 50000
```

### Quick Test (No Withdrawal)
```bash
npm run simulate -- --skip-withdrawal
```

### Audit Trail Export
```bash
npm run simulate -- \
  --export audit-trail.json \
  --verbose \
  --wallet-name "Compliance Test $(date +%Y%m%d)"
```

## Understanding Results

### Success Output
```
✅ Simulation completed successfully in 0.7s

📊 Final State Summary:
  - Wallet Pool: $450.00 (expected: $450.00) ✓
  - Member Equity: $450.00 (expected: $450.00) ✓
  - Ledger Invariant: PASS ✓
```

### Failure Output
```
❌ Simulation failed in 0.7s

📊 Final State Summary:
  - Wallet Pool: $500.00 (expected: $450.00) ✗
  - Member Equity: $500.00 (expected: $450.00) ✗
  - Ledger Invariant: PASS ✓
```

## Exported JSON Structure

When using `--export`, the simulation generates a JSON file with:

```json
{
  "simulationId": "sim_1764699330668",
  "timestamp": "2024-12-02T13:22:10.668Z",
  "config": {
    "walletName": "Demo Wallet",
    "depositAmount": 50000,
    "spendAmount": 5000,
    "fundingAmount": 10000,
    "withdrawalAmount": 10000,
    "provider": "MOCK"
  },
  "steps": [
    {
      "step": 1,
      "name": "Authentication",
      "status": "success",
      "duration": 45,
      "data": { ... }
    }
    // ... 10 more steps
  ],
  "finalState": {
    "walletId": "...",
    "balances": { ... },
    "transactions": { ... },
    "ledgerInvariant": { ... }
  },
  "validation": {
    "allStepsSuccessful": true,
    "ledgerInvariantPassed": true,
    "balancesMatch": true,
    "errors": []
  },
  "duration": 708,
  "success": true
}
```

## Troubleshooting

### Server Not Running
```bash
# Start the server first
cd WalletPrototypeBackend
BAAS_PROVIDER=MOCK npm run dev

# Then run simulation in another terminal
npm run simulate
```

### Database Issues
The simulation automatically resets the database before each run. If you encounter issues:

```bash
# Manual reset
curl -X POST http://localhost:3000/test/baas/reset

# Then run simulation
npm run simulate
```

### Authentication Errors
Ensure the test user exists:
```bash
# The simulation uses christopher.albertson@example.com
# This user should be created during database initialization
```

## CI/CD Integration

### GitHub Actions Example
```yaml
name: E2E Simulation Tests

on: [push, pull_request]

jobs:
  simulate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Start database
        run: docker-compose up -d postgres
      
      - name: Run migrations
        run: npx prisma migrate deploy
      
      - name: Start server
        run: BAAS_PROVIDER=MOCK npm run dev &
        
      - name: Wait for server
        run: sleep 5
      
      - name: Run all simulations
        run: npm run test:all-simulations
        env:
          BAAS_PROVIDER: MOCK
      
      - name: Upload results
        uses: actions/upload-artifact@v3
        with:
          name: simulation-results
          path: simulation-results/
```

## Performance Benchmarks

| Scenario | Duration | Notes |
|----------|----------|-------|
| Default (full flow) | ~0.7s | All 11 steps |
| Skip withdrawal | ~0.1s | Steps 1-8 only |
| Verbose mode | ~0.7s | Same as default |
| With export | ~0.8s | +100ms for JSON write |
| All 12 tests | ~15s | Full test suite |

## Test Coverage

The comprehensive test suite (`npm run test:all-simulations`) validates:

- ✅ **12 different scenarios**
- ✅ **100% success rate** (all tests passing)
- ✅ **Edge cases** (min/max amounts, zero spend)
- ✅ **Stability** (5 consecutive runs)
- ✅ **Flag combinations** (export + verbose)
- ✅ **JSON export** validity
- ✅ **Database reset** mechanism

See `docs/SIMULATION_TEST_RESULTS.md` for detailed test documentation.

## Files

- `scripts/run-simulation.ts` - Main simulation script
- `scripts/test-all-simulations.sh` - Comprehensive test runner
- `simulation-results/` - Exported JSON results (gitignored)
- `docs/SIMULATION_TEST_RESULTS.md` - Detailed test documentation
- `docs/SIMULATION_DESIGN.md` - Technical design documentation

## Support

For issues or questions:
1. Check the logs with `--verbose` flag
2. Review `docs/SIMULATION_TEST_RESULTS.md`
3. Verify server is running with `BAAS_PROVIDER=MOCK`
4. Try manual database reset: `curl -X POST http://localhost:3000/test/baas/reset`

---

**Status**: Production Ready ✅  
**Test Coverage**: 100% (12/12 scenarios passing)  
**Last Updated**: December 2024

