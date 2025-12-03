export interface CardDepositInput {
  transactionId: string;
  cardId: string;
  userId: string;
  amount: number;
  metadata?: Record<string, any>;
}

export interface CardCaptureInput {
  transactionId: string;
  cardId: string;
  splits: Array<{ userId: string; amount: number }>;
  metadata?: Record<string, any>;
}

export interface CardWithdrawalInput {
  transactionId: string;
  cardId: string;
  userId: string;
  amount: number;
  metadata?: Record<string, any>;
}

export interface CardPendingWithdrawalInput {
  transactionId: string;
  cardId: string;
  userId: string;
  amount: number;
  metadata?: Record<string, any>;
}

export interface CardFinalizeWithdrawalInput {
  transactionId: string;
  cardId: string;
  userId: string;
  amount: number;
  metadata?: Record<string, any>;
}

export interface CardReverseWithdrawalInput {
  transactionId: string;
  cardId: string;
  userId: string;
  amount: number;
  metadata?: Record<string, any>;
}

export interface CardDisplayBalances {
  cardId: string;
  poolDisplay: number;
  memberEquity: Array<{ userId: string; balance: number }>;
  pendingWithdrawals: number;
}

export interface AggregatedWalletBalances {
  walletId: string;
  totalPoolDisplay: number;
  totalMemberEquity: Array<{ userId: string; balance: number }>;
  totalPendingWithdrawals: number;
  cardBreakdown: Array<CardDisplayBalances>;
}

export interface CardReconciliation {
  cardId: string;
  poolBalance: number;
  memberEquity: Array<{ userId: string; balance: number }>;
  sumOfMemberEquity: number;
  pendingWithdrawals: number;
  consistent: boolean;
  timestamp: Date;
}

