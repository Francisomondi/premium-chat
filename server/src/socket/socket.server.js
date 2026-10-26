
import { Server } from "socket.io";

import { env } from "../config/env.js";

import authenticateSocket from "./socketAuth.middleware.js";

import {
  startSocketSessionGuard,
} from "./socketSessionGuard.js";

import {
  registerConversationSocketHandlers,
} from "./conversation.socket.js";

import {
  registerMessageSocketHandlers,
} from "./message.socket.js";

import {
  registerAuthenticatedSocket,
  unregisterAuthenticatedSocket,
} from "./socketRegistry.js";

/**
 * ============================================================
 * PREMIUMCHAT SOCKET.IO SERVER
 * ============================================================
 *
 * Shared HTTP server.
 * Cookie-based authentication.
 * Automatic session expiration.
 * Periodic session revocation checks.
 */

let io = null;

/**
 * ============================================================
 * INITIALIZE SOCKET.IO
 * ============================================================
 */

export const initializeSocketServer = (httpServer) => {
  if (
    !httpServer ||
    typeof httpServer.on !== "function" ||
    typeof httpServer.listen !== "function"
  ) {
    throw new TypeError(
      "A valid HTTP server is required."
    );
  }

  if (io) {
    throw new Error(
      "Socket.IO has already been initialized."
    );
  }

  io = new Server(httpServer, {
    path: "/api/socket.io",

    cors: {
      origin: env.CLIENT_URLS,
      credentials: true,
      methods: ["GET", "POST"],
    },

    transports: ["websocket", "polling"],

    allowEIO3: false,

    maxHttpBufferSize: 100 * 1024,

    pingInterval: 25000,

    pingTimeout: 20000,

    connectTimeout: 10000,

    allowRequest: (req, callback) => {
      const origin = req.headers.origin;

      if (
        typeof origin !== "string" ||
        !env.CLIENT_URLS.includes(origin)
      ) {
        return callback(
          "Socket origin is not allowed.",
          false
        );
      }

      return callback(null, true);
    },
  });

  /**
   * ==========================================================
   * SOCKET AUTHENTICATION
   * ==========================================================
   *
   * Runs before the connection event.
   */
  io.use(authenticateSocket);

  /**
   * ==========================================================
   * AUTHENTICATED CONNECTION HANDLER
   * ==========================================================
   */

/**
 * ============================================================
 * AUTHENTICATED SOCKET CONNECTIONS
 * ============================================================
 */

    io.on("connection", (socket) => {
    const userId = socket.data.userId;

    /**
     * Track this authenticated connection.
     */
    registerAuthenticatedSocket(socket);

    console.log(
        `Authenticated socket connected: ${socket.id} (user: ${userId})`
    );

    /**
     * Start session expiration and revocation monitoring.
     */
    const stopSessionGuard =
        startSocketSessionGuard(socket);

    /**
     * Register secure conversation room events.
     */
    registerConversationSocketHandlers(socket);

    /**
     * Register real-time messaging events.
     */
    registerMessageSocketHandlers(socket);

    /**
     * Clean up when disconnected.
     */
    socket.on("disconnect", (reason) => {
        stopSessionGuard();

        console.log(
        `Socket disconnected: ${socket.id} (${reason})`
        );
    });
    });

  console.log(
    "Socket.IO initialized with authentication and session monitoring."
  );

  return io;
};

/**
 * ============================================================
 * GET SOCKET.IO INSTANCE
 * ============================================================
 */

export const getSocketServer = () => {
  if (!io) {
    throw new Error(
      "Socket.IO server has not been initialized."
    );
  }

  return io;
};

/**
 * ============================================================
 * CLOSE SOCKET.IO
 * ============================================================
 */

export const closeSocketServer = async () => {
  if (!io) {
    return;
  }

  const socketServer = io;

  await new Promise((resolve) => {
    socketServer.close(() => {
      resolve();
    });
  });

  io = null;

  console.log("Socket.IO server closed.");
};
