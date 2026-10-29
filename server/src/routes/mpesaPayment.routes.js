import { Router } from "express";

import {
  requireAuth,
} from "../middleware/auth.middleware.js";

import {
  initiateMySubscriptionMpesaPayment,
  getMyMpesaPaymentStatus,
} from "../controllers/mpesaPayment.controller.js";

/**
 * ============================================================
 * PREMIUMCHAT — M-PESA PAYMENT ROUTES
 * ============================================================
 *
 * Base path:
 *
 * /api/payments/mpesa
 *
 * All endpoints require authentication.
 *
 * No endpoint permits client-controlled
 * payment confirmation or activation.
 */

const router = Router();

router.use(requireAuth);

/**
 * POST /api/payments/mpesa/stk-push
 *
 * Initiate a subscription payment.
 */

router.post(
  "/stk-push",
  initiateMySubscriptionMpesaPayment
);

/**
 * GET /api/payments/mpesa/:paymentId/status
 *
 * Retrieve the authenticated user's
 * payment status.
 */

router.get(
  "/:paymentId/status",
  getMyMpesaPaymentStatus
);

export default router;