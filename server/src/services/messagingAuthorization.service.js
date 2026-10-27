import {
  verifyConversationAccess,
} from "./conversationAccess.service.js";

import {
  authorizeSubscriberAccess,
} from "./subscriptionAuthorization.service.js";

import {
  resolveConversationMessagingPolicy,
} from "./messagingPolicy.service.js";

import {
  MESSAGING_ACCESS_POLICIES,
} from "../constants/messaging.constants.js";

import AppError from "../utils/AppError.js";

/**
 * ============================================================
 * PREMIUMCHAT — MESSAGING AUTHORIZATION SERVICE
 * ============================================================
 *
 * Centralizes messaging permissions.
 *
 * SECURITY:
 *
 * - Always verify conversation membership.
 * - Never trust client-selected access policies.
 * - Resolve messaging policy from server data.
 * - Never interpret a feature toggle as payment.
 * - Deny unsupported paid messaging policies.
 */

/**
 * ============================================================
 * AUTHORIZE STANDARD MESSAGING
 * ============================================================
 */

export const authorizeStandardMessaging =
  async ({
    conversationId,
    userId,
    requireActive = true,
  }) => {
    return verifyConversationAccess({
      conversationId,
      userId,
      requireActive,
    });
  };

/**
 * ============================================================
 * AUTHORIZE SUBSCRIBER MESSAGING
 * ============================================================
 */

export const authorizeSubscriberMessaging =
  async ({
    conversationId,
    userId,
    requireActive = true,
  }) => {
    /**
     * STEP 1:
     * Verify conversation access.
     */

    const conversation =
      await verifyConversationAccess({
        conversationId,
        userId,
        requireActive,
      });

    const creatorId =
      conversation.creatorId.toString();

    const subscriberId =
      conversation.userId.toString();

    /**
     * STEP 2:
     * Allow the creator to manage their
     * own conversation.
     */

    if (
      userId.toString() === creatorId
    ) {
      return {
        authorized: true,

        conversation,

        subscription: null,

        accessType: "CREATOR",
      };
    }

    /**
     * STEP 3:
     * Verify subscriber identity.
     */

    if (
      userId.toString() !== subscriberId
    ) {
      throw new AppError(
        "Messaging access denied.",
        403,
        "MESSAGING_ACCESS_DENIED"
      );
    }

    /**
     * STEP 4:
     * Verify subscription entitlement.
     */

    const result =
      await authorizeSubscriberAccess({
        subscriberId,
        creatorId,
      });

    if (!result.hasAccess) {
      throw new AppError(
        "An active, verified subscription is required.",
        403,
        "SUBSCRIPTION_REQUIRED"
      );
    }

    return {
      authorized: true,

      conversation,

      subscription:
        result.subscription,

      accessType:
        "SUBSCRIBER",
    };
  };

/**
 * ============================================================
 * AUTHORIZE MESSAGE SENDING
 * ============================================================
 *
 * This is the main entry point for
 * message creation authorization.
 */

export const authorizeMessageSending =
  async ({
    conversationId,
    senderId,
  }) => {
    /**
     * STEP 1:
     * Verify standard conversation access.
     */

    const conversation =
      await verifyConversationAccess({
        conversationId,

        userId: senderId,

        requireActive: true,
      });

    /**
     * STEP 2:
     * Resolve trusted messaging policy.
     */

    const policy =
      await resolveConversationMessagingPolicy({
        conversationId,
      });

    /**
     * STEP 3:
     * Standard messaging.
     */

    if (
      policy.policy ===
      MESSAGING_ACCESS_POLICIES.STANDARD
    ) {
      return {
        authorized: true,

        conversation,

        policy,
      };
    }

    /**
     * STEP 4:
     * Subscriber-only messaging.
     */

    if (
      policy.policy ===
      MESSAGING_ACCESS_POLICIES.SUBSCRIBERS_ONLY
    ) {
      const result =
        await authorizeSubscriberMessaging({
          conversationId,

          userId: senderId,

          requireActive: true,
        });

      return {
        ...result,

        policy,
      };
    }

    /**
     * STEP 5:
     * Paid-per-message access.
     *
     * This requires a separate verified
     * payment entitlement.
     *
     * It is not implemented yet.
     */

    if (
      policy.policy ===
      MESSAGING_ACCESS_POLICIES.PAID_PER_MESSAGE
    ) {
      throw new AppError(
        "Paid-per-message access is not available yet.",
        403,
        "MESSAGE_PAYMENT_REQUIRED"
      );
    }

    /**
     * STEP 6:
     * Reject unsupported policies.
     */

    throw new AppError(
      "Unsupported messaging access policy.",
      403,
      "UNSUPPORTED_MESSAGING_POLICY"
    );
  };

export default {
  authorizeStandardMessaging,
  authorizeSubscriberMessaging,
  authorizeMessageSending,
};