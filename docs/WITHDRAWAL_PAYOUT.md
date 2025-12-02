# Withdrawal & Payout Pipeline Documentation

## Overview

The Wallet Prototype implements a robust withdrawal/payout system that allows wallet members with positive equity to request withdrawals and receive payouts to their external accounts. The system uses a **two-phase commit pattern** with pending liabilities to ensure fund safety and proper reconciliation.

## Architecture

### Components

1. **WithdrawalRequest** - Tracks withdrawal requests from users
2. **WithdrawalTransfer** - Tracks provider-level payout attempts
3. **WithdrawalService** - Orchestrates withdrawal flow
4. **BaasService** - Coordinates with BaaS providers for payouts
5. **LedgerService** - Manages internal fund movements with pending states
6. **BaasWebhookService** - Processes payout status updates from providers

### Data Models

#### WithdrawalRequest

```prisma
model WithdrawalRequest {
  id                  String                   @id @default(cuid())
  walletId            String
  userId              String
  amountMinor         Int
  currency            String                   @default("USD")
  status              WithdrawalRequestStatus  @default(PENDING)
  ledgerTransactionId String?
  failureReason       String?
  metadata            Json?
  createdAt           DateTime                 @default(now())
  updatedAt           DateTime                 @updatedAt
  completedAt         DateTime?
  failedAt            DateTime?

  wallet    Wallet                 @relation(...)
  user      User                   @relation(...)
  transfers WithdrawalTransfer[]
}
```

**Status Flow**: `PENDING` → `PROCESSING` → `COMPLETED` | `FAILED` | `CANCELLED`

#### WithdrawalTransfer

```prisma
model WithdrawalTransfer {
  id                  String                   @id @default(cuid())
  withdrawalRequestId String
  providerName        BaasProviderName
  providerTransferId  String?
  amountMinor         Int
  currency            String                   @default("USD")
  status              WithdrawalTransferStatus @default(PENDING)
  failureReason       String?
  metadata            Json?
  createdAt           DateTime                 @default(now())
  updatedAt           DateTime                 @updatedAt
  completedAt         DateTime?
  failedAt            DateTime?

  withdrawalRequest WithdrawalRequest @relation(...)
}
```

**Status Flow**: `PENDING` → `PROCESSING` → `COMPLETED` | `FAILED` | `REVERSED`

## Withdrawal Flow

### Phase 1: Request & Pending

```
User Request (POST /wallet/:id/withdrawals)
    ↓
1. Validate membership & equity
2. Create WithdrawalRequest (PENDING)
3. Move funds to pending_withdrawal ledger account
4. Update request with ledgerTransactionId
5. Initiate provider payout
6. Create WithdrawalTransfer (PENDING)
7. Update request status to PROCESSING
    ↓
Return { request, transfer } to user
```

**Ledger Movement (Pending)**:
```
Debit:  member_equity[userId]       -$100
Credit: pending_withdrawal          +$100
```

At this point:
- User's equity is reduced
- Funds are held in pending state
- Provider payout is initiated
- No funds have left the system yet

### Phase 2: Confirmation or Reversal

The system waits for a webhook from the BaaS provider confirming the payout status.

#### Success Path

```
Provider Webhook (PAYOUT_STATUS: COMPLETED)
    ↓
1. Find WithdrawalTransfer by providerTransferId
2. Mark transfer as COMPLETED
3. Mark request as COMPLETED
4. Finalize ledger: move from pending_withdrawal to wallet_pool
    ↓
Withdrawal complete
```

**Ledger Movement (Finalization)**:
```
Debit:  pending_withdrawal          -$100
Credit: wallet_pool                 +$100
```

Final result: Funds have left the wallet system, member equity is reduced, pool balance decreased.

#### Failure Path

```
Provider Webhook (PAYOUT_STATUS: FAILED)
    ↓
1. Find WithdrawalTransfer by providerTransferId
2. Mark transfer as FAILED with reason
3. Mark request as FAILED with reason
4. Reverse ledger: return from pending_withdrawal to member_equity
5. Emit alert/notification
    ↓
Funds returned to user
```

**Ledger Movement (Reversal)**:
```
Debit:  pending_withdrawal          -$100
Credit: member_equity[userId]       +$100
```

Final result: Funds returned to user's equity, as if withdrawal never happened.

## API Endpoints

### POST /wallet/:id/withdrawals

Create a new withdrawal request.

**Authentication**: Required (member access)

**Request Body**:
```json
{
  "amountMinor": 50000,
  "currency": "USD",
  "metadata": {}
}
```

**Response (201)**:
```json
{
  "withdrawalRequest": {
    "id": "clx...abc",
    "walletId": "wallet-123",
    "userId": "user-456",
    "amountMinor": 50000,
    "currency": "USD",
    "status": "PROCESSING",
    "createdAt": "2024-12-02T10:30:00Z"
  },
  "withdrawalTransfer": {
    "id": "clx...def",
    "providerName": "MOCK",
    "providerTransferId": "mock_payout_...",
    "status": "PENDING",
    "createdAt": "2024-12-02T10:30:00Z"
  },
  "message": "Withdrawal initiated successfully"
}
```

