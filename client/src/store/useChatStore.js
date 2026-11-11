
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
  sendMediaMessage as sendMediaMessageApi,
} from "../api/conversation.api.js";

import { chatSocket } from "../lib/chatSocket.js";
import { useChatSocketStore } from "./useChatSocketStore.js";

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

const normalizeId = (value) => {
  if (!value) return null;
  return String(value).toLowerCase();
};

/**
 * Normalize Axios responses and backend response envelopes.
 *
 * Supports:
 * 1. Axios response: { data: { success, data: {...} } }
 * 2. API helper response: { success, data: {...} }
 * 3. Already-unwrapped response: { message: {...} }
 */
const unwrapData = (response) => {
  let data = response?.data ?? response;

  if (
    data &&
    typeof data === "object" &&
    Object.prototype.hasOwnProperty.call(data, "data")
  ) {
    data = data.data;
  }

  return data;
};

const extractConversation = (response) => {
  const data = unwrapData(response);
  return data?.conversation ?? data;
};

const extractMessage = (response) => {
  const data = unwrapData(response);
  return data?.message ?? data;
};

const extractConversations = (response) => {
  const data = unwrapData(response);

  if (Array.isArray(data)) return data;

  if (Array.isArray(data?.conversations)) {
    return data.conversations;
  }

  return [];
};

const extractMessages = (response) => {
  const data = unwrapData(response);

  if (Array.isArray(data)) return data;

  if (Array.isArray(data?.messages)) {
    return data.messages;
  }

  return [];
};

/**
 * Merge by MongoDB ID or sender/clientMessageId.
 *
 * Incoming server message fields replace stale fields.
 * Refreshed message.media replaces the previous media
 * object so authorization and purchase states stay current.
 */
const mergeMessages = (
  existingMessages = [],
  incomingMessages = []
) => {
  const result = [];
  const indexByMessageId = new Map();
  const indexByClientKey = new Map();

  const getMessageId = (message) =>
    normalizeId(message?._id ?? message?.id);

  const getClientKey = (message) => {
    const senderId = normalizeId(message?.senderId);
    const clientMessageId = message?.clientMessageId;

    return senderId && clientMessageId
      ? `${senderId}:${clientMessageId}`
      : null;
  };

  for (const message of [
    ...existingMessages,
    ...incomingMessages,
  ]) {
    if (!message) continue;

    const messageId = getMessageId(message);
    const clientKey = getClientKey(message);

    let existingIndex = messageId
      ? indexByMessageId.get(messageId)
      : undefined;

    if (
      existingIndex === undefined &&
      clientKey
    ) {
      existingIndex = indexByClientKey.get(clientKey);
    }

    if (existingIndex !== undefined) {
      result[existingIndex] = {
        ...result[existingIndex],
        ...message,
      };

      if (messageId) {
        indexByMessageId.set(messageId, existingIndex);
      }

      if (clientKey) {
        indexByClientKey.set(clientKey, existingIndex);
      }

      continue;
    }

    const newIndex = result.length;
    result.push(message);

    if (messageId) {
      indexByMessageId.set(messageId, newIndex);
    }

    if (clientKey) {
      indexByClientKey.set(clientKey, newIndex);
    }
  }

  result.sort((a, b) => {
    return (
      new Date(a.createdAt).getTime() -
      new Date(b.createdAt).getTime()
    );
  });

  return result;
};

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

