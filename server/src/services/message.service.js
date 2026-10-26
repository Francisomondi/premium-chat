import mongoose from "mongoose";

import Message from "../models/Message.model.js";

import Conversation from "../models/Conversation.model.js";

import User from "../models/User.model.js";

import AppError from "../utils/AppError.js";

import {
  ACCOUNT_STATUSES,
} from "../constants/account.constants.js";

import {
  verifyConversationMembership,
} from "./conversation.service.js";

import {
  verifyConversationAccess,
} from "./conversationAccess.service.js";

/**
 * ============================================================
 * PREMIUMCHAT MESSAGE SERVICE
 * ============================================================
 *
 * Responsibilities:
 *
 * - Create text messages
 * - Validate conversation membership
 * - Prevent duplicate messages
 * - Retrieve paginated message history
 * - Update conversation activity
 *
 * Security:
 *
 * - Sender identity comes from authentication.
 * - Only conversation participants may send.
 * - Blocked/archived conversations reject messages.
 * - Media messages are disabled for now.
 */

const MAX_MESSAGE_LENGTH = 5000;

const DEFAULT_LIMIT = 30;

const MAX_LIMIT = 100;

const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;

/**
 * ============================================================
 * VALIDATE OBJECT ID
 * ============================================================
 */

const validateObjectId = (
  value,
  fieldName = "ID"
) => {
  if (
    typeof value !== "string" ||
    !OBJECT_ID_REGEX.test(value)
  ) {
    throw new AppError(
      `Invalid ${fieldName}.`,
      400,
      "INVALID_OBJECT_ID"
    );
  }

  return value;
};

/**
 * ============================================================
 * VALIDATE CLIENT MESSAGE ID
 * ============================================================
 */

const validateClientMessageId = (
  clientMessageId
) => {
  if (
    typeof clientMessageId !== "string" ||
    clientMessageId.trim().length < 8 ||
    clientMessageId.trim().length > 100
  ) {
    throw new AppError(
      "A valid client message ID is required.",
      400,
      "INVALID_CLIENT_MESSAGE_ID"
    );
  }

  return clientMessageId.trim();
};

/**
 * ============================================================
 * VALIDATE TEXT CONTENT
 * ============================================================
 */

const validateTextContent = (content) => {
  if (typeof content !== "string") {
    throw new AppError(
      "Message content must be text.",
      400,
      "INVALID_MESSAGE_CONTENT"
    );
  }

  const normalized = content.trim();

  if (
    normalized.length === 0 ||
    normalized.length > MAX_MESSAGE_LENGTH
  ) {
    throw new AppError(
      `Message content must contain between 1 and ${MAX_MESSAGE_LENGTH} characters.`,
      400,
      "INVALID_MESSAGE_CONTENT"
    );
  }

  return normalized;
};

/**
 * ============================================================
 * VERIFY ACTIVE SENDER
 * ============================================================
 */

const verifyActiveSender = async (senderId) => {
  const sender = await User.findById(senderId)
    .select("_id role accountStatus")
    .lean();

  if (
    !sender ||
    sender.accountStatus !== ACCOUNT_STATUSES.ACTIVE
  ) {
    throw new AppError(
      "Your account cannot send messages.",
      403,
      "SENDER_UNAVAILABLE"
    );
  }

  return sender;
};

/**
 * ============================================================
 * VERIFY ACTIVE PARTICIPANTS
 * ============================================================
 *
 * A suspended, banned, or deleted participant
 * cannot continue exchanging messages.
 */

const verifyActiveParticipants = async (
  conversation
) => {
  const activeCount = await User.countDocuments({
    _id: {
      $in: conversation.participants,
    },
    accountStatus: ACCOUNT_STATUSES.ACTIVE,
  });

  if (activeCount !== 2) {
    throw new AppError(
      "This conversation is currently unavailable.",
      403,
      "CONVERSATION_PARTICIPANT_UNAVAILABLE"
    );
  }
};

/**
 * ============================================================
 * UPDATE CONVERSATION ACTIVITY
 * ============================================================
 */

const updateConversationActivity = async ({
  conversationId,
  message,
}) => {
  await Conversation.updateOne(
    {
      _id: conversationId,
      status: "ACTIVE",
      $or: [
        { lastMessageAt: null },
        { lastMessageAt: { $lte: message.createdAt } },
      ],
    },
    {
      $set: {
        lastMessageId: message._id,
        lastMessageAt: message.createdAt,
      },
    }
  );
};

/**
 * ============================================================
 * SEND TEXT MESSAGE
 * ============================================================
 */

