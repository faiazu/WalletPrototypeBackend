import express, { Router } from "express";

import { handleBaasWebhook, handleSyncteraWebhook } from "./controller.js";

const baasRouter = Router();
const syncteraRouter = Router();

// Use raw body to support signature verification / normalization from Buffer
baasRouter.use(
  express.raw({
    type: "*/*",
  })
);

syncteraRouter.use(
  express.raw({
    type: "*/*",
  })
);

baasRouter.post("/:provider", handleBaasWebhook);
syncteraRouter.post("/", handleSyncteraWebhook);

export { baasRouter, syncteraRouter };
