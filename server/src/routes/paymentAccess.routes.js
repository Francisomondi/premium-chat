import { Router } from "express";

import {
  getPaymentAccessStatus,
  getCreatorSubscriptionAccess,
} from "../controllers/paymentAccess.controller.js";

// Match this import to your existing requireAuth export.
import {
  requireAuth,
} from "../middleware/auth.middleware.js";

const router = Router();

/**
 * ============================================================
 * PAYMENT STATUS
 * ============================================================
 */

router.get(
  "/payments/:paymentId/status",
  requireAuth,
  getPaymentAccessStatus
);

/**
 * ============================================================
 * SUBSCRIPTION ACCESS STATUS
 * ============================================================
 */

router.get(
  "/subscriptions/access/:creatorId",
  requireAuth,
  getCreatorSubscriptionAccess
);

export default router;