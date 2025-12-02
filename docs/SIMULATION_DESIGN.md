# Simulation Runner Design Document

## Overview

The simulation runner (`scripts/run-simulation.ts`) provides an automated way to exercise the complete wallet platform flow from user onboarding through card transactions and funding events.

## Simulation Flow

### Sequential Steps

1. **Authentication** - Login with test user (Christopher)
2. **KYC Verification** - Complete mock KYC process
3. **Wallet Creation** - Create a new wallet
4. **Card Issuance** - Issue a virtual card to the wallet
5. **Initial Funding** - Deposit funds via ledger
6. **Card Authorization** - Simulate card auth webhook
7. **Card Clearing** - Simulate card clearing webhook
8. **Wallet Funding** - Trigger inbound funding event
9. **Withdrawal** - Test withdrawal/payout flow
10. **Validation** - Verify ledger invariants and balances

### Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ 1. POST /auth/login-christopher                            │
│    → Obtain JWT token                                       │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. POST /onboarding/kyc                                     │
│    → Complete KYC verification                              │
│    → User status: ACCEPTED                                  │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. POST /wallet/create                                      │
│    → Create wallet with specified name                      │
│    → Initialize ledger accounts                             │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. POST /wallets/:id/cards                                  │
│    → Issue virtual card to wallet                           │
│    → Card status: ACTIVE                                    │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. POST /test/ledger/:walletId/deposit                      │
│    → Deposit initial funds (default: $500)                  │
│    → Update member_equity and wallet_pool                   │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ 6. POST /webhooks/baas/mock (CARD_AUTH)                     │
│    → Simulate card authorization                            │
│    → Create auth hold                                       │
│    → Amount: Configurable (default: $50)                    │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ 7. POST /webhooks/baas/mock (CARD_CLEARING)                 │
│    → Simulate card clearing/settlement                      │
│    → Post to ledger (debit equity, credit pool)             │
│    → Clear auth hold                                        │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ 8. POST /test/baas/funding (WALLET_FUNDING)                 │
│    → Simulate inbound funding event                         │
│    → Route to wallet via funding routes                     │
│    → Amount: Configurable (default: $100)                   │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ 9. POST /wallet/:id/withdrawals                             │
│    → Request withdrawal                                     │
│    → Move to pending liability                              │
│    → Initiate mock payout                                   │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ 10. POST /webhooks/baas/mock (PAYOUT_STATUS)                │
│     → Complete withdrawal                                   │
│     → Finalize ledger                                       │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ 11. GET /ledger/:walletId/reconciliation                    │
│     → Validate ledger invariants                            │
│     → Check: sum(member_equity) = wallet_pool               │
│     → Verify balances match expected state                  │
└─────────────────────────────────────────────────────────────┘
```

## CLI Parameters

### Basic Usage

```bash
npm run simulate                          # Default simulation
npm run simulate -- --wallet "My Wallet"  # Custom wallet name
npm run simulate -- --verbose             # Detailed logging
npm run simulate -- --export report.json  # Export results
```

### Available Flags

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--wallet-name` | string | "Demo Wallet" | Name for created wallet |
| `--deposit-amount` | number | 50000 | Initial deposit in cents |
| `--spend-amount` | number | 5000 | Card transaction amount in cents |
| `--funding-amount` | number | 10000 | Inbound funding amount in cents |
| `--withdrawal-amount` | number | 10000 | Withdrawal request amount in cents |
| `--provider` | string | "MOCK" | BaaS provider (MOCK, SYNCTERA) |
| `--verbose` | boolean | false | Enable detailed logging |
| `--export` | string | null | Export JSON log to file |
| `--skip-withdrawal` | boolean | false | Skip withdrawal flow |
| `--base-url` | string | "http://localhost:3000" | API base URL |

### Examples

**Basic Demo**:
```bash
npm run simulate
```

**Large Transaction Test**:
```bash
npm run simulate -- \
  --deposit-amount 100000 \
  --spend-amount 25000 \
  --funding-amount 50000
```

**Export for Partner Sharing**:
```bash
npm run simulate -- \
  --wallet-name "Synctera Integration Test" \
  --export synctera-demo.json \
  --verbose
```

**Quick Test (Skip Withdrawal)**:
```bash
npm run simulate -- \
  --skip-withdrawal \
  --spend-amount 1000
```

## Output Format

### Console Output

