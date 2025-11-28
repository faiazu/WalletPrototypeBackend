import { Router } from "express";

import { cardIssueRoutes } from "./cardIssueRoutes.js";
import { cardWidgetRoutes } from "./cardWidgetRoutes.js";

const router = Router();

// Mount card routes
router.use(cardIssueRoutes);
router.use(cardWidgetRoutes);

export { router as cardRouter };
