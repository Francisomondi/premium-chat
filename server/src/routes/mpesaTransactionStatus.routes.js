import { Router } from "express";

import {
  mpesaTransactionStatusResultController,
  mpesaTransactionStatusTimeoutController,
} from "../controllers/mpesaTransactionStatus.controller.js";

const router = Router();

/**
 * ============================================================
 * SAFARICOM TRANSACTION STATUS WEBHOOKS
 * ============================================================
 *
 * These endpoints must not require
 * a logged-in PremiumChat user.
 *
 * Their public accessibility does not
 * establish that incoming requests
 * originate from Safaricom.
 */

router.post(
  "/result",
  mpesaTransactionStatusResultController
);

router.post(
  "/timeout",
  mpesaTransactionStatusTimeoutController
);

export default router;