import { create } from "zustand";

import {
  createOrGetConversation,
  getMyConversations,
  getConversationById,
  getConversationMessages,
  sendTextMessage,
  generateClientMessageId,
  getApiErrorMessage,
  getRateLimitRetryAfterMs,
} from "../api/conversation.api.js";

import { chatSocket } from "../lib/chatSocket.js";

import { useChatSocketStore } from "./useChatSocketStore.js";

/**
 * ============================================================
 * PREMIUMCHAT — ZUSTAND CHAT STORE
 * ============================================================
 *
 * Responsibilities:
 *
 * 1. Load conversations.
 * 2. Manage the active conversation.
 * 3. Fetch message history.
 * 4. Send text messages.
 * 5. Receive real-time messages.
 * 6. Prevent duplicate messages.
 * 7. Handle pagination.
 * 8. Handle rate limiting.
 * 9. Clean up chat state.
 *
 * Authentication and socket connection lifecycle are
 * managed separately by useAuthStore and
 * useChatSocketStore.
 */

/**
 * ============================================================
 * CONSTANTS
 * ============================================================
 */

const CONVERSATION_PAGE_SIZE = 20;

const MESSAGE_PAGE_SIZE = 30;

const SOCKET_ACK_TIMEOUT_MS = 10000;

const MAX_MESSAGE_LENGTH = 5000;

const INITIAL_STATE = {
  conversations: [],

  activeConversationId: null,

  activeConversation: null,

  messagesByConversation: {},

  messagePagination: {},

  isLoadingConversations: false,

  isLoadingConversation: false,

  isLoadingMessages: false,

  isSendingMessage: false,

  conversationsError: null,

  conversationError: null,

  messagesError: null,

  sendError: null,

  rateLimitedUntil: null,
};

/**
 * ============================================================
 * INTERNAL HELPERS
 * ============================================================
 */

const normalizeId = (value) => {
  if (!value) return null;

  return String(value).toLowerCase();
};

/**
 * Unwrap the API response.
 *
 * The backend returns:
 *
 * {
 *   success: true,
 *   data: ...
 * }
 */

const unwrapData = (response) => {
  return response?.data ?? response;
};

/**
 * Extract a conversation from supported
 * API response shapes.
 */

const extractConversation = (response) => {
  const data = unwrapData(response);

  return data?.conversation ?? data;
};

/**
 * Extract a message from supported
 * API response shapes.
 */

const extractMessage = (response) => {
  const data = unwrapData(response);

  return data?.message ?? data;
};

/**
 * Extract conversation lists.
 */

const extractConversations = (response) => {
  const data = unwrapData(response);

  if (Array.isArray(data)) {
    return data;
  }

  if (Array.isArray(data?.conversations)) {
    return data.conversations;
  }

  return [];
};

/**
 * Extract message history.
 */

const extractMessages = (response) => {
  const data = unwrapData(response);

  if (Array.isArray(data)) {
    return data;
  }

  if (Array.isArray(data?.messages)) {
    return data.messages;
  }

  return [];
};

/**
 * Merge messages without duplicates.
 *
 * Messages are deduplicated by:
 *
 * - MongoDB message ID
 * - clientMessageId + senderId
 */

const mergeMessages = (
  existingMessages = [],
  incomingMessages = []
) => {
  const result = [];

  const seenIds = new Set();

  const seenClientIds = new Set();

  for (const message of [
    ...existingMessages,
    ...incomingMessages,
  ]) {
    if (!message) continue;

    const messageId = normalizeId(
      message._id ?? message.id
    );

    const senderId = normalizeId(
      message.senderId
    );

    const clientMessageId =
      message.clientMessageId;

    const clientKey =
      senderId && clientMessageId
        ? `${senderId}:${clientMessageId}`
        : null;

    if (
      (messageId && seenIds.has(messageId)) ||
      (clientKey && seenClientIds.has(clientKey))
    ) {
      continue;
    }

    if (messageId) {
      seenIds.add(messageId);
    }

    if (clientKey) {
      seenClientIds.add(clientKey);
    }

    result.push(message);
  }

  /**
   * Oldest messages first.
   */

  result.sort((a, b) => {
    return (
      new Date(a.createdAt).getTime() -
      new Date(b.createdAt).getTime()
    );
  });

  return result;
};

/**
 * Move the most recently active conversation
 * to the top of the sidebar.
 */

