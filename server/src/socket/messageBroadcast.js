import {
  getSocketServer,
} from "./socket.server.js";

import {
  getConversationRoom,
} from "./conversation.socket.js";

/**
 * ============================================================
 * PREMIUMCHAT MESSAGE BROADCAST HELPER
 * ============================================================
 *
 * Responsibilities:
 *
 * - Convert saved MongoDB messages into safe socket payloads.
 * - Broadcast newly created messages.
 * - Prevent duplicate broadcasts from ordinary retries.
 *
 * Important:
 *
 * MongoDB is the source of truth.
 *
 * Socket.IO broadcasts are best-effort notifications.
 * Clients must synchronize history after reconnecting.
 */

/**
 * ============================================================
 * FORMAT MESSAGE FOR SOCKET DELIVERY
 * ============================================================
 */

export const formatMessageForSocket = (message) => {
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
 * BROADCAST NEW MESSAGE
 * ============================================================
 *
 * Only newly created messages are broadcast.
 *
 * The optional excludeSocketId parameter prevents
 * broadcasting to the originating socket when it
 * already receives a message:sent acknowledgment.
 */

export const broadcastNewMessage = ({
  message,
  created,
  excludeSocketId = null,
}) => {
  if (!created) {
    return false;
  }

  const messagePayload =
    formatMessageForSocket(message);

  const conversationId =
    messagePayload.conversationId;

  const room = getConversationRoom(
    conversationId
  );

  const io = getSocketServer();

  const emitter = excludeSocketId
    ? io.except(excludeSocketId)
    : io;

  emitter.to(room).emit(
    "message:new",
    {
      conversationId,
      message: messagePayload,
    }
  );

  return true;
};

export default broadcastNewMessage;