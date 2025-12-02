# Simulation Scripts

This directory contains scripts for end-to-end testing and validation of the wallet platform.

## Available Scripts

### `run-simulation.ts`

End-to-end simulation runner that exercises the complete platform flow from KYC through card transactions and withdrawals.

**Usage:**
```bash
# Basic simulation
npm run simulate

# Custom configuration
npm run simulate -- \
  --wallet-name "Demo Wallet" \
  --deposit-amount 100000 \
  --spend-amount 10000 \
  --funding-amount 25000 \
  --withdrawal-amount 15000 \
  --export results.json \
  --verbose

# CI mode
npm run simulate:ci
```

**CLI Options:**
- `--wallet-name <name>` - Name for created wallet (default: "Demo Wallet")
- `--deposit-amount <cents>` - Initial deposit in cents (default: 50000 = $500)
- `--spend-amount <cents>` - Card transaction amount (default: 5000 = $50)
- `--funding-amount <cents>` - Inbound funding amount (default: 10000 = $100)
- `--withdrawal-amount <cents>` - Withdrawal request amount (default: 10000 = $100)
- `--provider <name>` - BaaS provider (default: "MOCK")
- `--verbose` - Enable detailed logging
- `--export <file>` - Export JSON results to file
- `--skip-withdrawal` - Skip withdrawal/payout flow
- `--base-url <url>` - API base URL (default: http://localhost:3000)

**Simulation Flow:**
1. Authentication (Christopher demo user)
2. KYC Verification
3. Wallet Creation
4. Card Issuance
5. Initial Deposit
6. Card Authorization
7. Card Clearing
8. Wallet Funding (inbound ACH)
9. Withdrawal Request
10. Payout Completion
11. Ledger Validation

**Exit Codes:**
- `0` - Success (all checks passed)
- `1` - Failure (one or more checks failed)

### `validate-simulation-results.ts`

Validates simulation results JSON output to ensure platform integrity.

**Usage:**
```bash
npm run validate-results <results-file>

# Example
npm run validate-results ci-results.json
```

**Validation Checks:**
1. Overall success flag
2. All steps completed (no errors)
3. Ledger invariant satisfied (sum of equity = negative pool)
4. Final balances match expected values
5. No validation errors
6. Performance within thresholds
7. All transaction types present

**Exit Codes:**
- `0` - Validation passed
- `1` - Validation failed

## npm Scripts

### `npm run simulate`
Run basic simulation with default parameters.

### `npm run simulate:ci`
Run simulation in CI mode with JSON export to `ci-results.json`.

### `npm run validate-results`
Validate a simulation results file.

### `npm run test:e2e`
Combined test: run simulation + validate results.

## CI Integration

The simulation is integrated into GitHub Actions via `.github/workflows/e2e-simulation.yml`.

**Workflow triggers:**
- Push to main/master/develop branches
- Pull requests to main/master/develop
- Manual workflow dispatch

**Workflow steps:**
1. Setup PostgreSQL service container
2. Install dependencies
3. Run database migrations
4. Start API server in background
5. Run simulation with JSON export
6. Validate results
7. Upload artifacts
8. Comment on PR with results (if applicable)

**Artifacts:**
- `simulation-results` - Full JSON output (retained 30 days)
- `server-logs` - Server logs on failure (retained 7 days)

## Local Testing

### Prerequisites
- PostgreSQL running locally
- Database migrations applied
- API server running on port 3000

### Quick Test
```bash
# Start server
npm run dev

# In another terminal
npm run test:e2e
```

### Manual Step-by-Step
```bash
# 1. Run simulation with export
npm run simulate -- --export test-results.json --verbose

# 2. Validate results
npm run validate-results test-results.json

# 3. Inspect JSON output
cat test-results.json | jq .
```

## JSON Output Format

```json
{
  "simulationId": "sim_1701234567890_abc123",
  "timestamp": "2024-12-02T10:30:45.123Z",
  "config": {
    "walletName": "Demo Wallet",
    "depositAmount": 50000,
    "spendAmount": 5000,
    "fundingAmount": 10000,
    "withdrawalAmount": 10000,
    "provider": "MOCK",
    "verbose": false,
    "export": "results.json",
    "skipWithdrawal": false,
    "baseUrl": "http://localhost:3000"
  },
  "steps": [
    {
      "step": 1,
      "name": "authentication",
      "status": "success",
      "duration": 120,
      "data": {
        "userId": "user-123",
        "email": "christopher@example.com"
      }
    }
    // ... more steps
  ],
  "finalState": {
    "walletId": "wallet-xyz-789",
    "balances": {
      "poolDisplay": 55000,
      "memberEquity": [
        {
          "userId": "user-123",
          "balance": 55000
        }
      ]
    },
    "transactions": {
      "deposits": 1,
      "withdrawals": 1,
      "cardAuths": 1,
      "cardClearings": 1,
      "fundings": 1
    },
    "ledgerInvariant": {
      "status": "PASS",
      "sumMemberEquity": 55000,
      "walletPool": -55000,
      "difference": 0
    }
  },
  "validation": {
    "allStepsSuccessful": true,
    "ledgerInvariantPassed": true,
    "balancesMatch": true,
    "errors": []
  },
  "duration": 3245,
  "success": true
}
```

## Troubleshooting

### Simulation Fails at Step X

1. Check server logs
2. Verify database state
3. Run with `--verbose` flag
4. Check API connectivity with `curl http://localhost:3000/health`

### Validation Fails

1. Inspect the results JSON file
2. Check `validation.errors` array for specific issues
3. Review ledger reconciliation in `finalState`

### Performance Issues

- Check database query performance
- Verify no other processes hogging resources
- Review step durations in results JSON

### Database Reset

Use the test reset route (dev only):
```bash
curl -X POST http://localhost:3000/test/baas/reset
```

## Related Documentation

- [Simulation Design](../docs/SIMULATION_DESIGN.md) - Architecture and flow
- [API Documentation](../docs/api.md) - API reference
- [Testing Guide](../src/tests/README.md) - Integration tests