const sortConversations = (conversations) => {
  return [...conversations].sort((a, b) => {
    const dateA = new Date(
      a.lastMessageAt ?? a.updatedAt ?? 0
    ).getTime();

    const dateB = new Date(
      b.lastMessageAt ?? b.updatedAt ?? 0
    ).getTime();

    return dateB - dateA;
  });
};

/**
 * Add or update a conversation.
 */

const upsertConversation = (
  conversations,
  incomingConversation
) => {
  if (!incomingConversation) {
    return conversations;
  }

  const incomingId = normalizeId(
    incomingConversation._id ??
      incomingConversation.id
  );

  if (!incomingId) {
    return conversations;
  }

  const existingIndex = conversations.findIndex(
    (conversation) =>
      normalizeId(
        conversation._id ?? conversation.id
      ) === incomingId
  );

  if (existingIndex === -1) {
    return sortConversations([
      incomingConversation,
      ...conversations,
    ]);
  }

  const updated = [...conversations];

  updated[existingIndex] = {
    ...updated[existingIndex],
    ...incomingConversation,
  };

  return sortConversations(updated);
};

/**
 * ============================================================
 * STORE
 * ============================================================
 */

export const useChatStore = create((set, get) => ({
  ...INITIAL_STATE,

  /**
   * ========================================================
   * LOAD CONVERSATIONS
   * ========================================================
   */

  loadConversations: async () => {
    set({
      isLoadingConversations: true,
      conversationsError: null,
    });

    try {
      const response = await getMyConversations({
        page: 1,
        limit: CONVERSATION_PAGE_SIZE,
      });

      const conversations =
        extractConversations(response);

      set({
        conversations: sortConversations(
          conversations
        ),

        isLoadingConversations: false,
      });

      return conversations;
    } catch (error) {
      set({
        isLoadingConversations: false,

        conversationsError:
          getApiErrorMessage(error),
      });

      return [];
    }
  },

  /**
   * ========================================================
   * CREATE OR OPEN CONVERSATION
   * ========================================================
   */

  openConversationWithCreator: async (
    creatorId
  ) => {
    set({
      isLoadingConversation: true,
      conversationError: null,
    });

    try {
      const response =
        await createOrGetConversation({
          creatorId,
        });

      const conversation =
        extractConversation(response);

      const conversationId = normalizeId(
        conversation?._id ??
          conversation?.id
      );

      if (!conversationId) {
        throw new Error(
          "The server returned an invalid conversation."
        );
      }

      set((state) => ({
        conversations: upsertConversation(
          state.conversations,
          conversation
        ),

        isLoadingConversation: false,
      }));

      await get().selectConversation(
        conversationId
      );

      return conversation;
    } catch (error) {
      set({
        isLoadingConversation: false,

        conversationError:
          getApiErrorMessage(error),
      });

      return null;
    }
  },

  /**
   * ========================================================
   * SELECT CONVERSATION
   * ========================================================
   */

  selectConversation: async (
    conversationId
  ) => {
    const id = normalizeId(conversationId);

    if (!id) {
      return null;
    }

    const previousId =
      get().activeConversationId;

    /**
     * Leave the previous Socket.IO room.
     */

    if (
      previousId &&
      previousId !== id &&
      chatSocket.connected
    ) {
      chatSocket.emit(
        "conversation:leave",
        {
          conversationId: previousId,
        }
      );
    }

    set({
      activeConversationId: id,

      activeConversation: null,

      isLoadingConversation: true,

      conversationError: null,

      messagesError: null,
    });

    try {
      const response =
        await getConversationById(id);

      const conversation =
        extractConversation(response);

      set((state) => ({
        activeConversation: conversation,

        conversations: upsertConversation(
          state.conversations,
          conversation
        ),

        isLoadingConversation: false,
      }));

      /**
       * Load the latest messages.
       */

      await get().loadMessages(id);

      /**
       * Join the private Socket.IO room.
       */

      if (chatSocket.connected) {
        chatSocket.emit(
          "conversation:join",
          {
            conversationId: id,
          }
        );
      }

      return conversation;
    } catch (error) {
      set({
        isLoadingConversation: false,

        conversationError:
          getApiErrorMessage(error),
      });

      return null;
    }
  },

  /**
   * ========================================================
   * LOAD MESSAGE HISTORY
   * ========================================================
   */

  loadMessages: async (
    conversationId
  ) => {
    const id = normalizeId(conversationId);

    if (!id) {
      return [];
    }

    set({
      isLoadingMessages: true,
      messagesError: null,
    });

    try {
      const response =
        await getConversationMessages({
          conversationId: id,

          limit: MESSAGE_PAGE_SIZE,
        });

      const messages =
        extractMessages(response);

      const data = unwrapData(response);

      set((state) => ({
        messagesByConversation: {
          ...state.messagesByConversation,

          [id]: mergeMessages(
            state.messagesByConversation[id] ??
              [],
            messages
          ),
        },

        messagePagination: {
          ...state.messagePagination,

          [id]: {
            nextCursor:
              data?.nextCursor ?? null,

            hasMore:
              Boolean(data?.hasMore),
          },
        },

        isLoadingMessages: false,
      }));

      return messages;
    } catch (error) {
      set({
        isLoadingMessages: false,

        messagesError:
          getApiErrorMessage(error),
      });

      return [];
    }
  },

  /**
   * ========================================================
   * LOAD OLDER MESSAGES
   * ========================================================
   */

  loadOlderMessages: async (
    conversationId
  ) => {
    const id = normalizeId(conversationId);

    if (!id) {
      return [];
    }

    const pagination =
      get().messagePagination[id];

    if (
      !pagination?.hasMore ||
      !pagination?.nextCursor
    ) {
      return [];
    }

    set({
      isLoadingMessages: true,
      messagesError: null,
    });

    try {
      const response =
        await getConversationMessages({
          conversationId: id,

          before: pagination.nextCursor,

          limit: MESSAGE_PAGE_SIZE,
        });

      const messages =
        extractMessages(response);

      const data = unwrapData(response);

      set((state) => ({
        messagesByConversation: {
          ...state.messagesByConversation,

          [id]: mergeMessages(
            state.messagesByConversation[id] ??
              [],
            messages
          ),
        },

        messagePagination: {
          ...state.messagePagination,

          [id]: {
            nextCursor:
              data?.nextCursor ?? null,

            hasMore:
              Boolean(data?.hasMore),
          },
        },

        isLoadingMessages: false,
      }));

      return messages;
    } catch (error) {
      set({
        isLoadingMessages: false,

        messagesError:
          getApiErrorMessage(error),
      });

      return [];
    }
  },

  /**
   * ========================================================
   * RECEIVE MESSAGE
   * ========================================================
   */

  receiveMessage: (message) => {
    if (!message) {
      return;
    }

    const conversationId = normalizeId(
      message.conversationId
    );

    if (!conversationId) {
      return;
    }

    set((state) => ({
      messagesByConversation: {
        ...state.messagesByConversation,

        [conversationId]: mergeMessages(
          state.messagesByConversation[
            conversationId
          ] ?? [],
          [message]
        ),
      },

      conversations: sortConversations(
        state.conversations.map(
          (conversation) => {
            const id = normalizeId(
              conversation._id ??
                conversation.id
            );

            if (id !== conversationId) {
              return conversation;
            }

            return {
              ...conversation,

              lastMessageId:
                message._id,

              lastMessageAt:
                message.createdAt,
            };
          }
        )
      ),
    }));
  },

  /**
   * ========================================================
   * SEND TEXT MESSAGE
   * ========================================================
   */

  sendMessage: async ({
    conversationId,
    content,
  }) => {
    const id = normalizeId(conversationId);

    const text =
      typeof content === "string"
        ? content.trim()
        : "";

    if (
      !id ||
      !text ||
      text.length > MAX_MESSAGE_LENGTH
    ) {
      set({
        sendError:
          "Enter a valid message before sending.",
      });

      return null;
    }

    /**
     * Prevent concurrent sends from this store.
     */

    if (get().isSendingMessage) {
      return null;
    }

    /**
     * Respect an active REST rate-limit cooldown.
     */

    if (
      get().rateLimitedUntil &&
      Date.now() < get().rateLimitedUntil
    ) {
      set({
        sendError:
          "Please wait before sending another message.",
      });

      return null;
    }

    const clientMessageId =
      generateClientMessageId();

    set({
      isSendingMessage: true,
      sendError: null,
    });

    try {
      let message = null;

      /**
       * Prefer Socket.IO when connected.
       */

      if (
        chatSocket.connected &&
        useChatSocketStore.getState()
          .isConnected
      ) {
        try {
          const socketResponse =
            await new Promise(
              (resolve, reject) => {
                chatSocket
                  .timeout(
                    SOCKET_ACK_TIMEOUT_MS
                  )
                  .emit(
                    "message:send",
                    {
                      conversationId: id,

                      clientMessageId,

                      content: text,
                    },
                    (error, response) => {
                      if (error) {
                        reject(error);
                        return;
                      }

                      if (
                        !response?.success
                      ) {
                        const socketError =
                          new Error(
                            response?.message ||
                              "Unable to send message."
                          );

                        socketError.code =
                          response?.code;

                        socketError.retryAfterMs =
                          response?.retryAfterMs;

                        reject(socketError);
                        return;
                      }

                      resolve(response);
                    }
                  );
              }
            );

          message =
            extractMessage(socketResponse);
        } catch (socketError) {
          /**
           * Do not automatically switch to REST
           * after a socket timeout.
           *
           * The backend might have saved the
           * message even if the ACK was lost.
           *
           * Retrying must reuse the same
           * clientMessageId.
           */

          throw socketError;
        }
      } else {
        /**
         * REST fallback when Socket.IO
         * is not connected.
         */

        const response =
          await sendTextMessage({
            conversationId: id,

            clientMessageId,

            content: text,
          });

        message =
          extractMessage(response);
      }

      if (!message) {
        throw new Error(
          "The server did not return a message."
        );
      }

      get().receiveMessage(message);

      set({
        isSendingMessage: false,
        sendError: null,
      });

      return message;
    } catch (error) {
      const retryAfterMs =
        error?.retryAfterMs ??
        getRateLimitRetryAfterMs(error);

      set({
        isSendingMessage: false,

        sendError:
          getApiErrorMessage(error),

        rateLimitedUntil:
          retryAfterMs !== null &&
          retryAfterMs !== undefined
            ? Date.now() + retryAfterMs
            : null,
      });

      return null;
    }
  },

  /**
   * ========================================================
   * INITIALIZE REAL-TIME MESSAGE LISTENERS
   * ========================================================
   */

  initializeRealtime: () => {
    /**
     * Remove these exact listeners before
     * registering them again.
     *
     * This prevents duplicate message handlers.
     */

    chatSocket.off(
      "message:new",
      handleIncomingMessage
    );

    chatSocket.off(
      "connect",
      handleSocketReconnect
    );

    chatSocket.on(
      "message:new",
      handleIncomingMessage
    );

    chatSocket.on(
      "connect",
      handleSocketReconnect
    );
  },

  /**
   * ========================================================
   * CLEAN UP REAL-TIME LISTENERS
   * ========================================================
   */

  cleanupRealtime: () => {
    chatSocket.off(
      "message:new",
      handleIncomingMessage
    );

    chatSocket.off(
      "connect",
      handleSocketReconnect
    );
  },

  /**
   * ========================================================
   * CLEAR ACTIVE CONVERSATION
   * ========================================================
   */

  clearActiveConversation: () => {
    const previousId =
      get().activeConversationId;

    if (
      previousId &&
      chatSocket.connected
    ) {
      chatSocket.emit(
        "conversation:leave",
        {
          conversationId: previousId,
        }
      );
    }

    set({
      activeConversationId: null,

      activeConversation: null,

      isLoadingConversation: false,

      isLoadingMessages: false,

      conversationError: null,

      messagesError: null,
    });
  },

  /**
   * ========================================================
   * CLEAR CHAT STATE
   * ========================================================
   *
   * Call this when the authenticated user logs out.
   */

  resetChat: () => {
    get().cleanupRealtime();

    get().clearActiveConversation();

    set({
      ...INITIAL_STATE,
    });
  },
}));

/**
 * ============================================================
 * SOCKET EVENT HANDLERS
 * ============================================================
 *
 * Defined outside the Zustand store to maintain
 * stable function references.
 */

/**
 * Handle incoming messages.
 */

function handleIncomingMessage(payload) {
  const message = payload?.message;

  if (!message) {
    return;
  }

  useChatStore
    .getState()
    .receiveMessage(message);
}

/**
 * Rejoin the active conversation after reconnecting.
 */

function handleSocketReconnect() {
  const conversationId =
    useChatStore.getState()
      .activeConversationId;

  if (!conversationId) {
    return;
  }

  chatSocket.emit(
    "conversation:join",
    {
      conversationId,
    }
  );
}

export default useChatStore;