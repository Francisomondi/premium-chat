import mongoose from "mongoose";

import User from "../models/User.model.js";

import SubscriberSubscription, {
  SUBSCRIPTION_STATUSES,
} from "../models/SubscriberSubscription.model.js";

/**
 * ============================================================
 * PREMIUMCHAT — SUBSCRIPTION AUTHORIZATION SERVICE
 * ============================================================
 *
 * Determines whether a subscriber is eligible
 * to access a creator's subscription-only content.
 *
 * SECURITY:
 *
 * - Never trusts client-provided subscription status.
 * - Never grants access based on PENDING subscriptions.
 * - Never grants access after paid-period expiration.
 * - Never grants access to suspended subscriptions.
 * - Requires trusted payment verification.
 *
 * Until payment verification is implemented,
 * paid access is denied by default.
 */

/**
 * ============================================================
 * ACCESS DENIAL REASONS
 * ============================================================
 */

export const SUBSCRIPTION_ACCESS_REASONS =
  Object.freeze({
    INVALID_SUBSCRIBER: "INVALID_SUBSCRIBER",

    INVALID_CREATOR: "INVALID_CREATOR",

    SUBSCRIBER_UNAVAILABLE:
      "SUBSCRIBER_UNAVAILABLE",

    SUBSCRIBER_NOT_ELIGIBLE:
      "SUBSCRIBER_NOT_ELIGIBLE",

    CREATOR_UNAVAILABLE:
      "CREATOR_UNAVAILABLE",

    SUBSCRIPTION_REQUIRED:
      "SUBSCRIPTION_REQUIRED",

    SUBSCRIPTION_EXPIRED:
      "SUBSCRIPTION_EXPIRED",

    PAYMENT_VERIFICATION_REQUIRED:
      "PAYMENT_VERIFICATION_REQUIRED",

    ACCESS_GRANTED:
      "ACCESS_GRANTED",
  });

/**
 * ============================================================
 * DENIED RESULT HELPER
 * ============================================================
 */

const deny = (reason) => ({
  hasAccess: false,

  reason,

  subscription: null,
});

/**
 * ============================================================
 * IDENTIFIER VALIDATION
 * ============================================================
 */

const isValidIdentifier = (value) =>
  typeof value === "string" &&
  mongoose.isObjectIdOrHexString(value);

/**
 * ============================================================
 * PAYMENT VERIFICATION
 * ============================================================
 *
 * This function deliberately denies paid access.
 *
 * It must be replaced by a trusted verification
 * implementation when the payment module exists.
 *
 * IMPORTANT:
 *
 * Do not change this function to return true
 * merely because lastPaymentId is populated.
 *
 * A payment reference alone does not establish
 * successful payment or rule out reversals.
 */

const verifySubscriptionPayment = async (
  _subscription
) => {
  return false;
};

/**
 * ============================================================
 * CHECK SUBSCRIPTION AUTHORIZATION
 * ============================================================
 */

export const authorizeSubscriberAccess =
  async ({
    subscriberId,
    creatorId,
  }) => {
    /**
     * Validate identifiers.
     */

    if (
      !isValidIdentifier(
        subscriberId
      )
    ) {
      return deny(
        SUBSCRIPTION_ACCESS_REASONS.INVALID_SUBSCRIBER
      );
    }

    if (
      !isValidIdentifier(
        creatorId
      )
    ) {
      return deny(
        SUBSCRIPTION_ACCESS_REASONS.INVALID_CREATOR
      );
    }

    /**
     * Validate subscriber.
     */

    const subscriber =
      await User.findById(
        subscriberId
      );

    if (
      !subscriber ||
      !subscriber.isAccountActive()
    ) {
      return deny(
        SUBSCRIPTION_ACCESS_REASONS.SUBSCRIBER_UNAVAILABLE
      );
    }

    if (
      !subscriber.canAccessRestrictedContent()
    ) {
      return deny(
        SUBSCRIPTION_ACCESS_REASONS.SUBSCRIBER_NOT_ELIGIBLE
      );
    }

    /**
     * Validate creator.
     */

    const creator =
      await User.findById(
        creatorId
      );

    if (
      !creator ||
      !creator.canUseCreatorFeatures()
    ) {
      return deny(
        SUBSCRIPTION_ACCESS_REASONS.CREATOR_UNAVAILABLE
      );
    }

    /**
     * Find current active subscription.
     */

    const now = new Date();

    const subscription =
      await SubscriberSubscription.findOne({
        subscriberId,

        creatorId,

        status:
          SUBSCRIPTION_STATUSES.ACTIVE,

        currentPeriodStart: {
          $lte: now,
        },

        currentPeriodEnd: {
          $gt: now,
        },

        suspendedAt: null,
      }).sort({
        currentPeriodEnd: -1,
      });

    if (!subscription) {
      return deny(
        SUBSCRIPTION_ACCESS_REASONS.SUBSCRIPTION_REQUIRED
      );
    }

    /**
     * Defense-in-depth:
     * recheck model entitlement.
     */

    if (
      !subscription.hasActiveAccess(
        now
      )
    ) {
      return deny(
        SUBSCRIPTION_ACCESS_REASONS.SUBSCRIPTION_EXPIRED
      );
    }

    /**
     * Require trusted payment verification.
     */

    const paymentVerified =
      await verifySubscriptionPayment(
        subscription
      );

    if (!paymentVerified) {
      return deny(
        SUBSCRIPTION_ACCESS_REASONS.PAYMENT_VERIFICATION_REQUIRED
      );
    }

    /**
     * Access is granted only after
     * every authorization condition passes.
     */

    return {
      hasAccess: true,

      reason:
        SUBSCRIPTION_ACCESS_REASONS.ACCESS_GRANTED,

      subscription,
    };
  };