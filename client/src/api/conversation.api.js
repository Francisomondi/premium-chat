import axiosInstance from "./axiosInstance.js";

/**
 * ============================================================
 * PREMIUMCHAT — CONVERSATION API SERVICE
 * ============================================================
 *
 * Handles REST communication for:
 *
 * - Creating conversations
 * - Listing conversations
 * - Fetching conversation details
 * - Loading message history
 * - Sending text messages
 *
 * Authentication:
 *
 * Uses the existing Axios instance with
 * HTTP-only authentication cookies.
 *
 * IMPORTANT:
 *
 * The Axios base URL already includes /api.
 *
 * Therefore, requests use:
 *
 * /conversations
 *
 * NOT:
 *
 * /api/conversations
 */

/**
 * ============================================================
 * CONSTANTS
 * ============================================================
 */

const CONVERSATION_ENDPOINT = "/conversations";

const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;

const DEFAULT_PAGE = 1;

const DEFAULT_CONVERSATION_LIMIT = 20;

const DEFAULT_MESSAGE_LIMIT = 30;

const MAX_PAGE_SIZE = 100;

/**
 * ============================================================
 * VALIDATION HELPERS
 * ============================================================
 */

/**
 * Validate a MongoDB ObjectId.
 */
const validateObjectId = (value, fieldName) => {
  if (
    typeof value !== "string" ||
    !OBJECT_ID_REGEX.test(value)
  ) {
    throw new Error(
      `${fieldName} must be a valid MongoDB ObjectId.`
    );
  }

  return value.toLowerCase();
};

/**
 * Validate a positive integer.
 */
const validatePositiveInteger = (
  value,
  fieldName,
  maximum = MAX_PAGE_SIZE
) => {
  if (
    !Number.isInteger(value) ||
    value < 1 ||
    value > maximum
  ) {
    throw new Error(
      `${fieldName} must be an integer between 1 and ${maximum}.`
    );
  }

  return value;
};

/**
 * Validate a message client ID.
 *
 * The backend requires:
 *
 * 8–100 characters.
 */
const validateClientMessageId = (value) => {
  if (
    typeof value !== "string" ||
    value.length < 8 ||
    value.length > 100
  ) {
    throw new Error(
      "clientMessageId must contain between 8 and 100 characters."
    );
  }

  return value;
};

/**
 * Validate message content.
 *
 * The backend accepts:
 *
 * 1–5000 characters.
 */
const validateMessageContent = (content) => {
  if (
    typeof content !== "string" ||
    content.trim().length === 0 ||
    content.length > 5000
  ) {
    throw new Error(
      "Message content must contain between 1 and 5000 characters."
    );
  }

  return content;
};

/**
 * ============================================================
 * API ERROR HELPER
 * ============================================================
 *
 * Extract a readable message from Axios errors.
 */

export const getApiErrorMessage = (
  error,
  fallbackMessage = "Something went wrong. Please try again."
) => {
  const serverMessage =
    error?.response?.data?.message;

  if (
    typeof serverMessage === "string" &&
    serverMessage.trim()
  ) {
    return serverMessage;
  }

  if (
    typeof error?.message === "string" &&
    error.message.trim()
  ) {
    return error.message;
  }

  return fallbackMessage;
};

/**
 * ============================================================
 * GET RATE-LIMIT RETRY DELAY
 * ============================================================
 *
 * Returns the number of milliseconds the
 * client should wait after HTTP 429.
 *
 * Returns null for non-rate-limit errors.
 */

export const getRateLimitRetryAfterMs = (error) => {
  if (error?.response?.status !== 429) {
    return null;
  }

  const retryAfterMs =
    error?.response?.data?.retryAfterMs;

  if (
    typeof retryAfterMs === "number" &&
    Number.isFinite(retryAfterMs) &&
    retryAfterMs >= 0
  ) {
    return retryAfterMs;
  }

  /**
   * Fallback to the standard Retry-After
   * response header.
   *
   * The current backend sends seconds.
   */

  const retryAfterHeader =
    error?.response?.headers?.["retry-after"];

  if (retryAfterHeader !== undefined) {
    const seconds = Number(retryAfterHeader);

    if (
      Number.isFinite(seconds) &&
      seconds >= 0
    ) {
      return Math.ceil(seconds * 1000);
    }
  }

  return null;
};

/**
 * ============================================================
 * CREATE OR GET CONVERSATION
 * ============================================================
 *
 * POST /api/conversations
 *
 * Creates a conversation between the
 * authenticated user and a creator.
 *
 * If the conversation already exists,
 * the backend returns the existing one.
 */

