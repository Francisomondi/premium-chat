import {
  Router,
} from "express";

import {
  requireAuth,
} from "../middleware/auth.middleware.js";

import {
  initiateMySubscriptionMpesaPayment,
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
 * Security:
 *
 * - Authentication required.
 * - Subscriber identity comes from req.auth.
 * - No direct payment confirmation endpoint.
 * - No direct subscription activation endpoint.
 */

const router = Router();

router.use(requireAuth);

/**
 * POST /api/payments/mpesa/stk-push
 */

router.post(
  "/stk-push",
  initiateMySubscriptionMpesaPayment
);

export default router;