import mongoose from "mongoose";

import Conversation from "../models/Conversation.model.js";

import CreatorMonetization from "../models/CreatorMonetization.model.js";

import {
  MESSAGING_ACCESS_POLICIES,
} from "../constants/messaging.constants.js";

import AppError from "../utils/AppError.js";

/**
 * ============================================================
 * PREMIUMCHAT — MESSAGING POLICY SERVICE
 * ============================================================
 *
 * Resolves the messaging policy for a conversation.
 *
 * SECURITY:
 *
 * - Conversation identity comes from MongoDB.
 * - Creator identity comes from the conversation.
 * - Monetization settings come from MongoDB.
 * - The client cannot choose the access policy.
 *
 * IMPORTANT:
 *
 * paidMessaging.isEnabled is a feature toggle,
 * not a subscription or payment entitlement.
 *
 * Existing conversations remain STANDARD
 * until an explicit paid messaging mode is
 * implemented.
 */

/**
 * ============================================================
 * RESOLVE CONVERSATION MESSAGING POLICY
 * ============================================================
 */

export const resolveConversationMessagingPolicy =
  async ({ conversationId }) => {
    /**
     * STEP 1:
     * Validate conversation ID.
     */

    if (
      !mongoose.isObjectIdOrHexString(
        conversationId
      )
    ) {
      throw new AppError(
        "Invalid conversation identifier.",
        400,
        "INVALID_CONVERSATION_ID"
      );
    }

    /**
     * STEP 2:
     * Retrieve the conversation.
     */

    const conversation =
      await Conversation.findById(
        conversationId
      )
        .select(
          "_id creatorId userId status isPaidConversation"
        )
        .lean();

    if (!conversation) {
      throw new AppError(
        "Conversation not found.",
        404,
        "CONVERSATION_NOT_FOUND"
      );
    }

    /**
     * STEP 3:
     * Retrieve creator monetization settings.
     */

    const monetization =
      await CreatorMonetization.findOne({
        creatorId:
          conversation.creatorId,
      })
        .select(
          "isEnabled subscription paidMessaging"
        )
        .lean();

    /**
     * STEP 4:
     * Determine whether paid messaging
     * is configured.
     */

    const paidMessagingEnabled =
      monetization?.isEnabled === true &&
      monetization?.paidMessaging
        ?.isEnabled === true;

    /**
     * STEP 5:
     * Resolve the current policy.
     *
     * IMPORTANT:
     *
     * Enabling paidMessaging does not
     * automatically require a subscription.
     *
     * We currently support STANDARD
     * messaging only.
     *
     * Paid messaging enforcement will
     * be introduced after an explicit
     * access mode and verified payment
     * entitlement are implemented.
     */

    const policy =
      MESSAGING_ACCESS_POLICIES.STANDARD;

    return {
      conversationId:
        conversation._id.toString(),

      creatorId:
        conversation.creatorId.toString(),

      userId:
        conversation.userId.toString(),

      policy,

      paidMessagingEnabled,

      subscriptionEnabled:
        monetization?.isEnabled === true &&
        monetization?.subscription
          ?.isEnabled === true,

      requiresSubscription: false,

      requiresMessagePayment: false,

      isPaidConversation:
        conversation.isPaidConversation === true,
    };
  };

export default {
  resolveConversationMessagingPolicy,
};