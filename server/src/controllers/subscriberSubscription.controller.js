import {
  createPendingSubscription,
  getMySubscriptions,
  getCreatorSubscribers,
  cancelMySubscription as cancelSubscriptionService,
  
} from "../services/subscriberSubscription.service.js";

import {
  authorizeSubscriberAccess,
} from "../services/subscriptionAuthorization.service.js";

/**
 * ============================================================
 * PREMIUMCHAT — SUBSCRIBER SUBSCRIPTION CONTROLLER
 * ============================================================
 *
 * Responsibilities:
 *
 * 1. Create pending subscription requests
 * 2. Retrieve authenticated subscriber history
 * 3. Retrieve authenticated creator subscriber records
 * 4. Cancel pending subscriptions
 * 5. Disable renewal for existing subscriptions
 * 6. Check subscription entitlement
 *
 * SECURITY:
 *
 * - User identity comes from req.auth.userId.
 * - No client-provided subscriberId is trusted.
 * - No client-provided creatorId is trusted for
 *   creator management operations.
 * - Payment confirmation is not handled here.
 * - ACTIVE status cannot be assigned here.
 * - Billing periods cannot be modified here.
 */

/**
 * ============================================================
 * CREATE PENDING SUBSCRIPTION
 * ============================================================
 *
 * POST /api/subscriptions
 *
 * Authentication required.
 *
 * Request body:
 *
 * {
 *   "planId": "PLAN_OBJECT_ID",
 *   "clientRequestId": "UNIQUE_REQUEST_IDENTIFIER"
 * }
 *
 * The service:
 *
 * - Validates the selected plan
 * - Checks creator eligibility
 * - Checks subscriber eligibility
 * - Prevents self-subscription
 * - Prevents overlapping subscriptions
 * - Enforces request idempotency
 * - Creates a PENDING subscription
 *
 * IMPORTANT:
 *
 * Creating a subscription does not activate
 * premium access or charge the subscriber.
 */

export const createMySubscription = async (
  req,
  res,
  next
) => {
  try {
    const subscriberId = req.auth.userId;

    const result = await createPendingSubscription(
      subscriberId,
      req.body
    );

    const { subscription, created } = result;

    return res.status(created ? 201 : 200).json({
      success: true,

      message: created
        ? "Subscription request created successfully."
        : "Existing subscription request retrieved successfully.",

      data: {
        subscription,
        created,
      },
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * ============================================================
 * GET MY SUBSCRIPTION HISTORY
 * ============================================================
 *
 * GET /api/subscriptions/me
 *
 * Authentication required.
 *
 * Optional query parameters:
 *
 * ?page=1&limit=20
 *
 * Returns only subscriptions belonging
 * to the authenticated subscriber.
 */

export const getMySubscriptionHistory = async (
  req,
  res,
  next
) => {
  try {
    const subscriberId = req.auth.userId;

    const { page, limit } = req.query;

    const result = await getMySubscriptions(
      subscriberId,
      {
        page,
        limit,
      }
    );

    return res.status(200).json({
      success: true,

      data: {
        subscriptions: result.subscriptions,

        pagination: result.pagination,
      },
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * ============================================================
 * GET MY CREATOR SUBSCRIBERS
 * ============================================================
 *
 * GET /api/creator/subscribers
 *
 * Authentication and approved creator
 * authorization are required.
 *
 * Optional query parameters:
 *
 * ?page=1&limit=20
 *
 * Returns subscription records belonging
 * to the authenticated creator.
 *
 * IMPORTANT:
 *
 * Creator authorization must be enforced
 * by requireCreator at the route level.
 */

export const getMyCreatorSubscribers = async (
  req,
  res,
  next
) => {
  try {
    const creatorId = req.auth.userId;

    const { page, limit } = req.query;

    const result = await getCreatorSubscribers(
      creatorId,
      {
        page,
        limit,
      }
    );

    return res.status(200).json({
      success: true,

      data: {
        subscriptions: result.subscriptions,

        pagination: result.pagination,
      },
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * ============================================================
 * CANCEL MY SUBSCRIPTION
 * ============================================================
 *
 * PATCH /api/subscriptions/:subscriptionId/cancel
 *
 * Authentication required.
 *
 * Behavior:
 *
 * PENDING:
 * - Cancel immediately.
 *
 * ACTIVE:
 * - Disable renewal.
 * - Preserve access until the paid period ends.
 *
 * PAST_DUE:
 * - Disable renewal.
 *
 * SUSPENDED:
 * - Disable renewal.
 *
 * CANCELED / EXPIRED:
 * - Return the existing subscription state.
 *
 * No request body is required.
 */

export const cancelMySubscription = async (
  req,
  res,
  next
) => {
  try {
    const subscriberId = req.auth.userId;

    const { subscriptionId } = req.params;

    const subscription =
      await cancelSubscriptionService(
        subscriberId,
        subscriptionId
      );

    return res.status(200).json({
      success: true,

      message:
        "Subscription cancellation request processed successfully.",

      data: {
        subscription,
      },
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * ============================================================
 * CHECK MY CREATOR SUBSCRIPTION ACCESS
 * ============================================================
 *
 * GET /api/subscriptions/access/:creatorId
 *
 * Authentication required.
 *
 * Returns whether the authenticated subscriber
 * currently has an eligible subscription
 * to the specified creator.
 *
 * IMPORTANT:
 *
 * This is a read-only entitlement check.
 *
 * It does not:
 *
 * - Confirm payment
 * - Activate subscriptions
 * - Grant access by itself
 * - Modify subscription status
 *
 * Actual premium content authorization
 * must be enforced on protected backend
 * routes in a later module.
 */

/**
 * ============================================================
 * CHECK MY CREATOR SUBSCRIPTION ACCESS
 * ============================================================
 *
 * GET /api/subscriptions/access/:creatorId
 *
 * Uses the same authorization service
 * as protected premium content routes.
 */

export const getMyCreatorSubscriptionAccess =
  async (req, res, next) => {
    try {
      const subscriberId =
        req.auth.userId;

      const { creatorId } =
        req.params;

      const result =
        await authorizeSubscriberAccess({
          subscriberId,
          creatorId,
        });

      return res.status(200).json({
        success: true,

        data: {
          creatorId,

          hasAccess:
            result.hasAccess,

          reason:
            result.reason,

          subscriptionId:
            result.hasAccess
              ? result.subscription._id
              : null,

          currentPeriodEnd:
            result.hasAccess
              ? result.subscription.currentPeriodEnd
              : null,
        },
      });
    } catch (error) {
      return next(error);
    }
  };