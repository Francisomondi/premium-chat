import { Router } from "express";

import {
  requireAuth,
} from "../middleware/auth.middleware.js";

import {
  requireCreator,
} from "../middleware/creator.middleware.js";

import {
  createMySubscriptionPlan,
  getMySubscriptionPlans,
  updateMySubscriptionPlan,
  updateMySubscriptionPlanStatus,
} from "../controllers/creatorSubscriptionPlan.controller.js";

/**
 * ============================================================
 * PREMIUMCHAT — CREATOR SUBSCRIPTION PLAN ROUTES
 * ============================================================
 *
 * All routes require:
 *
 * - Authentication
 * - Active account
 * - Valid adult verification
 * - Approved creator status
 */

const router = Router();

router.use(requireAuth);

router.use(requireCreator);

/**
 * CREATE PLAN
 */

router.post(
  "/",
  createMySubscriptionPlan
);

/**
 * GET MY PLANS
 */

router.get(
  "/",
  getMySubscriptionPlans
);

/**
 * UPDATE PLAN STATUS
 *
 * Register before the general :planId route.
 */

router.patch(
  "/:planId/status",
  updateMySubscriptionPlanStatus
);

/**
 * UPDATE PLAN
 */

router.patch(
  "/:planId",
  updateMySubscriptionPlan
);

export default router;