/**
 * ============================================================
 * PREMIUMCHAT — AUTHENTICATED SOCKET REGISTRY
 * ============================================================
 *
 * Tracks connected sockets by:
 *
 * - User ID
 * - Authentication session ID
 *
 * Supports immediate local-process socket revocation.
 *
 * Note:
 * This registry is in-memory and process-local.
 * Multi-instance deployments require distributed coordination.
 */

const socketsByUser = new Map();

const socketsBySession = new Map();

/**
 * Add a socket to a registry collection.
 */
const addSocket = (registry, key, socket) => {
  if (!key) {
    return;
  }

  let sockets = registry.get(key);

  if (!sockets) {
    sockets = new Set();
    registry.set(key, sockets);
  }

  sockets.add(socket);
};

/**
 * Remove a socket from a registry collection.
 */
const removeSocket = (registry, key, socket) => {
  if (!key) {
    return;
  }

  const sockets = registry.get(key);

  if (!sockets) {
    return;
  }

  sockets.delete(socket);

  if (sockets.size === 0) {
    registry.delete(key);
  }
};

/**
 * ============================================================
 * REGISTER AUTHENTICATED SOCKET
 * ============================================================
 */

export const registerAuthenticatedSocket = (socket) => {
  const userId = socket.data?.userId;
  const sessionId = socket.data?.sessionId;

  if (
    typeof userId !== "string" ||
    !userId ||
    typeof sessionId !== "string" ||
    !sessionId
  ) {
    throw new Error(
      "Cannot register a socket without authenticated user and session IDs."
    );
  }

  addSocket(socketsByUser, userId, socket);
  addSocket(socketsBySession, sessionId, socket);

  /**
   * Clean up automatically when the socket disconnects.
   */
  socket.once("disconnect", () => {
    unregisterAuthenticatedSocket(socket);
  });
};

/**
 * ============================================================
 * UNREGISTER SOCKET
 * ============================================================
 */

export const unregisterAuthenticatedSocket = (socket) => {
  const userId = socket.data?.userId;
  const sessionId = socket.data?.sessionId;

  removeSocket(socketsByUser, userId, socket);
  removeSocket(socketsBySession, sessionId, socket);
};

/**
 * ============================================================
 * DISCONNECT A SOCKET
 * ============================================================
 */

export const disconnectSocket = (
  socket,
  {
    code = "SESSION_REVOKED",
    message = "Your session is no longer valid.",
  } = {}
) => {
  if (!socket?.connected) {
    return false;
  }

  socket.emit("auth:session_expired", {
    code,
    message,
  });

  /**
   * Socket.IO automatically removes the socket
   * from all rooms when disconnected.
   */
  socket.disconnect(true);

  return true;
};

/**
 * ============================================================
 * DISCONNECT SOCKETS BY SESSION
 * ============================================================
 */

export const disconnectSocketsBySession = (
  sessionId,
  options = {}
) => {
  if (
    typeof sessionId !== "string" ||
    !sessionId
  ) {
    return 0;
  }

  const sockets = socketsBySession.get(sessionId);

  if (!sockets) {
    return 0;
  }

  let disconnected = 0;

  for (const socket of [...sockets]) {
    if (disconnectSocket(socket, options)) {
      disconnected += 1;
    }
  }

  return disconnected;
};

/**
 * ============================================================
 * DISCONNECT SOCKETS BY USER
 * ============================================================
 */

export const disconnectSocketsByUser = (
  userId,
  options = {}
) => {
  if (
    typeof userId !== "string" ||
    !userId
  ) {
    return 0;
  }

  const sockets = socketsByUser.get(userId);

  if (!sockets) {
    return 0;
  }

  let disconnected = 0;

  for (const socket of [...sockets]) {
    if (disconnectSocket(socket, options)) {
      disconnected += 1;
    }
  }

  return disconnected;
};

/**
 * ============================================================
 * REGISTRY STATISTICS
 * ============================================================
 *
 * Intended for internal diagnostics only.
 */

export const getSocketRegistryStats = () => {
  let totalSockets = 0;

  for (const sockets of socketsByUser.values()) {
    totalSockets += sockets.size;
  }

  return {
    connectedSockets: totalSockets,
    connectedUsers: socketsByUser.size,
    trackedSessions: socketsBySession.size,
  };
};