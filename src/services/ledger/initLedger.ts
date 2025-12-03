import { Prisma, LedgerScope } from "../../generated/prisma/client.js";


// Result of initializing ledger for a wallet (legacy)
export interface InitializedLedger {
  poolAccount: any;              // you can tighten types later
  memberEquityAccounts: any[];   // e.g. LedgerAccount[]
}

// Result of initializing ledger for a card
export interface InitializedCardLedger {
  cardPoolAccount: any;
  cardMemberEquityAccounts: any[];
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

/**
 * Initialize card-scoped ledger accounts for a new card.
 * 
 * Creates:
 * - One CARD_POOL account (shared balance for the card)
 * - One CARD_MEMBER_EQUITY account per wallet member
 * 
 * Must be called INSIDE a Prisma transaction.
 */
export async function initializeLedgerForCard(
  tx: Prisma.TransactionClient,
  cardId: string,
  walletId: string
): Promise<InitializedCardLedger> {
  console.log(`💡 Initializing card-scoped ledger for card ID ${cardId}`);

  // Get all wallet members
  const members = await tx.walletMember.findMany({
    where: { walletId },
  });

  if (members.length === 0) {
    throw new Error("NoWalletMembers");
  }

  // Create the card pool account
  const cardPoolAccount = await tx.ledgerAccount.create({
    data: {
      walletId,
      cardId,
      ledgerScope: LedgerScope.CARD_POOL,
      type: "card_pool", // Legacy field
      userId: null,
      balance: 0,
    },
  });

  // Create equity accounts for ALL wallet members
  const cardMemberEquityAccounts = await Promise.all(
    members.map((member) =>
      tx.ledgerAccount.create({
        data: {
          walletId,
          cardId,
          ledgerScope: LedgerScope.CARD_MEMBER_EQUITY,
          type: "card_member_equity", // Legacy field
          userId: member.userId,
          balance: 0,
        },
      })
    )
  );

  console.log(
    `✅ Created card ledger: 1 pool + ${cardMemberEquityAccounts.length} equity accounts`
  );

  return {
    cardPoolAccount,
    cardMemberEquityAccounts,
  };
}
