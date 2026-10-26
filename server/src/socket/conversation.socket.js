import {
  verifyConversationAccess,
} from "../services/conversationAccess.service.js";

import {
  requireValidSocketSession,
} from "./socketSessionGuard.js";

import {
  checkSocketRateLimit,
} from "./socketRateLimiter.js";
/**
 * ============================================================
 * PREMIUMCHAT CONVERSATION SOCKET HANDLERS
 * ============================================================
 *
 * Events:
 *
 * Client -> Server
 *   conversation:join
 *   conversation:leave
 *
 * Server -> Client
 *   conversation:joined
 *   conversation:left
 *
 * All private room access requires:
 *
 * 1. Valid authentication session.
 * 2. Conversation membership.
 * 3. An accessible conversation.
 */

const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;

/**
 * Generate a private conversation room name.
 */
/**
 * Generate a consistent private conversation room name.
 */
export const getConversationRoom = (conversationId) => {
  if (
    typeof conversationId !== "string" ||
    !/^[0-9a-fA-F]{24}$/.test(conversationId)
  ) {
    throw new TypeError("Invalid conversation ID.");
  }

  return `conversation:${conversationId.toLowerCase()}`;
};

/**
 * Normalize acknowledgment errors.
 *
 * Avoid exposing internal database errors.
 */
const getSocketError = (error) => {
  return {
    success: false,
    message:
      error?.statusCode &&
      error.statusCode < 500
        ? error.message
        : "Unable to process the conversation request.",
    code:
      error?.statusCode &&
      error.statusCode < 500
        ? error.code
        : "SOCKET_OPERATION_FAILED",
  };
};

/**
 * Register conversation events.
 */
export const registerConversationSocketHandlers = (
  socket
) => {
  /**
   * ==========================================================
   * JOIN CONVERSATION
   * ==========================================================
   */
  socket.on(
    "conversation:join",
    async (payload, acknowledgment) => {
      const reply =
        typeof acknowledgment === "function"
          ? acknowledgment
          : () => {};

      try {
        /**
         * Validate socket session.
         */
        const sessionValid =
          await requireValidSocketSession(socket);

        if (!sessionValid) {
          return reply({
            success: false,
            message:
              "Your authentication session is no longer valid.",
            code: "SOCKET_SESSION_INVALID",
          });
        }

        /**
         * Validate payload.
         */
        const conversationId =
          payload?.conversationId;

        if (
          typeof conversationId !== "string" ||
          !OBJECT_ID_REGEX.test(conversationId)
        ) {
          return reply({
            success: false,
            message: "Invalid conversation ID.",
            code: "INVALID_CONVERSATION_ID",
          });
        }

        /**
         * ==========================================================
         * CONVERSATION JOIN RATE LIMITING
         * ==========================================================
         */

        const rateLimit =
          checkSocketRateLimit({
            userId: socket.data.userId,
            policyName: "CONVERSATION_JOIN",
          });

        if (!rateLimit.allowed) {
          return reply({
            success: false,

            message:
              "Too many conversation requests. Please try again shortly.",

            code: "CONVERSATION_JOIN_RATE_LIMITED",

            retryAfterMs:
              rateLimit.retryAfterMs,
          });
        }

        /**
         * Verify conversation membership.
         *
         * Never trust the client to determine
         * which rooms it may access.
         */
        /**
         * Verify conversation access.
         *
         * Both participants must be active.
         * The conversation must be ACTIVE.
         */

        await verifyConversationAccess({
          conversationId,
          userId: socket.data.userId,
          requireActive: true,
        });

        /**
         * Join the authorized room.
         */
        const room = getConversationRoom(
          conversationId
        );

        await socket.join(room);

        /**
         * Confirm successful room subscription.
         */
        socket.emit("conversation:joined", {
          conversationId,
        });

        return reply({
          success: true,
          message: "Conversation joined.",
          data: {
            conversationId,
          },
        });
      } catch (error) {
        return reply(getSocketError(error));
      }
    }
  );

  /**
   * ==========================================================
   * LEAVE CONVERSATION
   * ==========================================================
   */
  socket.on(
    "conversation:leave",
    async (payload, acknowledgment) => {
      const reply =
        typeof acknowledgment === "function"
          ? acknowledgment
          : () => {};

      try {
        const sessionValid =
          await requireValidSocketSession(socket);

        if (!sessionValid) {
          return reply({
            success: false,
            message:
              "Your authentication session is no longer valid.",
            code: "SOCKET_SESSION_INVALID",
          });
        }

        const conversationId =
          payload?.conversationId;

        if (
          typeof conversationId !== "string" ||
          !OBJECT_ID_REGEX.test(conversationId)
        ) {
          return reply({
            success: false,
            message: "Invalid conversation ID.",
            code: "INVALID_CONVERSATION_ID",
          });
        }

        /**
         * Leaving a room does not require
         * another database membership query.
         *
         * A socket can only remove itself
         * from its own room subscription.
         */
        const room = getConversationRoom(
          conversationId
        );

        await socket.leave(room);

        socket.emit("conversation:left", {
          conversationId,
        });

        return reply({
          success: true,
          message: "Conversation left.",
          data: {
            conversationId,
          },
        });
      } catch (error) {
        return reply(getSocketError(error));
      }
    }
  );
};

export default registerConversationSocketHandlers;