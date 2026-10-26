import { create } from "zustand";

import {
  chatSocket,
  connectChatSocket,
  disconnectChatSocket,
} from "../lib/chatSocket.js";

/**
 * ============================================================
 * PREMIUMCHAT — CHAT SOCKET STORE
 * ============================================================
 *
 * Centralized Socket.IO connection management.
 *
 * Socket event listeners are registered once.
 */

let listenersRegistered = false;

/**
 * ============================================================
 * CHAT SOCKET STORE
 * ============================================================
 */

export const useChatSocketStore = create(
  (set, get) => ({
    /**
     * CONNECTION STATE
     */

    isConnected: false,

    isConnecting: false,

    connectionError: null,

    sessionExpired: false,

    /**
     * ========================================================
     * INITIALIZE SOCKET LISTENERS
     * ========================================================
     */

    initializeSocket: () => {
      if (listenersRegistered) {
        return;
      }

      listenersRegistered = true;

      /**
       * CONNECTED
       */

      chatSocket.on("connect", () => {
        set({
          isConnected: true,
          isConnecting: false,
          connectionError: null,
          sessionExpired: false,
        });
      });

      /**
       * DISCONNECTED
       */

      chatSocket.on("disconnect", (reason) => {
        set({
          isConnected: false,
          isConnecting: false,
        });

        /**
         * The Socket.IO client normally attempts
         * reconnection after transport failures.
         *
         * Server-initiated disconnects require
         * explicit reconnection after reauthentication.
         */
        if (reason === "io server disconnect") {
          set({
            connectionError:
              "The server disconnected your chat session.",
          });
        }
      });

      /**
       * CONNECTION ERROR
       */

      chatSocket.on(
        "connect_error",
        (error) => {
          set({
            isConnected: false,
            isConnecting: false,
            connectionError:
              error.message ||
              "Unable to connect to live chat.",
          });
        }
      );

      /**
       * SESSION EXPIRED / REVOKED
       */

      chatSocket.on(
        "auth:session_expired",
        (payload) => {
          set({
            isConnected: false,
            isConnecting: false,
            sessionExpired: true,
            connectionError:
              payload?.message ||
              "Your session has expired. Please sign in again.",
          });

          disconnectChatSocket();
        }
      );
    },

    /**
     * ========================================================
     * CONNECT
     * ========================================================
     */

    connect: () => {
      get().initializeSocket();

      if (
        chatSocket.connected ||
        chatSocket.active
      ) {
        return;
      }

      set({
        isConnecting: true,
        connectionError: null,
        sessionExpired: false,
      });

      connectChatSocket();
    },

    /**
     * ========================================================
     * DISCONNECT
     * ========================================================
     */

    disconnect: () => {
      disconnectChatSocket();

      set({
        isConnected: false,
        isConnecting: false,
        connectionError: null,
        sessionExpired: false,
      });
    },

    /**
     * ========================================================
     * CLEAR CONNECTION ERROR
     * ========================================================
     */

    clearConnectionError: () => {
      set({
        connectionError: null,
      });
    },
  })
);

export default useChatSocketStore;