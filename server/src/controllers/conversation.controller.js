import {
  createOrGetConversation,
  getConversationById,
  listMyConversations,
} from "../services/conversation.service.js";

import {
  sendTextMessage,
  getConversationMessages,
} from "../services/message.service.js";

/**
 * ============================================================
 * PREMIUMCHAT CONVERSATION CONTROLLER
 * ============================================================
 *
 * Responsibilities:
 *
 * - Extract validated request data.
 * - Read authenticated identity.
 * - Call service functions.
 * - Return standardized JSON responses.
 *
 * Database and authorization logic remain
 * inside the service layer.
 */

/**
 * ============================================================
 * CREATE OR GET CONVERSATION
 * POST /api/conversations
 * ============================================================
 */

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

    const result =
      await sendTextMessage({
        conversationId,
        senderId,
        clientMessageId,
        content,
      });

    return res.status(
      result.created ? 201 : 200
    ).json({
      success: true,

      message: result.created
        ? "Message sent successfully."
        : "Existing message retrieved.",

      data: {
        message: result.message,
        created: result.created,
      },

      requestId: req.requestId,
    });
  } catch (error) {
    return next(error);
  }
};