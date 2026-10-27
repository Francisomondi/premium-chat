import express from "express";

import rateLimit from "express-rate-limit";

import {
  getPublicCreators,
  getPublicCreatorProfile,
} from "../controllers/creatorDiscovery.controller.js";

/**
 * ============================================================
 * PREMIUMCHAT — PUBLIC CREATOR DISCOVERY ROUTES
 * ============================================================
 *
 * Base path:
 *
 * /api/creators
 *
 * Endpoints:
 *
 * GET /api/creators
 * GET /api/creators/:creatorId
 *
 * Public access.
 */

const router = express.Router();

/**
 * ============================================================
 * DISCOVERY RATE LIMITER
 * ============================================================
 */

const discoveryLimiter = rateLimit({
  windowMs: 60 * 1000,

  limit: 60,

  standardHeaders: "draft-7",

  legacyHeaders: false,

  message: {
    success: false,
    message:
      "Too many creator discovery requests. Please try again later.",
    code: "CREATOR_DISCOVERY_RATE_LIMIT",
  },
});

/**
 * ============================================================
 * GET CREATOR LIST
 * ============================================================
 */

router.get(
  "/",
  discoveryLimiter,
  getPublicCreators
);

/**
 * ============================================================
 * GET CREATOR PROFILE
 * ============================================================
 */

router.get(
  "/:creatorId",
  discoveryLimiter,
  getPublicCreatorProfile
);

export default router;