import {
  Router,
} from "express";

import {
  receiveMpesaStkCallback,
} from "../controllers/mpesaCallback.controller.js";

/**
 * ============================================================
 * PREMIUMCHAT — M-PESA CALLBACK ROUTES
 * ============================================================
 *
 * Base path:
 *
 * /api/payments/mpesa
 *
 * POST /callback
 *
 * SECURITY:
 *
 * - No subscriber authentication.
 * - No subscription activation.
 * - No payment verification based on callback alone.
 */

const router = Router();

router.post(
  "/callback",
  receiveMpesaStkCallback
);

export default router;