**Error Responses**:
- `403 AccessDenied` - Not a wallet member
- `400 InsufficientEquity` - User balance < amount
- `400 InvalidAmount` - Amount not positive
- `503 ProviderDoesNotSupportPayouts` - Provider unavailable

### GET /wallet/:id/withdrawals

List withdrawal history for a wallet.

**Authentication**: Required (member access)

**Query Parameters**:
- `limit` (optional, default: 50) - Max results
- `offset` (optional, default: 0) - Pagination offset
- `status` (optional) - Filter by status

**Response (200)**:
```json
{
  "withdrawals": [
    {
      "id": "clx...abc",
      "walletId": "wallet-123",
      "userId": "user-456",
      "amountMinor": 50000,
      "currency": "USD",
      "status": "COMPLETED",
      "createdAt": "2024-12-02T10:30:00Z",
      "completedAt": "2024-12-02T10:32:00Z",
      "transfers": [...]
    }
  ],
  "count": 1,
  "limit": 50,
  "offset": 0
}
```

### GET /wallet/:id/withdrawals/:withdrawalId

Get details of a specific withdrawal.

**Authentication**: Required (member access)

**Response (200)**:
```json
{
  "withdrawal": {
    "id": "clx...abc",
    "walletId": "wallet-123",
    "userId": "user-456",
    "amountMinor": 50000,
    "currency": "USD",
    "status": "COMPLETED",
    "ledgerTransactionId": "withdrawal_pending_clx...abc",
    "transfers": [
      {
        "id": "clx...def",
        "providerName": "MOCK",
        "providerTransferId": "mock_payout_...",
        "status": "COMPLETED",
        "completedAt": "2024-12-02T10:32:00Z"
      }
    ],
    "createdAt": "2024-12-02T10:30:00Z",
    "completedAt": "2024-12-02T10:32:00Z"
  }
}
```

### GET /user/overview

Includes recent withdrawal history for the user.

**New Field**:
```json
{
  "recentWithdrawals": [
    {
      "id": "clx...abc",
      "walletId": "wallet-123",
      "walletName": "Family Wallet",
      "amountMinor": 50000,
      "currency": "USD",
      "status": "COMPLETED",
      "createdAt": "2024-12-02T10:30:00Z",
      "completedAt": "2024-12-02T10:32:00Z"
    }
  ]
}
```

## Webhook Handling

### PAYOUT_STATUS Event

Providers send webhook events to notify payout status changes.

**Normalized Event Structure**:
```typescript
interface NormalizedPayoutStatusEvent {
  provider: BaasProviderName;
  type: "PAYOUT_STATUS";
  providerEventId: string;
  providerTransferId: string;
  providerAccountId?: string;
  status: "COMPLETED" | "FAILED" | "REVERSED";
  failureReason?: string;
  amountMinor?: number;
  currency?: string;
  occurredAt: Date;
  rawPayload: unknown;
}
```

**Processing Flow**:
1. Record event in `BaasEvent` table (idempotency via `providerName` + `providerEventId`)
2. If duplicate, ignore
3. Look up `WithdrawalTransfer` by `providerName` + `providerTransferId`
4. If not found, log warning and skip
5. Handle based on status:
   - `COMPLETED`: Complete transfer & request, finalize ledger
   - `FAILED` / `REVERSED`: Fail transfer & request, reverse ledger

**Idempotency**: Duplicate webhooks are automatically ignored by the `BaasEvent` unique constraint.

## Ledger Accounts

### pending_withdrawal Account

A special liability account that holds funds during payout processing.

**Type**: `pending_withdrawal`  
**userId**: `null` (system account)  
**Created**: On first use (auto-created by `getPendingWithdrawalAccount`)

**Purpose**: Segregate funds that are in-flight to ensure accurate balance reporting and prevent double-spending.

**Balance Interpretation**:
- Positive balance = funds held pending payout
- Should be $0 when all withdrawals are settled

## Provider Integration

### BaasClient Interface

```typescript
interface InitiatePayoutParams {
  externalAccountId: string;
  amountMinor: number;
  currency: string;
  reference?: string;
  metadata?: any;
}

interface InitiatePayoutResult {
  provider: BaasProviderName;
  externalTransferId: string;
  status?: string;
  estimatedCompletionDate?: string;
}

interface BaasClient {
  initiatePayout?(params: InitiatePayoutParams): Promise<InitiatePayoutResult>;
}
```

### Mock Provider

The Mock provider auto-completes payouts immediately for testing:

```typescript
async initiatePayout(params: InitiatePayoutParams): Promise<InitiatePayoutResult> {
  return {
    provider: BaasProviderName.MOCK,
    externalTransferId: `mock_payout_${params.externalAccountId}_${Date.now()}`,
    status: "COMPLETED",
  };
}
```

### Real Provider (e.g., Synctera)

