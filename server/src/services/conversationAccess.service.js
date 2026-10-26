import mongoose from "mongoose";

import Conversation from "../models/Conversation.model.js";
import User from "../models/User.model.js";

import {
  ACCOUNT_STATUSES,
} from "../constants/account.constants.js";

import AppError from "../utils/AppError.js";

/**
 * ============================================================
 * PREMIUMCHAT — CONVERSATION ACCESS SERVICE
 * ============================================================
 *
 * Centralized authorization for private conversations.
 *
 * Access policies:
 *
 * ACTIVE:
 *   Read and write.
 *
 * ARCHIVED:
 *   Read only.
 *
 * BLOCKED:
 *   No access.
 *
 * Both participants must have active accounts.
 */

const CONVERSATION_STATUSES = Object.freeze({
  ACTIVE: "ACTIVE",
  ARCHIVED: "ARCHIVED",
  BLOCKED: "BLOCKED",
});

const createAccessError = () => {
  return new AppError(
    "Conversation not found or access denied.",
    404,
    "CONVERSATION_ACCESS_DENIED"
  );
};

/**
 * ============================================================
 * VERIFY CONVERSATION ACCESS
 * ============================================================
 */

export const verifyConversationAccess = async ({
  conversationId,
  userId,
  requireActive = false,
}) => {
  /**
   * STEP 1:
   * Validate identifiers.
   */

  if (
    !mongoose.isObjectIdOrHexString(conversationId) ||
    !mongoose.isObjectIdOrHexString(userId)
  ) {
    throw createAccessError();
  }

  /**
   * STEP 2:
   * Find the conversation.
   *
   * Restrict the query to conversations
   * containing the authenticated user.
   */

  const conversation =
    await Conversation.findOne({
      _id: conversationId,
      participants: userId,
    }).lean();

  if (!conversation) {
    throw createAccessError();
  }

  /**
   * STEP 3:
   * Reject blocked conversations.
   */

  if (
    conversation.status ===
    CONVERSATION_STATUSES.BLOCKED
  ) {
    throw createAccessError();
  }

  /**
   * STEP 4:
   * Enforce active conversations
   * for write operations.
   */

  if (
    requireActive &&
    conversation.status !==
      CONVERSATION_STATUSES.ACTIVE
  ) {
    throw new AppError(
      "This conversation is not available for messaging.",
      403,
      "CONVERSATION_NOT_ACTIVE"
    );
  }

  /**
   * STEP 5:
   * Validate both participants.
   */

  const participantIds =
    conversation.participants.map(
      (participantId) =>
        participantId.toString()
    );

  if (
    participantIds.length !== 2 ||
    new Set(participantIds).size !== 2 ||
    !participantIds.includes(userId.toString())
  ) {
    throw createAccessError();
  }

  /**
   * STEP 6:
   * Confirm both participants
   * have active accounts.
   */

  const activeParticipantCount =
    await User.countDocuments({
      _id: {
        $in: participantIds,
      },

      accountStatus:
        ACCOUNT_STATUSES.ACTIVE,
    });

  if (activeParticipantCount !== 2) {
    throw new AppError(
      "This conversation is currently unavailable.",
      403,
      "CONVERSATION_PARTICIPANT_INACTIVE"
    );
  }

  return conversation;
};

export default verifyConversationAccess;