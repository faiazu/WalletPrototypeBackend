// Aggregator for all mock ledger routes

import { mockDepositRoutes } from "./routes/mockDepositRoutes.js";
import { mockWithdrawalRoutes } from "./routes/mockWithdrawlRoutes.js";
import { mockCardCaptureRoutes } from "./routes/mockCardCaptureRoutes.js";


export const mockLedger = {
  deposit: mockDepositRoutes,
  withdraw: mockWithdrawalRoutes,
  cardCapture: mockCardCaptureRoutes,
};
