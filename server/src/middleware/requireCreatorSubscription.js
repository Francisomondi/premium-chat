import mongoose from "mongoose";

import {
  authorizeSubscriberAccess,
} from "../services/subscriptionAuthorization.service.js";

/**
 * ============================================================
 * PREMIUMCHAT — REQUIRE CREATOR SUBSCRIPTION
 * ============================================================
 *
 * Use after requireAuth.
 *
 * Expected:
 *
 * req.user.id = authenticated subscriber
 * req.params.creatorId = content creator
 *
 * IMPORTANT:
 *
 * For routes that identify content by contentId,
 * resolve the content's actual creator server-side
 * before running this middleware.
 */

export const requireCreatorSubscription =
  async (req, res, next) => {
    try {
      const subscriberId =
        req.user?.id?.toString();

      const creatorId =
        req.params.creatorId;

      if (!subscriberId) {
        return res.status(401).json({
          success: false,
          message: "Authentication required.",
          code: "AUTHENTICATION_REQUIRED",
        });
      }

      if (
        typeof creatorId !== "string" ||
        !mongoose.isObjectIdOrHexString(
          creatorId
        )
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid creator identifier.",
          code: "INVALID_CREATOR_ID",
        });
      }

      const authorization =
        await authorizeSubscriberAccess({
          subscriberId,
          creatorId,
        });

      if (!authorization.authorized) {
        return res.status(403).json({
          success: false,
          message:
            "An active, verified subscription is required.",
          code: "SUBSCRIPTION_ACCESS_DENIED",
        });
      }

      /**
       * Store the authorization result for
       * downstream controllers.
       *
       * Never accept this information from
       * the request body.
       */

      req.subscriptionAuthorization = {
        subscriptionId:
          authorization.subscriptionId,

        creatorId,

        subscriberId,

        expiresAt:
          authorization.expiresAt,
      };

      return next();
    } catch (error) {
      return next(error);
    }
  };

export default requireCreatorSubscription;