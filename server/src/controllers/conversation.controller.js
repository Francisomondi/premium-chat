import {
  createOrGetConversation,
  getConversationById,
  listMyConversations,
} from "../services/conversation.service.js";

import {
  sendTextMessage,
  getConversationMessages,
} from "../services/message.service.js";

import {
  broadcastNewMessage,
} from "../socket/messageBroadcast.js";

export const createConversation = async (
  req,
  res,
  next
) => {
  try {
    const userId = req.auth.userId;

    const { creatorId } =
      req.validated.body;

    const conversation =
      await createOrGetConversation({
        userId,
        creatorId,
      });

    return res.status(200).json({
      success: true,

      message: "Conversation is ready.",

      data: {
        conversation,
      },

      requestId: req.requestId,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * ============================================================
 * LIST MY CONVERSATIONS
 * GET /api/conversations
 * ============================================================
 */

export const getMyConversations = async (
  req,
  res,
  next
) => {
  try {
    const userId = req.auth.userId;

    const {
      page,
      limit,
    } = req.validated.query;

    const result =
      await listMyConversations({
        userId,
        page,
        limit,
      });

    return res.status(200).json({
      success: true,

      message: "Conversations retrieved successfully.",

      data: result,

      requestId: req.requestId,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * ============================================================
 * GET ONE CONVERSATION
 * GET /api/conversations/:conversationId
 * ============================================================
 */

export const getConversation = async (
  req,
  res,
  next
) => {
  try {
    const userId = req.auth.userId;

    const {
      conversationId,
    } = req.validated.params;

    const conversation =
      await getConversationById({
        conversationId,
        userId,
      });

    return res.status(200).json({
      success: true,

      message: "Conversation retrieved successfully.",

      data: {
        conversation,
      },

      requestId: req.requestId,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * ============================================================
 * GET MESSAGE HISTORY
 * GET /api/conversations/:conversationId/messages
 * ============================================================
 */

export const getMessages = async (
  req,
  res,
  next
) => {
  try {
    const userId = req.auth.userId;

    const {
      conversationId,
    } = req.validated.params;

    const {
      before,
      limit,
    } = req.validated.query;

    const result =
      await getConversationMessages({
        conversationId,
        userId,
        before: before ?? null,
        limit,
      });

    return res.status(200).json({
      success: true,

      message: "Messages retrieved successfully.",

      data: result,

      requestId: req.requestId,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * ============================================================
 * SEND TEXT MESSAGE
 * POST /api/conversations/:conversationId/messages
 * ============================================================
 *
 * Saves the message through the shared message service.
 *
 * Newly created messages are broadcast through Socket.IO.
 *
 * Duplicate retries return the existing message without
 * broadcasting again.
 */

export const createMessage = async (
  req,
  res,
  next
) => {
  try {
    const senderId = req.auth.userId;

    const {
      conversationId,
    } = req.validated.params;

    const {
      clientMessageId,
      content,
    } = req.validated.body;

    /**
     * STEP 1:
     * Save the message.
     */

    const result = await sendTextMessage({
      conversationId,
      senderId,
      clientMessageId,
      content,
    });

    const {
      message,
      created,
    } = result;

    /**
     * STEP 2:
     * Broadcast newly created messages.
     *
     * Socket.IO delivery is best-effort.
     *
     * If broadcasting fails after the database
     * save, we must not incorrectly report that
     * the message itself failed.
     */

    if (created) {
      try {
        await broadcastNewMessage({
          message,
          created,
        });
      } catch (broadcastError) {
        console.error(
          "REST message broadcast failed:",
          broadcastError.message
        );
      }
    }

    /**
     * STEP 3:
     * Return the saved message.
     */

    return res.status(
      created ? 201 : 200
    ).json({
      success: true,

      message: created
        ? "Message sent successfully."
        : "Existing message retrieved.",

      data: {
        message,
        created,
      },

      requestId: req.requestId,
    });
  } catch (error) {
    return next(error);
  }
};