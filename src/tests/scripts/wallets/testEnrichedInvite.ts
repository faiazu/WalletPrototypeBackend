/**
 * Integration test for enriched wallet invite response.
 * Verifies that /wallet/:id/invite returns wallet, balances, and member.
 * 
 * Usage:
 *   npx tsx src/tests/scripts/wallets/testEnrichedInvite.ts <ADMIN_TOKEN> <WALLET_ID> <INVITEE_EMAIL>
 */

import { cliRequest, handleCliError } from "../../helpers/cliHelper.js";

async function main() {
  try {
    const [adminToken, walletId, inviteeEmail] = process.argv.slice(2);

    if (!adminToken || !walletId || !inviteeEmail) {
      console.error("Usage: tsx src/tests/scripts/wallets/testEnrichedInvite.ts <ADMIN_TOKEN> <WALLET_ID> <INVITEE_EMAIL>");
      process.exit(1);
    }

    console.log("🧪 Testing enriched invite member response...\n");

    const result = await cliRequest(
      "post",
      `/wallet/${walletId}/invite`,
      { email: inviteeEmail, role: "member" },
      adminToken
    );

    // Validate response structure
    console.log("✅ Invite member response received");
    console.log(JSON.stringify(result, null, 2));
    console.log();

    // Assertions
    const errors: string[] = [];

    if (!result.wallet) {
      errors.push("❌ Response missing 'wallet' field");
    } else {
      console.log("✓ wallet field present");
      if (!result.wallet.id) errors.push("❌ wallet.id missing");
      if (!result.wallet.members) errors.push("❌ wallet.members missing");
    }

    if (!result.balances) {
      errors.push("❌ Response missing 'balances' field");
    } else {
      console.log("✓ balances field present");
      if (typeof result.balances.poolDisplay !== 'number') {
        errors.push("❌ balances.poolDisplay is not a number");
      }
      if (!Array.isArray(result.balances.memberEquity)) {
        errors.push("❌ balances.memberEquity is not an array");
      }
    }

    if (!result.member) {
      errors.push("❌ Response missing 'member' field");
    } else {
      console.log("✓ member field present");
      if (!result.member.walletId) errors.push("❌ member.walletId missing");
      if (!result.member.userId) errors.push("❌ member.userId missing");
      if (result.member.role !== "member") {
        errors.push(`❌ Expected role 'member', got '${result.member.role}'`);
      }
    }

    // Check that invited member appears in wallet.members
    if (result.wallet && result.wallet.members && result.member) {
      const memberExists = result.wallet.members.some(
        (m: any) => m.userId === result.member.userId
      );
      if (memberExists) {
        console.log("✓ Invited member appears in wallet.members");
      } else {
        errors.push("❌ Invited member not found in wallet.members array");
      }

      // Verify member has ledger equity entry
      if (result.balances && result.balances.memberEquity) {
        const hasEquityEntry = result.balances.memberEquity.some(
          (e: any) => e.userId === result.member.userId
        );
        if (hasEquityEntry) {
          console.log("✓ Invited member has equity account entry");
        } else {
          errors.push("❌ Invited member missing from balances.memberEquity");
        }
      }
    }

    console.log();

    if (errors.length > 0) {
      console.error("❌ Test failed with errors:");
      errors.forEach(err => console.error("  " + err));
      process.exit(1);
    }

    console.log("✅ All assertions passed! Invite response includes wallet context.");
  } catch (err: any) {
    handleCliError(err);
  }
}

main();

