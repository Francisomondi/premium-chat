import { io } from "socket.io-client";

/**
 * ============================================================
 * PREMIUMCHAT — SOCKET.IO CLIENT
 * ============================================================
 *
 * Features:
 *
 * - Authenticated cookie-based connections
 * - Secure Socket.IO endpoint
 * - Manual connection management
 * - WebSocket with polling fallback
 * - Automatic reconnection
 *
 * IMPORTANT:
 *
 * The socket must not connect automatically.
 *
 * Authentication must initialize before connecting.
 */

/**
 * Get the Socket.IO server origin.
 *
 * The backend uses:
 *
 * /api/socket.io
 *
 * The URL passed to io() must be the server origin,
 * not the REST API endpoint.
 */

const getSocketServerUrl = () => {
  const configuredUrl =
    import.meta.env.VITE_SOCKET_URL ||
    import.meta.env.VITE_API_BASE_URL ||
    "";

  if (!configuredUrl) {
    return window.location.origin;
  }

  try {
    const parsedUrl = new URL(
      configuredUrl,
      window.location.origin
    );

    return parsedUrl.origin;
  } catch {
    throw new Error(
      "Invalid PremiumChat Socket.IO server URL."
    );
  }
};

/**
 * ============================================================
 * CREATE SOCKET INSTANCE
 * ============================================================
 */

export const chatSocket = io(
  getSocketServerUrl(),
  {
    path: "/api/socket.io",

    /**
     * The backend authenticates using
     * the HTTP-only access cookie.
     */
    withCredentials: true,

    /**
     * Prefer WebSocket.
     * Fall back to HTTP long polling.
     */
    transports: [
      "websocket",
      "polling",
    ],

    /**
     * Authentication must initialize
     * before opening the connection.
     */
    autoConnect: false,

    /**
     * Automatically reconnect after
     * temporary network interruptions.
     */
    reconnection: true,

    reconnectionAttempts: 5,

    reconnectionDelay: 1000,

    reconnectionDelayMax: 5000,

    timeout: 10000,
  }
);

/**
 * ============================================================
 * CONNECT
 * ============================================================
 */

export const connectChatSocket = () => {
  if (chatSocket.connected) {
    return chatSocket;
  }

  chatSocket.connect();

  return chatSocket;
};

/**
 * ============================================================
 * DISCONNECT
 * ============================================================
 */

export const disconnectChatSocket = () => {
  if (chatSocket.connected) {
    chatSocket.disconnect();
  }

  return chatSocket;
};

/**
 * ============================================================
 * GET CONNECTION STATUS
 * ============================================================
 */

export const isChatSocketConnected = () => {
  return chatSocket.connected;
};

export default chatSocket;