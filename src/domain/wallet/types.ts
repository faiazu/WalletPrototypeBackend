export interface CreateWalletInput {
  name: string;
  adminUserId: string;
}

export interface WalletDetailsInput {
  walletId: string;
}

export interface CreateFundingRouteInput {
  providerName: string;
  providerAccountId: string;
  reference?: string | null;
  walletId: string;
  userId: string;
  baasAccountId?: string | null;
}

export interface UpdateSpendPolicyInput {
  spendPolicy: "PAYER_ONLY" | "EQUAL_SPLIT";
}

export interface InviteMemberInput {
  email: string;
  role?: string;
}

