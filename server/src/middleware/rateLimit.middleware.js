
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
 * M-PESA CALLBACK PATH
 * ============================================================
 */

const getMpesaCallbackPath = () =>
  `${env.API_PREFIX}/payments/mpesa/callback`
    .replace(/\/+$/, "");

/**
 * ============================================================
 * GLOBAL API LIMITER
 * ============================================================
 *
 * The M-Pesa callback has a dedicated limiter.
 *
 * It must not share the ordinary API request quota.
 */

export const globalApiLimiter = rateLimit({
  windowMs: env.GLOBAL_RATE_LIMIT_WINDOW_MS,

  limit: env.GLOBAL_RATE_LIMIT_MAX,

  standardHeaders: "draft-8",
  legacyHeaders: false,

  skip(req) {
    const requestPath = req.originalUrl
      .split("?")[0]
      .replace(/\/+$/, "");

    return requestPath === getMpesaCallbackPath();
  },

  handler: rateLimitHandler,
});

/**
 * ============================================================
 * M-PESA CALLBACK LIMITER
 * ============================================================
 *
 * Dedicated protection for public provider callbacks.
 *
 * Higher quota accommodates legitimate callback bursts
 * and provider retries.
 */

export const mpesaCallbackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,

  limit: 1000,

  standardHeaders: "draft-8",
  legacyHeaders: false,

  handler: rateLimitHandler,
});

/**
 * ============================================================
 * AUTHENTICATION LIMITER
 * ============================================================
 */

export const authLimiter = rateLimit({
  windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,

  limit: env.AUTH_RATE_LIMIT_MAX,

  standardHeaders: "draft-8",
  legacyHeaders: false,

  skipSuccessfulRequests: true,

  handler: rateLimitHandler,
});