export const sendTextMessage = async ({
  conversationId,
  senderId,
  clientMessageId,
  content,
}) => {
  validateObjectId(
    conversationId,
    "conversation ID"
  );

  validateObjectId(senderId, "sender ID");

  const validClientMessageId =
    validateClientMessageId(clientMessageId);

  const normalizedContent =
    validateTextContent(content);

  /**
   * STEP 1:
   * Verify sender account.
   */

  await verifyActiveSender(senderId);

  /**
   * STEP 2:
   * Verify conversation membership and status.
   */

  const conversation =
   await verifyConversationAccess({
      conversationId,
      userId: senderId,
      requireActive: true,
   });

  /**
   * STEP 3:
   * Verify both participants remain active.
   */

  await verifyActiveParticipants(
    conversation
  );

  /**
   * STEP 4:
   * Check whether the message already exists.
   */

  const existingMessage = await Message.findOne({
    conversationId,
    senderId,
    clientMessageId: validClientMessageId,
  });

  if (existingMessage) {
    if (
      existingMessage.content !== normalizedContent ||
      existingMessage.type !== "TEXT"
    ) {
      throw new AppError(
        "This client message ID was already used for different content.",
        409,
        "CLIENT_MESSAGE_ID_CONFLICT"
      );
    }

    return {
      message: existingMessage,
      created: false,
    };
  }

  /**
   * STEP 5:
   * Save the new message.
   */

  let message;

  let created = false;

  try {
    message = await Message.create({
      conversationId,
      senderId,

      clientMessageId:
        validClientMessageId,

      type: "TEXT",

      content: normalizedContent,

      isLocked: false,

      mediaId: null,

      status: "SENT",
    });

    created = true;
  } catch (error) {
    /**
     * Concurrent retries can race.
     *
     * The unique MongoDB index prevents
     * duplicate messages.
     */
    if (error?.code !== 11000) {
      throw error;
    }

    message = await Message.findOne({
      conversationId,
      senderId,
      clientMessageId: validClientMessageId,
    });

    if (!message) {
      throw new AppError(
        "Unable to retrieve the message.",
        409,
        "MESSAGE_CONFLICT"
      );
    }

    if (
      message.content !== normalizedContent ||
      message.type !== "TEXT"
    ) {
      throw new AppError(
        "This client message ID was already used for different content.",
        409,
        "CLIENT_MESSAGE_ID_CONFLICT"
      );
    }
  }

  /**
   * STEP 6:
   * Update conversation activity.
   *
   * This operation is idempotent for retries.
   */

  await updateConversationActivity({
    conversationId,
    message,
  });

  /**
   * STEP 7:
   * Return the message.
   */

  return {
    message,
    created,
  };
};

/**
 * ============================================================
 * GET MESSAGE HISTORY
 * ============================================================
 *
 * Cursor-based pagination.
 *
 * Messages are retrieved newest-first,
 * then returned oldest-first for chat rendering.
 */

export const getConversationMessages = async ({
  conversationId,
  userId,
  before = null,
  limit = DEFAULT_LIMIT,
}) => {
  validateObjectId(
    conversationId,
    "conversation ID"
  );

  validateObjectId(userId, "user ID");

  const parsedLimit = Number(limit);

  if (
    !Number.isInteger(parsedLimit) ||
    parsedLimit < 1 ||
    parsedLimit > MAX_LIMIT
  ) {
    throw new AppError(
      `Limit must be between 1 and ${MAX_LIMIT}.`,
      400,
      "INVALID_MESSAGE_LIMIT"
    );
  }

  /**
   * STEP 1:
   * Verify the requesting account.
   */

  await verifyActiveSender(userId);

  /**
   * STEP 2:
   * Verify conversation membership.
   */

  await verifyConversationAccess({
    conversationId,
    userId,
    requireActive: false,
  });

  /**
   * STEP 3:
   * Build the query.
   */

  const query = {
    conversationId,
    deletedAt: null,
  };

  /**
   * STEP 4:
   * Apply the pagination cursor.
   */

  if (before !== null && before !== undefined) {
    validateObjectId(
      before,
      "message cursor"
    );

    const cursorMessage =
      await Message.findOne({
        _id: before,
        conversationId,
      })
        .select("_id createdAt")
        .lean();

    if (!cursorMessage) {
      throw new AppError(
        "Invalid message cursor.",
        400,
        "INVALID_MESSAGE_CURSOR"
      );
    }

    query.$or = [
      {
        createdAt: {
          $lt: cursorMessage.createdAt,
        },
      },
      {
        createdAt: cursorMessage.createdAt,
        _id: {
          $lt: cursorMessage._id,
        },
      },
    ];
  }

  /**
   * STEP 5:
   * Retrieve one extra message to determine
   * whether more history exists.
   */

  const results = await Message.find(query)
    .sort({
      createdAt: -1,
      _id: -1,
    })
    .limit(parsedLimit + 1)
    .lean();

  const hasMore =
    results.length > parsedLimit;

  const pageResults = results.slice(
    0,
    parsedLimit
  );

  /**
   * STEP 6:
   * Generate the next cursor.
   */

  const nextCursor =
    hasMore && pageResults.length > 0
      ? pageResults[pageResults.length - 1]
          ._id.toString()
      : null;

  /**
   * STEP 7:
   * Return messages in chronological order.
   */

  return {
    messages: pageResults.reverse(),

    pagination: {
      limit: parsedLimit,
      hasMore,
      nextCursor,
    },
  };
};

/**
 * ============================================================
 * MESSAGE SERVICE EXPORT
 * ============================================================
 */

const messageService = {
  sendTextMessage,
  getConversationMessages,
};

export default messageService;