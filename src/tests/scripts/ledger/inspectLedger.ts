// script to inspect all the accounts of a ledger of a wallet via the inspect ledger service

import { ledgerService } from "../../../domain/ledger/service.js";

/**
 * Dumps all ledger accounts for a wallet.
 * Usage:
 *   npx tsx src/tests/scripts/ledger/inspectLedger.ts <WALLET_ID>
 */
async function main() {
  const [walletId] = process.argv.slice(2);

  if (!walletId) {
    console.error("Usage: tsx src/tests/scripts/ledger/inspectLedger.ts <WALLET_ID>");
    process.exit(1);
  }

  const accounts = await ledgerService.getWalletLedgerAccounts(walletId);

  console.log(`📒 Ledger accounts for wallet ${walletId}:`);
  console.log(JSON.stringify(accounts, null, 2));
}

main();
