import { cliRequest, handleCliError } from "../../helpers/cliHelper.js";

/**
 * Runs reconciliation (sum(member_equity) vs wallet_pool).
 * Usage:
 *   npx tsx src/tests/scripts/ledger/reconciliation.ts <TOKEN> <WALLET_ID>
 */
async function main() {
  try {
    const [token, walletId] = process.argv.slice(2);

    if (!token || !walletId) {
      console.error("Usage: tsx src/tests/scripts/ledger/reconciliation.ts <TOKEN> <WALLET_ID>");
      process.exit(1);
    }

    const result = await cliRequest(
      "get",
      `/ledger/${walletId}/reconciliation`,
      undefined,
      token
    );

    console.log("🧐 Reconciliation result:");
    console.log(JSON.stringify(result, null, 2));

    if (result.consistent) {
      console.log("✅ Ledger is consistent.");
    } else {
      console.log("❌ Ledger inconsistency detected!");
    }
  } catch (err: any) {
    handleCliError(err);
  }
}

main();
