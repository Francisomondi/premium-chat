import { Router } from "express";

import {
  requireAuth,
} from "../middleware/auth.middleware.js";

import {
  initiateMySubscriptionMpesaPayment,
  getMyMpesaPaymentStatus,
} from "../controllers/mpesaPayment.controller.js";

import {
  recoverMyMpesaPayment,
} from "../controllers/mpesaPaymentRecovery.controller.js";

/**
 * ============================================================
 * PREMIUMCHAT — M-PESA PAYMENT ROUTES
 * ============================================================
 *
 * Base path:
 *
 * /api/payments/mpesa
 *
 * All routes require authentication.
 */

const router = Router();

router.use(requireAuth);

/**
 * ============================================================
 * INITIATE M-PESA PAYMENT
 * ============================================================
 *
 * POST /api/payments/mpesa/stk-push
 */

router.post(
  "/stk-push",
  initiateMySubscriptionMpesaPayment
);

/**
 * ============================================================
 * RECOVER EXISTING PAYMENT
 * ============================================================
 *
 * GET /api/payments/mpesa/requests/:clientRequestId
 *
 * Read-only.
 *
 * Does not dispatch another STK Push.
 */

router.get(
  "/requests/:clientRequestId",
  recoverMyMpesaPayment
);

/**
 * ============================================================
 * GET PAYMENT STATUS
 * ============================================================
 *
 * GET /api/payments/mpesa/:paymentId/status
 */

router.get(
  "/:paymentId/status",
  getMyMpesaPaymentStatus
);

export default router;