Real providers would:
1. Call their ACH/payout API
2. Return a pending transfer ID
3. Send webhook later when payout settles

## Monitoring & Alerts

### Key Metrics

1. **Pending Withdrawal Balance**: Monitor `pending_withdrawal` account balance
   - Alert if > expected threshold
   - Indicates stalled or failed payouts

2. **Failed Withdrawal Rate**: Track `FAILED` status frequency
   - Alert if > 5% failure rate
   - May indicate provider issues

3. **Pending Duration**: Track time from request to completion
   - Alert if > 5 business days
   - Indicates processing delays

4. **Reversal Rate**: Track `REVERSED` status frequency
   - Understand payout success patterns

### Logging

**Successful Completion**:
```
[BaasWebhookService] Withdrawal completed: requestId=clx...abc, 
  walletId=wallet-123, userId=user-456, amountMinor=50000
```

**Failure/Reversal**:
```
[BaasWebhookService] Withdrawal failed/reversed: requestId=clx...abc, 
  walletId=wallet-123, userId=user-456, reason="Insufficient provider funds"
```

**Route Not Found**:
```
[BaasWebhookService] PAYOUT_STATUS_NOT_FOUND: providerTransferId=..., 
  provider=MOCK, status=COMPLETED
```

### Alert Triggers

1. **Failed Withdrawal**: Emit notification to user and admin
2. **Stalled Pending**: Alert if withdrawal pending > 5 days
3. **High Pending Balance**: Alert if `pending_withdrawal` > 10% of pool
4. **Provider Unavailable**: Alert if payout initiation fails repeatedly

## Error Handling

### Common Errors

1. **InsufficientEquity**: User's equity < withdrawal amount
   - Prevention: Client-side balance check
   - Response: 400 error with clear message

2. **ProviderDoesNotSupportPayouts**: Provider lacks payout capability
   - Prevention: Check `supportsPayouts(client)` before enabling
   - Response: 503 error, suggest alternative methods

3. **ProviderTimeout**: Payout initiation times out
   - Handling: Request marked FAILED, funds returned to user
   - Alert: Admin notification

4. **WebhookMismatch**: Webhook for unknown transfer
   - Handling: Log warning, do not process
   - Investigation: Check provider logs

### Recovery Procedures

**Scenario 1: Provider payout succeeded but webhook never arrived**

1. Check provider dashboard for transfer status
2. Manually create `PAYOUT_STATUS` event via admin endpoint:
   ```bash
   POST /admin/webhooks/payout
   {
     "providerTransferId": "...",
     "status": "COMPLETED"
   }
   ```
3. Verify ledger finalization

**Scenario 2: Funds stuck in pending_withdrawal**

1. Query withdrawals with status PROCESSING for > 5 days
2. Check provider status
3. If completed externally, manually finalize
4. If failed externally, manually reverse

**Scenario 3: Duplicate payout processing**

- **Prevented by**: Idempotency via `(providerName, providerEventId)` unique constraint
- **If occurs**: Rollback transaction, audit provider integration

## Testing

### Unit Tests

Test `WithdrawalService`:
- Equity validation
- Request creation
- Idempotent operations

Test `LedgerService`:
- Pending movements
- Finalization
- Reversal

### Integration Tests

Test end-to-end flow:
1. Create withdrawal request
2. Verify pending ledger state
3. Simulate provider webhook (success)
4. Verify finalized ledger state
5. Repeat with failure webhook
6. Verify reversed ledger state

Test idempotency:
1. Create withdrawal
2. Send duplicate webhook
3. Verify no double-processing

### Mock Provider Testing

```bash
# Create withdrawal
POST /wallet/123/withdrawals
{"amountMinor": 50000}

# Mock provider auto-completes immediately
# Check withdrawal status
GET /wallet/123/withdrawals/:id

# Verify status is COMPLETED
```

## Security Considerations

1. **Member-Only Access**: Only wallet members can create withdrawals
2. **Equity Enforcement**: Cannot withdraw more than current equity
3. **Idempotent Webhooks**: Duplicate webhooks safely ignored
4. **Audit Trail**: Full history in `WithdrawalRequest` + `WithdrawalTransfer`
5. **Two-Phase Commit**: Prevents fund loss if provider fails

## Future Enhancements

1. **Withdrawal Limits**: Daily/monthly caps per user or wallet
2. **Approval Workflow**: Admin approval for large withdrawals
3. **Scheduled Withdrawals**: Recurring payout schedules
4. **Multiple Destinations**: Support multiple bank accounts
5. **Instant Withdrawals**: Real-time payouts for premium users
6. **Fee Structure**: Configurable withdrawal fees

## Related Documentation

- [Ledger System](../src/services/ledger/README.md)
- [BaaS Integration](../src/services/baas/README.md)
- [Spend Splitting](SPEND_SPLITTING.md)
- [API Documentation](api.md)
- [PRD Section 6.2: Withdrawal Flow](../.taskmaster/docs/prd.txt)

