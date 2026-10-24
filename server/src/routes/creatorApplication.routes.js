
import { Router } from "express";
import { rateLimit } from "express-rate-limit";

import {
  submitApplication,
  getMyApplication,
} from "../controllers/creatorApplication.controller.js";

import {
  requireAuth,
} from "../middleware/auth.middleware.js";

import {
  requireTrustedOrigin,
} from "../middleware/csrf.middleware.js";

import {
  validate,
} from "../middleware/validate.middleware.js";

import {
  submitCreatorApplicationSchema,
} from "../validators/creatorApplication.validators.js";

/**
 * ============================================================
 * PREMIUMCHAT CREATOR APPLICATION ROUTES
 * ============================================================
 *
 * Intended mount point:
 *
 * /api/creator/applications
 *
 * Endpoints:
 *
 * POST /api/creator/applications
 * GET  /api/creator/applications/me
 *
 * IMPORTANT:
 *
 * These routes allow application submission and
 * status retrieval only.
 *
 * They never approve applications or grant
 * creator privileges.
 */

const router = Router();

/**
 * ============================================================
 * CREATOR APPLICATION RATE LIMITER
 * ============================================================
 *
 * Limits repeated submission attempts.
 *
 * Duplicate applications are also rejected
 * by the creator application service.
 */

const creatorApplicationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,

  limit: 10,

  standardHeaders: "draft-8",

  legacyHeaders: false,

  handler: (req, res) => {
    return res.status(429).json({
      success: false,
      message:
        "Too many creator application attempts. Please try again later.",
      code: "CREATOR_APPLICATION_RATE_LIMIT",
      requestId: req.requestId,
    });
  },
});

/**
 * ============================================================
 * SUBMIT CREATOR APPLICATION
 * ============================================================
 *
 * POST /api/creator/applications
 *
 * Security:
 *
 * 1. Verify trusted request origin.
 * 2. Authenticate the current user.
 * 3. Apply submission rate limiting.
 * 4. Validate the request body.
 * 5. Submit through the application service.
 *
 * The applicant's identity comes from the
 * authenticated session, never the request body.
 */

router.post(
  "/",
  requireTrustedOrigin,
  requireAuth,
  creatorApplicationLimiter,
  validate({
    body: submitCreatorApplicationSchema,
  }),
  submitApplication
);

/**
 * ============================================================
 * GET MY CREATOR APPLICATION
 * ============================================================
 *
 * GET /api/creator/applications/me
 *
 * Security:
 *
 * - Authentication required.
 * - Application ownership is determined by
 *   the authenticated session.
 *
 * No user ID is accepted from the client.
 */

router.get(
  "/me",
  requireAuth,
  getMyApplication
);

export default router;
