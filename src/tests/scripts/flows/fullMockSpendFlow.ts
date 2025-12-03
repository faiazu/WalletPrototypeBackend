// End-to-end mock flow with debugging logs:
//  - create two users (admin, member)
//  - admin creates wallet
//  - admin invites member; member joins
//  - both deposit via mock ledger routes
//  - admin creates card on wallet
//  - send mock CARD_AUTH and CARD_CLEARING webhooks
//  - print BaasEvents, ledger entries, and account balances
//
// Usage:
//   npx tsx src/tests/scripts/flows/fullMockSpendFlow.ts

import { cliRequest } from "../../helpers/cliHelper.js";
import type { LedgerAccount } from "../../../generated/prisma/client.js";
import { ledgerService } from "../../../domain/ledger/service.js";

const admin = { email: "admin@example.com", name: "Admin User" };
const member = { email: "member@example.com", name: "Member User" };

function logStep(label: string) {
  console.log(`\n💡 DEBUG: ${label}`);
}

type LoginResponse = {
  token: string;
  user: { id: string; email: string; name: string | null };
};

type WalletCreateResponse = {
  wallet: { id: string; name: string; adminId: string };
};

type CardResponse = {
  externalCardId: string;
  provider: string;
  last4?: string;
};

async function registerAndLogin(user: { email: string; name: string }) {
  // Create the user record (if not already present)
  logStep(`Registering ${user.email}`);
  await cliRequest("post", "/test/auth/mock-register", {
    email: user.email,
    name: user.name,
  });

  // Issue a JWT token for subsequent authenticated calls
  logStep(`Logging in ${user.email}`);
  const { token, user: userRecord } = await cliRequest<LoginResponse>(
    "post",
    "/test/auth/mock-login",
    {
      email: user.email,
      name: user.name,
    }
  );

  logStep(`   -> userId=${userRecord.id}, token-prefix=${token.slice(0, 8)}...`);

  return { token, userId: userRecord.id };
}

async function dumpLedgerAccounts(walletId: string, label: string) {
  const accounts: LedgerAccount[] = await ledgerService.getWalletLedgerAccounts(walletId);
  const display = await ledgerService.getWalletDisplayBalances(walletId);
  logStep(
    `   -> Ledger accounts (${label}): ${JSON.stringify(
      accounts.map((a) => ({
        id: a.id,
        type: a.type,
        userId: a.userId,
        balance: a.balance,
      })),
      null,
      2
    )}`
  );
  logStep(
    `   -> Display balances (${label}): ${JSON.stringify(display, null, 2)}`
  );
}

async function main() {
  try {
    // Create admin and member users
    const adminSession = await registerAndLogin(admin);
    const memberSession = await registerAndLogin(member);

    // Admin makes a wallet
    logStep("Creating wallet as admin");

    const walletResp = await cliRequest<WalletCreateResponse>(
      "post",
      "/wallet/create",
      { name: "Test Wallet" },
      adminSession.token
    );

    const walletId = walletResp.wallet.id;

    logStep(`Wallet ID: ${walletId}`);

    // Admin invites member to the wallet
    logStep("Inviting member to wallet");
    let inviteResp: any;
    try {
      inviteResp = await cliRequest(
        "post",
        `/wallet/${walletId}/invite`,
        { email: member.email, role: "member" },
        adminSession.token
      );
    } catch (err: any) {
      const code = err?.response?.data?.error;
      if (code === "User already a member") {
        logStep('   -> invite skipped: "User already a member"');
        inviteResp = { error: code };
      } else {
        throw err;
      }
    }
    logStep(`   -> invite response: ${JSON.stringify(inviteResp, null, 2)}`);

    // Member accepts/join the wallet
    logStep("Member joining wallet");
    let joinResp: any;
    try {
      joinResp = await cliRequest(
        "post",
        `/wallet/${walletId}/join`,
        {},
        memberSession.token
      );
    } catch (err: any) {
      const code = err?.response?.data?.error;
      if (code === "Already a member") {
        logStep('   -> join skipped: "Already a member"');
        joinResp = { error: code };
      } else {
        throw err;
      }
    }
    logStep(`   -> join response: ${JSON.stringify(joinResp, null, 2)}`);

    // Member adds funds via mock deposit route
    logStep("Member depositing 5000");
    const memberDeposit = await cliRequest(
      "post",
      `/ledger/${walletId}/deposit`,
      { amount: 5000 },
      memberSession.token
    );
    logStep(`   -> member deposit txId: ${memberDeposit.transactionId}`);

    // Admin also deposits funds
    logStep("Admin depositing 3000");
    const adminDeposit = await cliRequest(
      "post",
      `/ledger/${walletId}/deposit`,
      { amount: 3000 },
      adminSession.token
    );
    logStep(`   -> admin deposit txId: ${adminDeposit.transactionId}`);

    await dumpLedgerAccounts(walletId, "after deposits");

    // Admin gets a card on this wallet
    logStep("Creating card for admin");
    const card = await cliRequest<CardResponse>(
      "post",
      `/wallets/${walletId}/cards`,
      {},
      adminSession.token
    );
    logStep(
      `   -> Card external ID: ${card.externalCardId}, Provider ${card.provider}, Last4: ${card.last4}`
    );

    // Purchase of 12.00 via CARD_AUTH + CARD_CLEARING webhooks

    const providerEventIdAuth = `mock_auth_${Date.now()}`;
    const providerTxIdAuth = `mock_auth_tx_${Date.now()}`;
    // Simulate provider sending an auth webhook
    logStep("Sending CARD_AUTH webhook");
    const authResult = await cliRequest("post", "/webhooks/baas/mock", {
      type: "CARD_AUTH",
      id: providerEventIdAuth,
      txId: providerTxIdAuth,
      cardId: card.externalCardId,
      amountMinor: 1200,
      currency: "CAD",
      occurredAt: new Date().toISOString(),
    });
    logStep(`   -> auth webhook result: ${JSON.stringify(authResult, null, 2)}`);

    const providerEventIdClearing = `mock_clear_${Date.now()}`;
    const providerTxIdClearing = `mock_clear_tx_${Date.now()}`;
    // Simulate clearing/settlement webhook
    logStep("Sending CARD_CLEARING webhook");
    const clearingResult = await cliRequest("post", "/webhooks/baas/mock", {
      type: "CARD_CLEARING",
      id: providerEventIdClearing,
      txId: providerTxIdClearing,
      cardId: card.externalCardId,
      amountMinor: 1200,
      currency: "CAD",
      occurredAt: new Date().toISOString(),
    });
    logStep(`   -> clearing webhook result: ${JSON.stringify(clearingResult, null, 2)}`);

    // Inspect ledger balances after the clearing
    logStep("Inspecting ledger balances after clearing");
    await dumpLedgerAccounts(walletId, "after clearing");

    logStep("Reconciliation after spend");
    const reconciliation = await cliRequest(
      "get",
      `/ledger/${walletId}/reconciliation`,
      undefined,
      adminSession.token
    );
    logStep(`   -> Reconciliation: ${JSON.stringify(reconciliation, null, 2)}`);

    logStep("🎉 Flow completed successfully.");
  } catch (err: any) {
    console.error("❌ Flow failed:", err?.message ?? err);
    process.exit(1);
  } finally {
    // nothing to cleanup
  }
}

main();
