import { z } from "zod";

/**
 * ============================================================
 * PREMIUMCHAT CONVERSATION VALIDATORS
 * ============================================================
 *
 * Zod validates incoming request data.
 *
 * Authenticated user identity must always come
 * from req.auth.userId.
 */

const objectIdSchema = z
  .string()
  .regex(
    /^[0-9a-fA-F]{24}$/,
    "A valid MongoDB ObjectId is required."
  );

/**
 * ============================================================
 * CREATE CONVERSATION
 * POST /api/conversations
 * ============================================================
 */

export const createConversationSchema = z
  .object({
    creatorId: objectIdSchema,
  })
  .strict();

/**
 * ============================================================
 * CONVERSATION PARAMS
 * ============================================================
 */

export const conversationParamsSchema = z
  .object({
    conversationId: objectIdSchema,
  })
  .strict();

/**
 * ============================================================
 * LIST CONVERSATIONS QUERY
 * GET /api/conversations
 * ============================================================
 */

export const listConversationsQuerySchema = z
  .object({
    page: z.coerce
      .number()
      .int()
      .min(1)
      .default(1),

    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .default(20),
  })
  .strict();

/**
 * ============================================================
 * MESSAGE HISTORY QUERY
 * GET /api/conversations/:conversationId/messages
 * ============================================================
 */

export const messageHistoryQuerySchema = z
  .object({
    before: objectIdSchema.optional(),

    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .default(30),
  })
  .strict();

/**
 * ============================================================
 * SEND TEXT MESSAGE
 * POST /api/conversations/:conversationId/messages
 * ============================================================
 */

export const sendMessageSchema = z
  .object({
    clientMessageId: z
      .string()
      .trim()
      .min(8)
      .max(100),

    content: z
      .string()
      .trim()
      .min(1)
      .max(5000),
  })
  .strict();