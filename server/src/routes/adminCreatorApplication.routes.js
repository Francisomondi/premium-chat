
import { Router } from "express";
import { z } from "zod";
import { rateLimit } from "express-rate-limit";

import {
  getPendingCreatorApplications,
  reviewApplication,
} from "../controllers/adminCreatorApplication.controller.js";

import {
  requireAuth,
} from "../middleware/auth.middleware.js";

import {
  requireAdmin,
} from "../middleware/authorize.middleware.js";

import {
  requireTrustedOrigin,
} from "../middleware/csrf.middleware.js";

import {
  validate,
} from "../middleware/validate.middleware.js";

import {
  reviewCreatorApplicationParamsSchema,
  reviewCreatorApplicationSchema,
} from "../validators/creatorApplication.validators.js";

/**
 * ============================================================
 * PREMIUMCHAT ADMIN CREATOR APPLICATION ROUTES
 * ============================================================
 *
 * Intended mount point:
 *
 * /api/admin/creator-applications
 *
 * Endpoints:
 *
 * GET   /
 * PATCH /:userId/review
 *
 * Security:
 *
 * - Valid authenticated session required.
 * - Active ADMIN account required.
 * - Review requests require trusted origin.
 * - Request parameters are validated.
 * - Review operations are rate limited.
 */

const router = Router();

/**
 * ============================================================
 * ADMIN AUTHORIZATION
 * ============================================================
 *
 * Applied to every route in this router.
 *
 * requireAuth loads the authenticated user.
 * requireAdmin verifies the user's server-side role.
 */

router.use(requireAuth);
router.use(requireAdmin);

/**
 * ============================================================
 * REVIEW RATE LIMITER
 * ============================================================
 *
 * Protects review endpoints from excessive requests.
 *
 * Rate limiting supplements authorization and
 * atomic database updates; it does not replace them.
 */

const adminReviewLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,

  limit: 30,

  standardHeaders: "draft-8",

  legacyHeaders: false,

  handler: (req, res) => {
    return res.status(429).json({
      success: false,

      message:
        "Too many creator application review requests. Please try again later.",

      code: "ADMIN_REVIEW_RATE_LIMIT",

      requestId: req.requestId,
    });
  },
});

/**
 * ============================================================
 * LIST QUERY VALIDATION
 * ============================================================
 *
 * Supports:
 *
 * ?page=1&limit=20
 *
 * Both parameters are optional.
 *
 * Maximum page size: 100.
 */

const listApplicationsQuerySchema = z
  .object({
    page: z.coerce
      .number()
      .int()
      .min(1)
      .default(1),

    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .default(20),
  })
  .strict();

/**
 * ============================================================
 * GET PENDING CREATOR APPLICATIONS
 * ============================================================
 *
 * GET /api/admin/creator-applications
 *
 * Only active administrators can retrieve
 * pending creator applications.
 */

router.get(
  "/",
  validate({
    query: listApplicationsQuerySchema,
  }),
  getPendingCreatorApplications
);

/**
 * ============================================================
 * REVIEW CREATOR APPLICATION
 * ============================================================
 *
 * PATCH /api/admin/creator-applications/:userId/review
 *
 * Request body:
 *
 * {
 *   "decision": "APPROVE"
 * }
 *
 * OR:
 *
 * {
 *   "decision": "REJECT"
 * }
 *
 * The service ensures that:
 *
 * - Only PENDING applications can be reviewed.
 * - Approval assigns the CREATOR role atomically.
 * - Rejection preserves the USER role.
 * - Reviewer identity and timestamp are recorded.
 * - Duplicate reviews are rejected.
 */

router.patch(
  "/:userId/review",
  requireTrustedOrigin,
  adminReviewLimiter,
  validate({
    params: reviewCreatorApplicationParamsSchema,
    body: reviewCreatorApplicationSchema,
  }),
  reviewApplication
);

export default router;
