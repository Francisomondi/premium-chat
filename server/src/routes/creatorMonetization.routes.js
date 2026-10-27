import { Router } from "express";

import {
  requireAuth,
} from "../middleware/auth.middleware.js";

import {
  requireCreator,
} from "../middleware/creator.middleware.js";

import {
  getMyMonetizationSettings,
  updateMyMonetizationSettings,
} from "../controllers/creatorMonetization.controller.js";

/**
 * ============================================================
 * PREMIUMCHAT — CREATOR MONETIZATION ROUTES
 * ============================================================
 */

const router = Router();

/**
 * All routes require:
 *
 * 1. Valid authenticated session.
 * 2. Approved creator account.
 * 3. Valid adult verification.
 */

router.use(requireAuth);

router.use(requireCreator);

/**
 * GET CREATOR SETTINGS
 */

router.get(
  "/monetization",
  getMyMonetizationSettings
);

/**
 * UPDATE CREATOR SETTINGS
 */

router.patch(
  "/monetization",
  updateMyMonetizationSettings
);

export default router;