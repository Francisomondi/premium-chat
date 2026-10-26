import {
  sendTextMessage,
} from "../services/message.service.js";

import {
  requireValidSocketSession,
} from "./socketSessionGuard.js";

import {
  broadcastNewMessage,
  formatMessageForSocket,
} from "./messageBroadcast.js";

import {
  checkMultipleSocketRateLimits,
} from "./socketRateLimiter.js";


const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;

const MAX_MESSAGE_LENGTH = 5000;

const MAX_CLIENT_MESSAGE_ID_LENGTH = 100;

/**
 * ============================================================
 * SOCKET ERROR RESPONSE
 * ============================================================
 */

const createSocketError = (error) => {
  const isExpectedError =
    Number.isInteger(error?.statusCode) &&
    error.statusCode >= 400 &&
    error.statusCode < 500;

  return {
    success: false,

    message: isExpectedError
      ? error.message
      : "Unable to send your message.",

    code: isExpectedError
      ? error.code
      : "MESSAGE_SEND_FAILED",
  };
};

/**
 * ============================================================
 * VALIDATE MESSAGE PAYLOAD
 * ============================================================
 */

const validateMessagePayload = (payload) => {
  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload)
  ) {
    return {
      valid: false,
      message: "Invalid message payload.",
    };
  }

  const {
    conversationId,
    clientMessageId,
    content,
  } = payload;

  if (
    typeof conversationId !== "string" ||
    !OBJECT_ID_REGEX.test(conversationId)
  ) {
    return {
      valid: false,
      message: "Invalid conversation ID.",
    };
  }

  if (
    typeof clientMessageId !== "string" ||
    clientMessageId.trim().length < 8 ||
    clientMessageId.trim().length >
      MAX_CLIENT_MESSAGE_ID_LENGTH
  ) {
    return {
      valid: false,
      message: "Invalid client message ID.",
    };
  }

  if (
    typeof content !== "string" ||
    content.trim().length === 0 ||
    content.trim().length > MAX_MESSAGE_LENGTH
  ) {
    return {
      valid: false,
      message:
        "Message content must contain between 1 and 5000 characters.",
    };
  }

  /**
   * Only allow expected fields.
   *
   * Reject attempts to supply sender IDs,
   * message statuses, payment flags, etc.
   */

  const allowedFields = new Set([
    "conversationId",
    "clientMessageId",
    "content",
  ]);

  const unexpectedFields = Object.keys(
    payload
  ).filter((field) => !allowedFields.has(field));

  if (unexpectedFields.length > 0) {
    return {
      valid: false,
      message:
        "Message payload contains unsupported fields.",
    };
  }

  return {
    valid: true,

    data: {
      conversationId,
      clientMessageId:
        clientMessageId.trim(),
      content: content.trim(),
    },
  };
};

/**
 * ============================================================
 * REGISTER MESSAGE SOCKET HANDLERS
 * ============================================================
 */

export const registerMessageSocketHandlers = (
  socket
) => {
  /**
   * ==========================================================
   * SEND MESSAGE
   * ==========================================================
   */

  socket.on(
    "message:send",
    async (payload, acknowledgment) => {
      const reply =
        typeof acknowledgment === "function"
          ? acknowledgment
          : () => {};

      try {
        /**
         * STEP 1:
         * Validate the authenticated session.
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
         * STEP 2:
         * Validate message data.
         */

        const validation =
          validateMessagePayload(payload);

        if (!validation.valid) {
          return reply({
            success: false,
            message: validation.message,
            code: "INVALID_MESSAGE_PAYLOAD",
          });
        }

        const {
          conversationId,
          clientMessageId,
          content,
        } = validation.data;

        /**
         * ==========================================================
         * MESSAGE RATE LIMITING
         * ==========================================================
         *
         * Apply both:
         *
         * - Sustained message limit
         * - Short burst limit
         *
         * Limits are shared by all sockets belonging
         * to the same authenticated user.
         */

        const rateLimit =
        checkMultipleSocketRateLimits({
            userId: socket.data.userId,

            policyNames: [
            "MESSAGE",
            "MESSAGE_BURST",
            ],
        });

        if (!rateLimit.allowed) {
        return reply({
            success: false,

            message:
            "You are sending messages too quickly. Please wait before trying again.",

            code: "MESSAGE_RATE_LIMITED",

            retryAfterMs:
            rateLimit.retryAfterMs,
        });
        }

        /**
         * STEP 3:
         * Sender identity comes from the
         * authenticated socket.
         */

        const senderId = socket.data.userId;

        /**
         * STEP 4:
         * Persist the message through the
         * existing message service.
         *
         * The service checks:
         *
         * - Active sender
         * - Conversation membership
         * - Conversation status
         * - Active participants
         * - Duplicate client message IDs
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
         * STEP 5:
         * Prepare the public message payload.
         *
         * Never include private account data.
         */

        const messagePayload =
        formatMessageForSocket(message);

        /**
         * Broadcast to other sockets joined to
         * this conversation.
         *
         * The originating socket receives message:sent.
         */

            if (created) {
            try {
                await broadcastNewMessage({
                message,
                created,
                excludeSocketId: socket.id,
                });
            } catch (broadcastError) {
                console.error(
                "Socket message broadcast failed:",
                broadcastError.message
                );
            }
            }

        /**
         * STEP 7:
         * Confirm successful message processing
         * to the sending socket.
         */

        socket.emit("message:sent", {
          conversationId,
          clientMessageId,
          message: messagePayload,
          created,
        });

        return reply({
          success: true,

          message: created
            ? "Message sent successfully."
            : "Existing message retrieved.",

          data: {
            message: messagePayload,
            created,
          },
        });
      } catch (error) {
        console.error(
          "Socket message send failed:",
          error.message
        );

        return reply(
          createSocketError(error)
        );
      }
    }
  );
};

export default registerMessageSocketHandlers;