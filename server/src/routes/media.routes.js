
import { Router } from "express";

import { requireAuth } from "../middleware/auth.middleware.js";
import { requireTrustedOrigin } from "../middleware/csrf.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import { messageRateLimit } from "../middleware/messageRateLimit.middleware.js";

import {
  createMediaUploadController,
  completeMediaUploadController,
} from "../controllers/mediaUpload.controller.js";

import {
  createMediaDeliveryController,
} from "../controllers/mediaDelivery.controller.js";

import {
  createMediaPreviewController,
} from "../controllers/mediaPreview.controller.js";

import {
  createMediaPurchaseController,
  getMediaPurchaseStatusController,
} from "../controllers/mediaPurchase.controller.js";

import {
  createMediaUploadSchema,
  createMediaPurchaseSchema,
  mediaIdParamsSchema,
  mediaPurchaseIdParamsSchema,
} from "../validators/media.validators.js";

const router = Router();

router.use(requireAuth);

/*
 * CREATE PRIVATE MEDIA UPLOAD
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

/*
 * COMPLETE MEDIA UPLOAD
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

/*
 * RESERVE MEDIA PURCHASE AND INITIATE M-PESA
 */
router.post(
  "/:mediaId/purchase",
  requireTrustedOrigin,
  validate({
    params: mediaIdParamsSchema,
    body: createMediaPurchaseSchema,
  }),
  messageRateLimit,
  createMediaPurchaseController
);

/*
 * REFRESH PAID-MEDIA PURCHASE STATUS
 *
 * Does not initiate another STK Push.
 * Financial verification is performed server-side.
 */
router.get(
  "/purchases/:purchaseId/status",
  validate({
    params: mediaPurchaseIdParamsSchema,
  }),
  messageRateLimit,
  getMediaPurchaseStatusController
);

/*
 * AUTHORIZE BLURRED CHAT IMAGE PREVIEW
 */
router.get(
  "/:mediaId/preview",
  validate({
    params: mediaIdParamsSchema,
  }),
  messageRateLimit,
  createMediaPreviewController
);

/*
 * AUTHORIZE PRIVATE MEDIA DELIVERY
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
