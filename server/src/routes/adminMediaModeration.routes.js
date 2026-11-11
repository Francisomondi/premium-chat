
import { Router } from "express";

import {
  requireAuth,
} from "../middleware/auth.middleware.js";

import {
  requireAdmin,
} from "../middleware/authorize.middleware.js";

import {
  getPendingMediaForModerationController,
  approveGalleryMediaController,
  rejectGalleryMediaController,
} from "../controllers/adminMediaModeration.controller.js";

import {
  getAdminMediaPreviewController,
} from "../controllers/adminMediaPreview.controller.js";

const router = Router();

/**
 * All admin media moderation routes require:
 * 1. An authenticated user
 * 2. A verified ADMIN role
 */
router.use(requireAuth);
router.use(requireAdmin);

/**
 * GET /api/admin/media
 * List processed gallery media awaiting moderation.
 */
router.get(
  "/media",
  getPendingMediaForModerationController
);


router.get(
  "/media/:mediaId/preview",
  getAdminMediaPreviewController
);
/**
 * PATCH /api/admin/media/:mediaId/approve
 * Approve processed gallery media.
 */
router.patch(
  "/media/:mediaId/approve",
  approveGalleryMediaController
);

/**
 * PATCH /api/admin/media/:mediaId/reject
 * Reject processed gallery media.
 */
router.patch(
  "/media/:mediaId/reject",
  rejectGalleryMediaController
);

export default router;
