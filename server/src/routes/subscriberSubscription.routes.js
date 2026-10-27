import { Router } from "express";

import { requireAuth } from "../middleware/auth.middleware.js";

import {
  createMySubscription,
  getMySubscriptionHistory,
  cancelMySubscription,
  getMyCreatorSubscriptionAccess,
} from "../controllers/subscriberSubscription.controller.js";

/**
 * ============================================================
 * PREMIUMCHAT — SUBSCRIBER SUBSCRIPTION ROUTES
 * ============================================================
 *
 * Base path:
 *
 * /api/subscriptions
 *
 * All routes require authentication.
 *
 * Subscriber identity is obtained from:
 *
 * req.auth.userId
 *
 * SECURITY:
 *
 * - Users cannot create subscriptions for other users.
 * - Users cannot retrieve another subscriber's history.
 * - Users cannot cancel another subscriber's subscription.
 * - Client requests cannot activate paid subscriptions.
 * - Payment confirmation is handled separately.
 */

const router = Router();

/**
 * ============================================================
 * AUTHENTICATION
 * ============================================================
 *
 * Protect all subscriber subscription endpoints.
 */

router.use(requireAuth);

/**
 * ============================================================
 * CREATE PENDING SUBSCRIPTION
 * ============================================================
 *
 * POST /api/subscriptions
 *
 * Body:
 *
 * {
 *   "planId": "PLAN_OBJECT_ID",
 *   "clientRequestId": "UNIQUE_REQUEST_IDENTIFIER"
 * }
 *
 * Expected:
 *
 * 201 Created — New pending subscription
 * 200 OK      — Idempotent request replay
 *
 * No paid access is granted.
 */

router.post(
  "/",
  createMySubscription
);

/**
 * ============================================================
 * GET MY SUBSCRIPTION HISTORY
 * ============================================================
 *
 * GET /api/subscriptions/me
 *
 * Optional query parameters:
 *
 * ?page=1&limit=20
 *
 * Only the authenticated user's
 * subscriptions are returned.
 */

router.get(
  "/me",
  getMySubscriptionHistory
);

/**
 * ============================================================
 * CHECK MY SUBSCRIPTION ACCESS
 * ============================================================
 *
 * GET /api/subscriptions/access/:creatorId
 *
 * Returns the current subscription entitlement
 * for the authenticated subscriber.
 *
 * This endpoint does not activate subscriptions.
 */

router.get(
  "/access/:creatorId",
  getMyCreatorSubscriptionAccess
);

/**
 * ============================================================
 * CANCEL MY SUBSCRIPTION
 * ============================================================
 *
 * PATCH /api/subscriptions/:subscriptionId/cancel
 *
 * PENDING:
 * - Cancel immediately.
 *
 * ACTIVE:
 * - Disable renewal.
 * - Preserve the current paid period.
 *
 * PAST_DUE:
 * - Disable renewal.
 *
 * SUSPENDED:
 * - Disable renewal.
 *
 * CANCELED / EXPIRED:
 * - Return the existing state.
 *
 * No request body is required.
 */

router.patch(
  "/:subscriptionId/cancel",
  cancelMySubscription
);

export default router;