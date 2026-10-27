import {
  authorizeSubscriberAccess,
  SUBSCRIPTION_ACCESS_REASONS,
} from "../services/subscriptionAuthorization.service.js";

/**
 * ============================================================
 * PREMIUMCHAT — SUBSCRIPTION ACCESS MIDDLEWARE
 * ============================================================
 *
 * Protects subscription-only creator content.
 *
 * REQUIREMENTS:
 *
 * - requireAuth must run before this middleware.
 * - Creator identity must come from a trusted source.
 * - Payment verification must be implemented
 *   before paid access can be granted.
 *
 * This middleware does not unlock individually
 * purchased media.
 */

/**
 * ============================================================
 * REQUIRE ACTIVE SUBSCRIPTION
 * ============================================================
 *
 * creatorIdResolver:
 *
 * A function that obtains the creator ID
 * from a trusted route or resource context.
 *
 * Example:
 *
 * requireActiveSubscription(
 *   (req) => req.premiumContent.creatorId
 * )
 *
 * IMPORTANT:
 *
 * The resolver should normally use a creator ID
 * obtained from a server-side content lookup.
 *
 * Do not blindly trust a creatorId supplied
 * by the frontend when authorizing a specific
 * protected content resource.
 */

export const requireActiveSubscription =
  (creatorIdResolver) => {
    if (
      typeof creatorIdResolver !== "function"
    ) {
      throw new TypeError(
        "requireActiveSubscription requires a creatorIdResolver function."
      );
    }

    return async (
      req,
      res,
      next
    ) => {
      try {
        /**
         * Authentication must already
         * have populated req.auth.
         */

        const subscriberId =
          req.auth?.userId;

        if (!subscriberId) {
          return res.status(401).json({
            success: false,

            code: "AUTH_REQUIRED",

            message:
              "Authentication is required.",
          });
        }

        /**
         * Resolve the creator associated
         * with the protected resource.
         */

        const creatorId =
          await creatorIdResolver(
            req
          );

        if (!creatorId) {
          return res.status(404).json({
            success: false,

            code: "PREMIUM_CONTENT_NOT_FOUND",

            message:
              "Premium content was not found.",
          });
        }

        /**
         * Evaluate subscription access.
         */

        const result =
          await authorizeSubscriberAccess({
            subscriberId,
            creatorId:
              creatorId.toString(),
          });

        if (!result.hasAccess) {
          const isInvalidResource =
            result.reason ===
            SUBSCRIPTION_ACCESS_REASONS.INVALID_CREATOR;

          return res.status(
            isInvalidResource ? 404 : 403
          ).json({
            success: false,

            code:
              "SUBSCRIPTION_ACCESS_DENIED",

            message:
              "An eligible, verified subscription is required to access this content.",
          });
        }

        /**
         * Attach trusted authorization
         * context for downstream handlers.
         */

        req.subscriptionAccess = {
          subscriberId,

          creatorId:
            creatorId.toString(),

          subscriptionId:
            result.subscription._id.toString(),

          currentPeriodEnd:
            result.subscription.currentPeriodEnd,
        };

        return next();
      } catch (error) {
        return next(error);
      }
    };
  };