const upsertConversation = (
  conversations,
  incomingConversation
) => {
  if (!incomingConversation) return conversations;

  const incomingId = normalizeId(
    incomingConversation._id ??
      incomingConversation.id
  );

  if (!incomingId) return conversations;

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

const extractPagination = (response) => {
  const data = unwrapData(response);
  return data?.pagination ?? {};
};

export const useChatStore = create((set, get) => ({
  ...INITIAL_STATE,

  /**
   * LOAD CONVERSATIONS
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
        conversations: sortConversations(conversations),
        isLoadingConversations: false,
      });

      return conversations;
    } catch (error) {
      set({
        isLoadingConversations: false,
        conversationsError: getApiErrorMessage(error),
      });

      return [];
    }
  },

  /**
   * CREATE OR OPEN CONVERSATION
   */
  openConversationWithCreator: async (creatorId) => {
    set({
      isLoadingConversation: true,
      conversationError: null,
    });

    try {
      const response = await createOrGetConversation({
        creatorId,
      });

      const conversation =
        extractConversation(response);

      const conversationId = normalizeId(
        conversation?._id ?? conversation?.id
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

      await get().selectConversation(conversationId);

      return conversation;
    } catch (error) {
      set({
        isLoadingConversation: false,
        conversationError: getApiErrorMessage(error),
      });

      return null;
    }
  },

  /**
   * SELECT CONVERSATION
   */
  selectConversation: async (conversationId) => {
    const id = normalizeId(conversationId);

    if (!id) return null;

    const previousId = get().activeConversationId;

    if (
      previousId &&
      previousId !== id &&
      chatSocket.connected
    ) {
      chatSocket.emit("conversation:leave", {
        conversationId: previousId,
      });
    }

    set({
      activeConversationId: id,
      activeConversation: null,
      isLoadingConversation: true,
      conversationError: null,
      messagesError: null,
    });

    try {
      const response = await getConversationById(id);
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

      await get().loadMessages(id);

      if (chatSocket.connected) {
        chatSocket.emit("conversation:join", {
          conversationId: id,
        });
      }

      return conversation;
    } catch (error) {
      set({
        isLoadingConversation: false,
        conversationError: getApiErrorMessage(error),
      });

      return null;
    }
  },

  /**
   * LOAD / REFRESH MESSAGE HISTORY
   */
  loadMessages: async (conversationId) => {
    const id = normalizeId(conversationId);

    if (!id) return [];

    set({
      isLoadingMessages: true,
      messagesError: null,
    });

    try {
      const response = await getConversationMessages({
        conversationId: id,
        limit: MESSAGE_PAGE_SIZE,
      });

      const messages = extractMessages(response);
      const pagination = extractPagination(response);

      set((state) => ({
        messagesByConversation: {
          ...state.messagesByConversation,
          [id]: mergeMessages(
            state.messagesByConversation[id] ?? [],
            messages
          ),
        },

        messagePagination: {
          ...state.messagePagination,
          [id]: {
            nextCursor: pagination?.nextCursor ?? null,
            hasMore: Boolean(pagination?.hasMore),
          },
        },

        isLoadingMessages: false,
      }));

      return messages;
    } catch (error) {
      set({
        isLoadingMessages: false,
        messagesError: getApiErrorMessage(error),
      });

      return [];
    }
  },

  /**
   * LOAD OLDER MESSAGES
   */
  loadOlderMessages: async (conversationId) => {
    const id = normalizeId(conversationId);

    if (!id) return [];

    const pagination = get().messagePagination[id];

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
      const response = await getConversationMessages({
        conversationId: id,
        before: pagination.nextCursor,
        limit: MESSAGE_PAGE_SIZE,
      });

      const messages = extractMessages(response);
      const nextPagination = extractPagination(response);

      set((state) => ({
        messagesByConversation: {
          ...state.messagesByConversation,
          [id]: mergeMessages(
            state.messagesByConversation[id] ?? [],
            messages
          ),
        },

        messagePagination: {
          ...state.messagePagination,
          [id]: {
            nextCursor: nextPagination?.nextCursor ?? null,
            hasMore: Boolean(nextPagination?.hasMore),
          },
        },

        isLoadingMessages: false,
      }));

      return messages;
    } catch (error) {
      set({
        isLoadingMessages: false,
        messagesError: getApiErrorMessage(error),
      });

      return [];
    }
  },

  /**
   * RECEIVE MESSAGE
   */
  receiveMessage: (message) => {
    if (!message) return;

    const conversationId = normalizeId(
      message.conversationId
    );

    if (!conversationId) return;

    set((state) => ({
      messagesByConversation: {
        ...state.messagesByConversation,
        [conversationId]: mergeMessages(
          state.messagesByConversation[conversationId] ?? [],
          [message]
        ),
      },

      conversations: sortConversations(
        state.conversations.map((conversation) => {
          const id = normalizeId(
            conversation._id ?? conversation.id
          );

          if (id !== conversationId) {
            return conversation;
          }

          return {
            ...conversation,
            lastMessageId: message._id,
            lastMessageAt: message.createdAt,
          };
        })
      ),
    }));
  },

  /**
   * SEND TEXT MESSAGE
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
        sendError: "Enter a valid message before sending.",
      });

      return null;
    }

    if (get().isSendingMessage) return null;

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

    const clientMessageId = generateClientMessageId();

    set({
      isSendingMessage: true,
      sendError: null,
    });

    try {
      let message = null;

      if (
        chatSocket.connected &&
        useChatSocketStore.getState().isConnected
      ) {
        const socketResponse = await new Promise(
          (resolve, reject) => {
            chatSocket
              .timeout(SOCKET_ACK_TIMEOUT_MS)
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

                  if (!response?.success) {
                    const socketError = new Error(
                      response?.message ||
                        "Unable to send message."
                    );

                    socketError.code = response?.code;
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

        message = extractMessage(socketResponse);
      } else {
        const response = await sendTextMessage({
          conversationId: id,
          clientMessageId,
          content: text,
        });

        message = extractMessage(response);
      }

      if (!message || typeof message !== "object") {
        throw new Error(
          "The server did not return a valid message."
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
        sendError: getApiErrorMessage(error),
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
   * SEND IMAGE MESSAGE
   *
   * Sends the image message, then reloads history so
   * the server can attach authoritative media access data.
   */
  sendMediaMessage: async ({
    conversationId,
    mediaId,
    content = "",
  }) => {
    const id = normalizeId(conversationId);

    const validMediaId =
      typeof mediaId === "string"
        ? mediaId.trim()
        : "";

    const caption =
      typeof content === "string"
        ? content.trim()
        : "";

    if (
      !id ||
      !validMediaId ||
      caption.length > MAX_MESSAGE_LENGTH
    ) {
      set({
        sendError:
          "Select a valid image before attaching it.",
      });

      return null;
    }

    if (get().isSendingMessage) return null;

    set({
      isSendingMessage: true,
      sendError: null,
    });

    try {
      const response = await sendMediaMessageApi({
        conversationId: id,
        mediaId: validMediaId,
        content: caption,
        clientMessageId: generateClientMessageId(),
      });

      const message = extractMessage(response);

      if (!message || typeof message !== "object") {
        throw new Error(
          "The server did not return the image message."
        );
      }

      get().receiveMessage(message);

      set({
        isSendingMessage: false,
        sendError: null,
      });

      // Refresh to obtain server-calculated:
      // canAccess, canPurchase, price, status and moderation.
      await get().loadMessages(id);

      return message;
    } catch (error) {
      const retryAfterMs =
        getRateLimitRetryAfterMs(error);

      set({
        isSendingMessage: false,
        sendError: getApiErrorMessage(error),
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
   * INITIALIZE REAL-TIME LISTENERS
   */
  initializeRealtime: () => {
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
   * CLEAN UP REAL-TIME LISTENERS
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
   * CLEAR ACTIVE CONVERSATION
   */
  clearActiveConversation: () => {
    const previousId = get().activeConversationId;

    if (previousId && chatSocket.connected) {
      chatSocket.emit("conversation:leave", {
        conversationId: previousId,
      });
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
   * CLEAR CHAT STATE ON LOGOUT
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
 */

function handleIncomingMessage(payload) {
  const message = payload?.message;

  if (!message) return;

  const store = useChatStore.getState();

  store.receiveMessage(message);

  // Socket messages may contain only the raw message.
  // Refresh image messages to obtain server authorization
  // metadata before rendering their image state.
  if (
    String(message.type).toUpperCase() === "IMAGE"
  ) {
    store.loadMessages(message.conversationId);
  }
}

function handleSocketReconnect() {
  const conversationId =
    useChatStore.getState().activeConversationId;

  if (!conversationId) return;

  chatSocket.emit("conversation:join", {
    conversationId,
  });
}

export default useChatStore;
