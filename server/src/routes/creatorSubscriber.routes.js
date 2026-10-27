import { Router } from "express";

import { requireAuth } from "../middleware/auth.middleware.js";

import { requireCreator } from "../middleware/creator.middleware.js";

import {
  getMyCreatorSubscribers,
} from "../controllers/subscriberSubscription.controller.js";

/**
 * ============================================================
 * PREMIUMCHAT — CREATOR SUBSCRIBER ROUTES
 * ============================================================
 *
 * Base path:
 *
 * /api/creator/subscribers
 *
 * Security requirements:
 *
 * - Valid authenticated session
 * - Active user account
 * - Approved creator role
 * - Valid adult verification
 *
 * Creator identity is obtained from:
 *
 * req.auth.userId
 *
 * No creatorId is accepted from the request body
 * or query parameters.
 */

const router = Router();

/**
 * ============================================================
 * REQUIRE AUTHENTICATION
 * ============================================================
 */

router.use(requireAuth);

/**
 * ============================================================
 * REQUIRE APPROVED CREATOR
 * ============================================================
 *
 * Uses the existing creator authorization
 * middleware from Module 4.3.3.
 */

router.use(requireCreator);

/**
 * ============================================================
 * GET MY SUBSCRIBERS
 * ============================================================
 *
 * GET /api/creator/subscribers
 *
 * Optional query parameters:
 *
 * ?page=1&limit=20
 *
 * Returns subscription records associated
 * with the authenticated creator.
 *
 * Subscriber details are limited to the
 * fields selected by the service.
 */

router.get(
  "/",
  getMyCreatorSubscribers
);

export default router;