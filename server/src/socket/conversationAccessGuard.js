import {
  verifyConversationAccess,
} from "../services/conversationAccess.service.js";

import {
  requireValidSocketSession,
} from "./socketSessionGuard.js";

import {
  getConversationRoom,
} from "./conversation.socket.js";

/**
 * ============================================================
 * PREMIUMCHAT — SOCKET CONVERSATION ACCESS GUARD
 * ============================================================
 *
 * Revalidates conversation access for sockets.
 *
 * Unauthorized sockets are removed from
 * private conversation rooms.
 */

/**
 * ============================================================
 * REMOVE SOCKET FROM CONVERSATION ROOM
 * ============================================================
 */

export const removeSocketFromConversation = async ({
  socket,
  conversationId,
  reason = "CONVERSATION_ACCESS_REVOKED",
}) => {
  const room = getConversationRoom(
    conversationId
  );

  await socket.leave(room);

  if (socket.connected) {
    socket.emit(
      "conversation:access_revoked",
      {
        conversationId,
        code: reason,
        message:
          "You no longer have access to this conversation.",
      }
    );
  }
};

/**
 * ============================================================
 * VERIFY SOCKET CONVERSATION ACCESS
 * ============================================================
 */

export const verifySocketConversationAccess = async ({
  socket,
  conversationId,
  requireActive = true,
}) => {
  /**
   * Validate authentication session.
   */

  const sessionValid =
    await requireValidSocketSession(socket);

  if (!sessionValid) {
    return false;
  }

  try {
    /**
     * Verify conversation authorization.
     */

    await verifyConversationAccess({
      conversationId,
      userId: socket.data.userId,
      requireActive,
    });

    return true;
  } catch (error) {
    /**
     * Remove unauthorized sockets from
     * the conversation room.
     */

    await removeSocketFromConversation({
      socket,
      conversationId,
    });

    return false;
  }
};

export default verifySocketConversationAccess;