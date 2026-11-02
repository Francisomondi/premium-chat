
import { Router } from "express";

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
  messageRateLimit,
} from "../middleware/messageRateLimit.middleware.js";

import {
  createMediaUploadController,
  completeMediaUploadController,
} from "../controllers/mediaUpload.controller.js";

import {
  createMediaDeliveryController,
} from "../controllers/mediaDelivery.controller.js";

import {
  createMediaUploadSchema,
  mediaIdParamsSchema,
} from "../validators/media.validators.js";

/**
 * ============================================================
 * PREMIUMCHAT PRIVATE MEDIA ROUTES
 * ============================================================
 *
 * All endpoints require authentication.
 *
 * Private media is only delivered after authorization,
 * conversation membership verification where applicable,
 * and successful generation of a short-lived signed URL.
 */

const router = Router();

router.use(requireAuth);

/**
 * ============================================================
 * CREATE PRIVATE MEDIA UPLOAD
 * POST /api/media/uploads
 * ============================================================
 */

router.post(
  "/uploads",

  requireTrustedOrigin,

  validate({
    body: createMediaUploadSchema,
  }),

  messageRateLimit,

  createMediaUploadController
);

/**
 * ============================================================
 * COMPLETE MEDIA UPLOAD
 * POST /api/media/:mediaId/complete
 * ============================================================
 */

router.post(
  "/:mediaId/complete",

  requireTrustedOrigin,

  validate({
    params: mediaIdParamsSchema,
  }),

  messageRateLimit,

  completeMediaUploadController
);

/**
 * ============================================================
 * REQUEST AUTHORIZED MEDIA DELIVERY URL
 * GET /api/media/:mediaId/access
 * ============================================================
 *
 * Authentication is mandatory.
 * The delivery service verifies media access and,
 * for conversation-linked media, active membership.
 *
 * GET is a read-only operation, so CSRF origin
 * protection is not applied here.
 */

router.get(
  "/:mediaId/access",

  validate({
    params: mediaIdParamsSchema,
  }),

  messageRateLimit,

  createMediaDeliveryController
);

export default router;
