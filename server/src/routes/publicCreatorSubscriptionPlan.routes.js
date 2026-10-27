import { Router } from "express";

import {
  getCreatorPublicSubscriptionPlans,
} from "../controllers/creatorSubscriptionPlan.controller.js";

/**
 * ============================================================
 * PREMIUMCHAT — PUBLIC CREATOR SUBSCRIPTION PLANS
 * ============================================================
 *
 * Public endpoint:
 *
 * GET /api/creators/:creatorId/subscription-plans
 *
 * Only publicly available plan information
 * is returned.
 */

const router = Router();

router.get(
  "/:creatorId/subscription-plans",
  getCreatorPublicSubscriptionPlans
);

export default router;