```
🚀 Starting Wallet Platform Simulation
================================================================================

📋 Configuration:
  - Wallet Name: Demo Wallet
  - Deposit: $500.00
  - Spend: $50.00
  - Funding: $100.00
  - Withdrawal: $100.00
  - Provider: MOCK

================================================================================

✅ Step 1/11: Authentication
   → Logged in as: christopher@example.com
   → Token: eyJhbGc...

✅ Step 2/11: KYC Verification
   → Status: ACCEPTED
   → User ID: user-abc-123

✅ Step 3/11: Wallet Creation
   → Wallet ID: wallet-xyz-789
   → Ledger initialized

...

================================================================================

📊 Final State Summary:
  - Wallet Pool: $550.00 (expected: $550.00) ✓
  - Member Equity: $550.00 (expected: $550.00) ✓
  - Pending Withdrawal: $0.00 ✓
  - Ledger Invariant: PASS ✓

✅ Simulation completed successfully in 3.2s
```

### JSON Export Format

```json
{
  "simulationId": "sim_20241202_103045_xyz",
  "timestamp": "2024-12-02T10:30:45.123Z",
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
      "name": "authentication",
      "status": "success",
      "duration": 120,
      "data": {
        "userId": "user-abc-123",
        "email": "christopher@example.com"
      }
    },
    {
      "step": 2,
      "name": "kyc_verification",
      "status": "success",
      "duration": 250,
      "data": {
        "kycStatus": "ACCEPTED"
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
          "userId": "user-abc-123",
          "balance": 55000
        }
      ],
      "pendingWithdrawal": 0
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

## Helper Utilities

### SimulationContext

Tracks state across the simulation run:

```typescript
interface SimulationContext {
  token: string;
  userId: string;
  walletId: string;
  cardId: string;
  authHoldId: string;
  withdrawalId: string;
  logs: SimulationStep[];
  startTime: number;
}
```

### Step Result

Each step returns a standardized result:

```typescript
interface StepResult {
  step: number;
  name: string;
  status: 'success' | 'error' | 'skipped';
  duration: number;
  data?: any;
  error?: string;
}
```

## Test Route Requirements

### New Routes Needed

1. **POST /test/baas/funding** - Trigger WALLET_FUNDING event
2. **POST /test/baas/reset** - Reset database state
3. **POST /test/baas/payout-status** - Trigger PAYOUT_STATUS webhook
4. **GET /test/state** - Get current system state

### Guards

All test routes must be:
- Protected by `NODE_ENV !== 'production'`
- Optionally auth-protected (lightweight)
- Clearly documented as dev-only

## Validation Rules

### Ledger Invariants

1. **Sum Equality**: `sum(member_equity.balance) = -wallet_pool.balance`
2. **Non-Negative Equity**: All member equity balances ≥ 0
3. **Pending Cleared**: `pending_withdrawal.balance = 0` at end
4. **Transaction Count**: Matches expected operations

### Balance Checks

```typescript
const expected = {
  pool: initialDeposit + funding - spend - withdrawal,
  equity: initialDeposit + funding - spend - withdrawal,
  pending: 0
};

assert(actual.pool === expected.pool);
assert(actual.equity === expected.equity);
assert(actual.pending === expected.pending);
```

## Error Handling

### Retry Logic

- Network errors: Retry up to 3 times with exponential backoff
- Auth failures: Fail immediately
- Validation errors: Fail immediately

### Cleanup

On error or completion:
1. Log final state
2. Export partial results if `--export` specified
3. Return appropriate exit code (0 = success, 1 = failure)

## Integration with CI

### npm Scripts

```json
{
  "scripts": {
    "simulate": "tsx scripts/run-simulation.ts",
    "simulate:ci": "tsx scripts/run-simulation.ts --export ci-results.json",
    "test:e2e": "npm run simulate:ci && npm run validate-results"
  }
}
```

### CI Workflow

```yaml
- name: Run E2E Simulation
  run: |
    docker-compose up -d postgres
    npm run db:migrate
    npm run simulate:ci
    
- name: Validate Results
  run: |
    npm run validate-results
    
- name: Upload Artifacts
  uses: actions/upload-artifact@v3
  with:
    name: simulation-results
    path: ci-results.json
```

## Future Enhancements

1. **Multi-User Scenarios** - Simulate multiple wallet members
2. **Spend Splitting** - Test EQUAL_SPLIT policy
3. **Error Scenarios** - Simulate failure cases
4. **Performance Testing** - Concurrent simulations
5. **Visual Reports** - HTML/chart generation
6. **Comparison Mode** - Compare runs over time

## Related Documentation

- [API Documentation](api.md)
- [Testing Guide](../src/tests/README.md)
- [Ledger System](../src/services/ledger/README.md)
- [BaaS Integration](../src/services/baas/README.md)

