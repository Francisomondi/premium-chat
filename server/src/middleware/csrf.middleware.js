
import { env } from "../config/env.js";
import AppError from "../utils/AppError.js";

/**
 * ============================================================
 * PREMIUMCHAT CSRF PROTECTION MIDDLEWARE
 * ============================================================
 *
 * Protects state-changing API requests by requiring
 * the request Origin to match an explicitly allowed
 * frontend origin.
 *
 * Example allowed origins:
 * - http://localhost:5173
 * - https://premiumchat.example
 *
 * This middleware:
 * - Rejects requests without an Origin header.
 * - Rejects requests from unknown origins.
 * - Allows requests from configured frontend origins.
 *
 * Important:
 * This is a trusted-origin check, not a CSRF token
 * system. It must be applied consistently to all
 * cookie-authenticated state-changing endpoints.
 */

export const requireTrustedOrigin = (
  req,
  res,
  next
) => {
  const origin = req.get("origin");

  if (
    !origin ||
    !env.CLIENT_URLS.includes(origin)
  ) {
    return next(
      new AppError(
        "Request origin is not permitted.",
        403,
        "CSRF_ORIGIN_DENIED"
      )
    );
  }

  next();
};