export const createOrGetConversation = async ({
  creatorId,
}) => {
  const validCreatorId = validateObjectId(
    creatorId,
    "creatorId"
  );

  const response = await axiosInstance.post(
    CONVERSATION_ENDPOINT,
    {
      creatorId: validCreatorId,
    }
  );

  return response.data;
};

/**
 * ============================================================
 * GET MY CONVERSATIONS
 * ============================================================
 *
 * GET /api/conversations
 *
 * Supports pagination.
 */

export const getMyConversations = async ({
  page = DEFAULT_PAGE,
  limit = DEFAULT_CONVERSATION_LIMIT,
} = {}) => {
  const validPage = validatePositiveInteger(
    page,
    "page",
    Number.MAX_SAFE_INTEGER
  );

  const validLimit = validatePositiveInteger(
    limit,
    "limit"
  );

  const response = await axiosInstance.get(
    CONVERSATION_ENDPOINT,
    {
      params: {
        page: validPage,
        limit: validLimit,
      },
    }
  );

  return response.data;
};

/**
 * ============================================================
 * GET CONVERSATION BY ID
 * ============================================================
 *
 * GET /api/conversations/:conversationId
 */

export const getConversationById = async (
  conversationId
) => {
  const validConversationId =
    validateObjectId(
      conversationId,
      "conversationId"
    );

  const response = await axiosInstance.get(
    `${CONVERSATION_ENDPOINT}/${validConversationId}`
  );

  return response.data;
};

/**
 * ============================================================
 * GET CONVERSATION MESSAGES
 * ============================================================
 *
 * GET /api/conversations/:conversationId/messages
 *
 * Supports:
 *
 * - Message history pagination
 * - Cursor-based loading
 * - Fetching older messages
 *
 * The backend uses the "before" cursor.
 */

export const getConversationMessages = async ({
  conversationId,
  before = null,
  limit = DEFAULT_MESSAGE_LIMIT,
}) => {
  const validConversationId =
    validateObjectId(
      conversationId,
      "conversationId"
    );

  const validLimit = validatePositiveInteger(
    limit,
    "limit"
  );

  const params = {
    limit: validLimit,
  };

  /**
   * Only include the cursor when provided.
   *
   * The backend's exact cursor format
   * should be preserved.
   */

  if (
    before !== null &&
    before !== undefined &&
    before !== ""
  ) {
    if (typeof before !== "string") {
      throw new Error(
        "The message pagination cursor must be a string."
      );
    }

    params.before = before;
  }

  const response = await axiosInstance.get(
    `${CONVERSATION_ENDPOINT}/${validConversationId}/messages`,
    {
      params,
    }
  );

  return response.data;
};

/**
 * ============================================================
 * GENERATE CLIENT MESSAGE ID
 * ============================================================
 *
 * Every new logical message should receive
 * a unique clientMessageId.
 *
 * Reuse the same ID when retrying that message.
 */

export const generateClientMessageId = () => {
  if (
    typeof crypto === "undefined" ||
    typeof crypto.randomUUID !== "function"
  ) {
    throw new Error(
      "Secure message ID generation is unavailable in this browser."
    );
  }

  return crypto.randomUUID();
};

/**
 * ============================================================
 * SEND TEXT MESSAGE
 * ============================================================
 *
 * POST /api/conversations/:conversationId/messages
 *
 * Sends a text message using REST.
 *
 * IMPORTANT:
 *
 * The backend implements idempotency using
 * clientMessageId.
 *
 * Do not generate a new ID when retrying
 * the same logical message.
 */

export const sendTextMessage = async ({
  conversationId,
  content,
  clientMessageId,
}) => {
  const validConversationId =
    validateObjectId(
      conversationId,
      "conversationId"
    );

  const validContent =
    validateMessageContent(content);

  const validClientMessageId =
    validateClientMessageId(
      clientMessageId
    );

  const response = await axiosInstance.post(
    `${CONVERSATION_ENDPOINT}/${validConversationId}/messages`,
    {
      clientMessageId: validClientMessageId,

      content: validContent,
    }
  );

  return response.data;
};

/**
 * ============================================================
 * CONVERSATION API OBJECT
 * ============================================================
 *
 * Optional grouped access for other modules.
 */

export const conversationApi = {
  createOrGetConversation,

  getMyConversations,

  getConversationById,

  getConversationMessages,

  sendTextMessage,

  generateClientMessageId,

  getApiErrorMessage,

  getRateLimitRetryAfterMs,
};

export default conversationApi;