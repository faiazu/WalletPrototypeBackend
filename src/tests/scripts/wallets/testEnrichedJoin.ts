/**
 * Integration test for enriched wallet join response.
 * Verifies that /wallet/:id/join returns wallet, balances, and member.
 * 
 * Usage:
 *   npx tsx src/tests/scripts/wallets/testEnrichedJoin.ts <TOKEN> <WALLET_ID>
 */

import { cliRequest, handleCliError } from "../../helpers/cliHelper.js";

async function main() {
  try {
    const [token, walletId] = process.argv.slice(2);

    if (!token || !walletId) {
      console.error("Usage: tsx src/tests/scripts/wallets/testEnrichedJoin.ts <TOKEN> <WALLET_ID>");
      process.exit(1);
    }

    console.log("🧪 Testing enriched join wallet response...\n");

    const result = await cliRequest(
      "post",
      `/wallet/${walletId}/join`,
      {},
      token
    );

    // Validate response structure
    console.log("✅ Join wallet response received");
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
    }

    // Check that ledger account exists for the new member
    if (result.wallet && result.wallet.members && result.member) {
      const memberExists = result.wallet.members.some(
        (m: any) => m.userId === result.member.userId
      );
      if (memberExists) {
        console.log("✓ New member appears in wallet.members");
      } else {
        errors.push("❌ New member not found in wallet.members array");
      }

      // Verify member has equity entry
      if (result.balances && result.balances.memberEquity) {
        const hasEquityEntry = result.balances.memberEquity.some(
          (e: any) => e.userId === result.member.userId
        );
        if (hasEquityEntry) {
          console.log("✓ New member has equity account entry");
        } else {
          errors.push("❌ New member missing from balances.memberEquity");
        }
      }
    }

    console.log();

    if (errors.length > 0) {
      console.error("❌ Test failed with errors:");
      errors.forEach(err => console.error("  " + err));
      process.exit(1);
    }

    console.log("✅ All assertions passed! Join response includes wallet context.");
  } catch (err: any) {
    handleCliError(err);
  }
}

main();

