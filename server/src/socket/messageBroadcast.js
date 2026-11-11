
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
 * MESSAGE SOCKET SERIALIZATION
 * ============================================================
 *
 * Only explicitly approved fields are broadcast.
 * Never broadcast storage keys or signed media URLs.
 */

export const formatMessageForSocket = (message) => {
  if (!message || typeof message !== "object") {
    throw new Error(
      "Invalid message supplied for socket serialization."
    );
  }

  const supportedTypes = [
    "TEXT",
    "IMAGE",
    "VIDEO",
  ];

  if (!supportedTypes.includes(message.type)) {
    throw new Error(
      "Unsupported socket message type."
    );
  }

  const payload = {
    _id: message._id?.toString(),
    conversationId: message.conversationId?.toString(),
    senderId: message.senderId?.toString(),
    clientMessageId: message.clientMessageId,
    type: message.type,
    content: message.content || "",
    status: message.status,
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
  };

  if (message.type !== "TEXT") {
    payload.mediaId =
      message.mediaId?.toString() ?? null;

    payload.isLocked =
      message.isLocked === true;
  }

  return payload;
};

/**
 * ============================================================
 * BROADCAST NEW MESSAGE
 * ============================================================
 */

export const broadcastNewMessage = async ({
  message,
  created,
  excludeSocketId = null,
}) => {
  if (!created || !message) {
    return false;
  }

  const io = getSocketServer();

  if (!io) {
    return false;
  }

  const payload = formatMessageForSocket(message);

  const conversationId = payload.conversationId;

  if (!conversationId) {
    return false;
  }

  const room = getConversationRoom(conversationId);

  const sockets = await io.in(room).fetchSockets();

  for (const socket of sockets) {
    if (
      excludeSocketId &&
      socket.id === excludeSocketId
    ) {
      continue;
    }

    try {
      const authorized =
        await verifySocketConversationAccess({
          socket,
          conversationId,
          requireActive: true,
        });

      if (!authorized) {
        continue;
      }

      socket.emit("message:new", {
        conversationId,
        message: payload,
      });
    } catch {
      // Never deliver to a socket whose authorization
      // could not be verified.
      continue;
    }
  }

  return true;
};

export default broadcastNewMessage;
