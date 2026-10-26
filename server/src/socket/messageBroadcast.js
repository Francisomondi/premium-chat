import {
  getSocketServer,
} from "./socket.server.js";

import {
  getConversationRoom,
} from "./conversation.socket.js";

import {
  verifySocketConversationAccess,
} from "./conversationAccessGuard.js";

/**
 * ============================================================
 * PREMIUMCHAT — SECURE MESSAGE BROADCAST
 * ============================================================
 *
 * Every socket is revalidated before receiving
 * sensitive conversation messages.
 *
 * Unauthorized sockets are removed from rooms.
 */

/**
 * Format a saved message for delivery.
 */
export const formatMessageForSocket = (
  message
) => {
  if (!message) {
    throw new TypeError(
      "A saved message is required."
    );
  }

  return {
    _id: message._id.toString(),

    conversationId:
      message.conversationId.toString(),

    senderId:
      message.senderId.toString(),

    clientMessageId:
      message.clientMessageId,

    type: message.type,

    content: message.content,

    status: message.status,

    createdAt: message.createdAt,

    updatedAt: message.updatedAt,
  };
};

/**
 * ============================================================
 * SECURE MESSAGE BROADCAST
 * ============================================================
 */

export const broadcastNewMessage = async ({
  message,
  created,
  excludeSocketId = null,
}) => {
  if (!created) {
    return false;
  }

  const io = getSocketServer();

  const messagePayload =
    formatMessageForSocket(message);

  const conversationId =
    messagePayload.conversationId;

  const room = getConversationRoom(
    conversationId
  );

  /**
   * Retrieve sockets currently joined
   * to the conversation room.
   */

  const sockets =
    await io.in(room).fetchSockets();

  /**
   * Validate each recipient independently.
   */

  for (const socket of sockets) {
    if (
      excludeSocketId &&
      socket.id === excludeSocketId
    ) {
      continue;
    }

    const authorized =
      await verifySocketConversationAccess({
        socket,
        conversationId,
        requireActive: true,
      });

    if (!authorized) {
      continue;
    }

    /**
     * Deliver only to authorized sockets.
     */

    socket.emit(
      "message:new",
      {
        conversationId,
        message: messagePayload,
      }
    );
  }

  return true;
};

export default broadcastNewMessage;