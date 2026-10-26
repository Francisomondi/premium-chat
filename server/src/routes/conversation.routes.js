import { Router } from "express";

import {
  requireAuth,
} from "../middleware/auth.middleware.js";

import {
  requireTrustedOrigin,
} from "../middleware/csrf.middleware.js";

import {
  validate,
} from "../middleware/validate.middleware.js";

import {
  createConversation,
  getMyConversations,
  getConversation,
  getMessages,
  createMessage,
} from "../controllers/conversation.controller.js";

import {
  createConversationSchema,
  conversationParamsSchema,
  listConversationsQuerySchema,
  messageHistoryQuerySchema,
  sendMessageSchema,
} from "../validators/conversation.validators.js";

import {
  messageRateLimit,
} from "../middleware/messageRateLimit.middleware.js";

/**
 * ============================================================
 * PREMIUMCHAT CONVERSATION ROUTES
 * ============================================================
 */

const router = Router();

/**
 * All conversation endpoints require authentication.
 */
router.use(requireAuth);

/**
 * ============================================================
 * CREATE OR GET CONVERSATION
 * ============================================================
 */

router.post(
  "/",
  requireTrustedOrigin,
  validate({
    body: createConversationSchema,
  }),
  createConversation
);

/**
 * ============================================================
 * LIST MY CONVERSATIONS
 * ============================================================
 */

router.get(
  "/",
  validate({
    query: listConversationsQuerySchema,
  }),
  getMyConversations
);

/**
 * ============================================================
 * GET ONE CONVERSATION
 * ============================================================
 */

router.get(
  "/:conversationId",
  validate({
    params: conversationParamsSchema,
  }),
  getConversation
);

/**
 * ============================================================
 * GET MESSAGE HISTORY
 * ============================================================
 */

router.get(
  "/:conversationId/messages",
  validate({
    params: conversationParamsSchema,
    query: messageHistoryQuerySchema,
  }),
  getMessages
);

/**
 * ============================================================
 * SEND MESSAGE
 * POST /api/conversations/:conversationId/messages
 * ============================================================
 *
 * Middleware order:
 *
 * 1. Authentication (router.use(requireAuth))
 * 2. CSRF / trusted-origin protection
 * 3. Request validation
 * 4. Message rate limiting
 * 5. Message creation
 */

router.post(
  "/:conversationId/messages",

  requireTrustedOrigin,

  validate({
    params: conversationParamsSchema,
    body: sendMessageSchema,
  }),

  messageRateLimit,

  createMessage
);

export default router;