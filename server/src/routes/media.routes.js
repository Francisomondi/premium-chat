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
} from "../controllers/mediaPurchase.controller.js";

import {
  createMediaUploadSchema,
  createMediaPurchaseSchema,
  mediaIdParamsSchema,
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