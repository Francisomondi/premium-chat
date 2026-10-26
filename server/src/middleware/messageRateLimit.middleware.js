import {
  checkMultipleSocketRateLimits,
} from "../socket/socketRateLimiter.js";

/**
 * ============================================================
 * PREMIUMCHAT — REST MESSAGE RATE LIMIT MIDDLEWARE
 * ============================================================
 *
 * Purpose:
 *
 * Protect REST message creation against excessive requests.
 *
 * Uses the same rate-limit store as Socket.IO.
 *
 * This prevents users from bypassing Socket.IO limits
 * by switching to the REST API.
 *
 * Policies:
 *
 * MESSAGE:
 *   10 messages per 10 seconds
 *
 * MESSAGE_BURST:
 *   3 messages per 2 seconds
 *
 * Requirements:
 *
 * - requireAuth must execute before this middleware.
 * - req.auth.userId must contain the authenticated user ID.
 *
 * This middleware must only be applied to message creation.
 */

/**
 * ============================================================
 * REST MESSAGE RATE LIMITER
 * ============================================================
 */

export const messageRateLimit = (
  req,
  res,
  next
) => {
  try {
    /**
     * STEP 1:
     * Obtain the authenticated user ID.
     *
     * Never trust a user ID supplied in the request body.
     */

    const userId = req.auth?.userId;

    if (
      typeof userId !== "string" ||
      !userId.trim()
    ) {
      return res.status(401).json({
        success: false,

        message:
          "Authentication is required to send messages.",

        code: "AUTHENTICATION_REQUIRED",

        requestId: req.requestId,
      });
    }

    /**
     * STEP 2:
     * Check both sustained and burst limits.
     *
     * The shared limiter consumes a request only
     * when all configured policies allow it.
     */

    const rateLimit =
      checkMultipleSocketRateLimits({
        userId,

        policyNames: [
          "MESSAGE",
          "MESSAGE_BURST",
        ],
      });

    /**
     * STEP 3:
     * Reject excessive requests.
     */

    if (!rateLimit.allowed) {
      const retryAfterMs = Math.max(
        1,
        rateLimit.retryAfterMs
      );

      /**
       * Retry-After uses seconds.
       *
       * Round up so clients do not retry
       * before the rate-limit window resets.
       */

      const retryAfterSeconds =
        Math.ceil(
          retryAfterMs / 1000
        );

      res.set(
        "Retry-After",
        String(retryAfterSeconds)
      );

      return res.status(429).json({
        success: false,

        message:
          "You are sending messages too quickly. Please wait before trying again.",

        code: "MESSAGE_RATE_LIMITED",

        retryAfterMs,

        requestId: req.requestId,
      });
    }

    /**
     * STEP 4:
     * Continue to the message controller.
     */

    return next();
  } catch (error) {
    return next(error);
  }
};

export default messageRateLimit;