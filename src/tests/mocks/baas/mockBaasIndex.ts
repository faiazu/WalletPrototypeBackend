import { mockHoldsRoutes } from "./routes/mockHoldsRoutes.js";
import { mockFundingRoutes } from "./routes/mockFundingRoutes.js";
import { mockPayoutStatusRoutes } from "./routes/mockPayoutStatusRoutes.js";
import { mockResetRoutes } from "./routes/mockResetRoutes.js";
import { mockStateRoutes } from "./routes/mockStateRoutes.js";

export const mockBaas = {
  holds: mockHoldsRoutes,
  funding: mockFundingRoutes,
  payoutStatus: mockPayoutStatusRoutes,
  reset: mockResetRoutes,
  state: mockStateRoutes,
};
