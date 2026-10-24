import { rateLimit } from "express-rate-limit";

import { env } from "../config/env.js";

/**
 * ============================================================
 * COMMON RATE LIMIT RESPONSE
 * ============================================================
 */

const rateLimitHandler = (req, res) => {
  return res.status(429).json({
    success: false,
    message:
      "Too many requests. Please try again later.",
    code: "RATE_LIMIT_EXCEEDED",
    requestId: req.requestId,
  });
};

/**
 * ============================================================
 * GLOBAL API LIMITER
 * ============================================================
 */

export const globalApiLimiter = rateLimit({
  windowMs: env.GLOBAL_RATE_LIMIT_WINDOW_MS,

  limit: env.GLOBAL_RATE_LIMIT_MAX,

  standardHeaders: "draft-8",
  legacyHeaders: false,

  handler: rateLimitHandler,
});

/**
 * ============================================================
 * AUTHENTICATION LIMITER
 * ============================================================
 *
 * Apply this to registration/login/reset endpoints
 * when they are implemented in Module 2.
 */

export const authLimiter = rateLimit({
  windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,

  limit: env.AUTH_RATE_LIMIT_MAX,

  standardHeaders: "draft-8",
  legacyHeaders: false,

  skipSuccessfulRequests: true,

  handler: rateLimitHandler,
});