import { Prisma } from "../../generated/prisma/client.js";


// Result of initializing ledger for a wallet
export interface InitializedLedger {
  poolAccount: any;              // you can tighten types later
  memberEquityAccounts: any[];   // e.g. LedgerAccount[]
}

/**
 * Initialize ledger accounts for a new wallet.
 *
 * Must be called INSIDE a Prisma transaction and given the transaction client.
 */
export async function initializeLedgerForWallet(
  tx: Prisma.TransactionClient,
  walletId: string,
  adminUserId: string
): Promise<InitializedLedger> {
  console.log(
    `💡 Initializing ledger for wallet ID ${walletId} with admin user ID ${adminUserId}`
  );

  // Optional: ensure the admin is a member (using the same tx)
  const adminMember = await tx.walletMember.findFirst({
    where: { walletId, userId: adminUserId },
  });

  if (!adminMember) {
    throw new Error("AdminMemberNotFound");
  }

  // Create the shared pool account
  const poolAccount = await tx.ledgerAccount.create({
    data: {
      walletId,
      type: "wallet_pool",
      userId: null,
      balance: 0,
    },
  });

  // Create the admin's equity account
  const adminEquity = await tx.ledgerAccount.create({
    data: {
      walletId,
      type: "member_equity",
      userId: adminUserId,
      balance: 0,
    },
  });

  return {
    poolAccount,
    memberEquityAccounts: [adminEquity],
  };
}
