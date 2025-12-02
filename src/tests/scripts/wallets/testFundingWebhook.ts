/**
 * Integration test for WALLET_FUNDING webhook ingestion with funding routes.
 * Tests that webhooks are correctly routed to wallet/user based on funding routes.
 * 
 * Usage:
 *   npx tsx src/tests/scripts/wallets/testFundingWebhook.ts <ADMIN_TOKEN> <WALLET_ID> <MEMBER_USER_ID>
 */

import { cliRequest, handleCliError } from "../../helpers/cliHelper.js";

async function main() {
  try {
    const [adminToken, walletId, memberUserId] = process.argv.slice(2);

    if (!adminToken || !walletId || !memberUserId) {
      console.error("Usage: tsx src/tests/scripts/wallets/testFundingWebhook.ts <ADMIN_TOKEN> <WALLET_ID> <MEMBER_USER_ID>");
      process.exit(1);
    }

    console.log("🧪 Testing WALLET_FUNDING webhook ingestion...\n");

    // Setup: Create a funding route
    console.log("Setup: Creating funding route...");
    const providerAccountId = `test-account-${Date.now()}`;
    const reference = `test-ref-${Date.now()}`;

    await cliRequest(
      "post",
      `/wallet/${walletId}/funding-routes`,
      {
        providerName: "MOCK",
        providerAccountId,
        reference,
        userId: memberUserId,
      },
      adminToken
    );

    console.log(`✓ Funding route created: accountId=${providerAccountId}, reference=${reference}\n`);

    // Get initial balances
    console.log("Getting initial balances...");
    const initialWallet = await cliRequest(
      "get",
      `/wallet/${walletId}`,
      undefined,
      adminToken
    );

    const initialPoolDisplay = initialWallet.balances?.poolDisplay ?? 0;
    const initialMemberEquity = initialWallet.balances?.memberEquity?.find(
      (e: any) => e.userId === memberUserId
    )?.balance ?? 0;

    console.log(`Initial pool balance: ${initialPoolDisplay}`);
    console.log(`Initial member equity: ${initialMemberEquity}\n`);

    // Test 1: Send WALLET_FUNDING webhook with matching reference
    console.log("Test 1: Sending WALLET_FUNDING webhook with matching reference...");
    const fundingAmount = 10000; // 100.00 in cents
    const webhookPayload = {
      type: "WALLET_FUNDING",
      id: `event-${Date.now()}`,
      txId: `tx-${Date.now()}`,
      accountId: providerAccountId,
      reference: reference,
      amountMinor: fundingAmount,
      currency: "CAD",
      fundingMethod: "ACH_CREDIT",
      occurredAt: new Date().toISOString(),
    };

    await cliRequest(
      "post",
      `/webhooks/baas/mock`,
      webhookPayload
    );

    console.log("✓ Webhook sent, waiting for processing...");
    await new Promise(resolve => setTimeout(resolve, 500)); // Wait for async processing

    // Check updated balances
    const updatedWallet = await cliRequest(
      "get",
      `/wallet/${walletId}`,
      undefined,
      adminToken
    );

    const updatedPoolDisplay = updatedWallet.balances?.poolDisplay ?? 0;
    const updatedMemberEquity = updatedWallet.balances?.memberEquity?.find(
      (e: any) => e.userId === memberUserId
    )?.balance ?? 0;

    console.log(`\nUpdated pool balance: ${updatedPoolDisplay}`);
    console.log(`Updated member equity: ${updatedMemberEquity}`);

    const errors: string[] = [];

    // Validate balance changes
    const expectedPoolDisplay = initialPoolDisplay + fundingAmount;
    const expectedMemberEquity = initialMemberEquity + fundingAmount;

    if (updatedPoolDisplay !== expectedPoolDisplay) {
      errors.push(`❌ Pool balance mismatch: expected ${expectedPoolDisplay}, got ${updatedPoolDisplay}`);
    } else {
      console.log("✓ Pool balance updated correctly");
    }

    if (updatedMemberEquity !== expectedMemberEquity) {
      errors.push(`❌ Member equity mismatch: expected ${expectedMemberEquity}, got ${updatedMemberEquity}`);
    } else {
      console.log("✓ Member equity updated correctly");
    }

    // Test 2: Test fallback to default route
    console.log("\n\nTest 2: Testing fallback to default route (empty reference)...");
    
    // Create a default route (empty reference)
    const defaultAccountId = `default-account-${Date.now()}`;
    await cliRequest(
      "post",
      `/wallet/${walletId}/funding-routes`,
      {
        providerName: "MOCK",
        providerAccountId: defaultAccountId,
        userId: memberUserId,
      },
      adminToken
    );

    console.log(`✓ Default route created: accountId=${defaultAccountId}\n`);

    // Get balances before
    const beforeDefaultWallet = await cliRequest(
      "get",
      `/wallet/${walletId}`,
      undefined,
      adminToken
    );

    const beforeDefaultMemberEquity = beforeDefaultWallet.balances?.memberEquity?.find(
      (e: any) => e.userId === memberUserId
    )?.balance ?? 0;

    // Send webhook with unknown reference (should fall back to default)
    const defaultWebhookPayload = {
      type: "WALLET_FUNDING",
      id: `event-fallback-${Date.now()}`,
      txId: `tx-fallback-${Date.now()}`,
      accountId: defaultAccountId,
      reference: "some-unknown-reference",
      amountMinor: 5000, // 50.00
      currency: "CAD",
      fundingMethod: "ACH_CREDIT",
      occurredAt: new Date().toISOString(),
    };

    await cliRequest(
      "post",
      `/webhooks/baas/mock`,
      defaultWebhookPayload
    );

    console.log("✓ Webhook with unknown reference sent, waiting for processing...");
    await new Promise(resolve => setTimeout(resolve, 500));

    // Check balances after
    const afterDefaultWallet = await cliRequest(
      "get",
      `/wallet/${walletId}`,
      undefined,
      adminToken
    );

    const afterDefaultMemberEquity = afterDefaultWallet.balances?.memberEquity?.find(
      (e: any) => e.userId === memberUserId
    )?.balance ?? 0;

    console.log(`\nMember equity before: ${beforeDefaultMemberEquity}`);
    console.log(`Member equity after: ${afterDefaultMemberEquity}`);

    if (afterDefaultMemberEquity === beforeDefaultMemberEquity + 5000) {
      console.log("✓ Fallback to default route worked correctly");
    } else {
      errors.push(`❌ Fallback failed: expected ${beforeDefaultMemberEquity + 5000}, got ${afterDefaultMemberEquity}`);
    }

    // Final validation
    console.log();
    if (errors.length > 0) {
      console.error("❌ Test failed with errors:");
      errors.forEach(err => console.error("  " + err));
      process.exit(1);
    }

    console.log("✅ All assertions passed! Webhook ingestion working correctly.");
    console.log("\nSummary:");
    console.log("  ✓ WALLET_FUNDING webhooks route to correct wallet/user");
    console.log("  ✓ Reference-specific routes work correctly");
    console.log("  ✓ Fallback to default route works when reference doesn't match");
    console.log("  ✓ Ledger balances are updated correctly");
  } catch (err: any) {
    handleCliError(err);
  }
}

main();

