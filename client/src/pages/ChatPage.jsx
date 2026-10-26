import {
  useCallback,
  useEffect,
  useState,
} from "react";

import { useChatStore } from "../store/useChatStore.js";

import { useChatSocketStore } from "../store/useChatSocketStore.js";

import { useAuthStore } from "../store/useAuthStore.js";

import ConversationSidebar from "../components/chat/ConversationSidebar.jsx";

import ChatHeader from "../components/chat/ChatHeader.jsx";

import MessageList from "../components/chat/MessageList.jsx";

import MessageComposer from "../components/chat/MessageComposer.jsx";

import {
  getConversationId,
} from "../components/chat/chat.utils.js";

/**
 * ============================================================
 * PREMIUMCHAT — COMPLETE CHAT PAGE
 * ============================================================
 *
 * Combines:
 *
 * - Conversation Sidebar
 * - Chat Header
 * - Message List
 * - Message Composer
 *
 * Features:
 *
 * - Desktop two-column layout
 * - Mobile conversation navigation
 * - Socket.IO lifecycle management
 * - Active conversation management
 * - Connection status
 * - Loading and error states
 *
 * IMPORTANT:
 *
 * Authentication is managed by the existing
 * useAuthStore and route protection.
 *
 * This page does not independently authenticate
 * users or create sessions.
 */

/**
 * ============================================================
 * EMPTY CHAT ICON
 * ============================================================
 */

function EmptyChatIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-12 w-12"
    >
      <path
        d={[
          "M20 11.5a7.5 7.5 0 0 1-7.5 7.5",
          "H6l-3 2v-6.5A7.5 7.5 0 1 1",
          "20 11.5Z",
        ].join(" ")}
      />

      <path d="M8 11h8" />

      <path d="M8 14h5" />
    </svg>
  );
}

/**
 * ============================================================
 * CONNECTION STATUS
 * ============================================================
 */

function ConnectionStatus({
  isConnected,
  isConnecting,
  connectionError,
}) {
  let label = "Offline";

  let indicatorClass = "bg-slate-500";

  if (isConnected) {
    label = "Live chat connected";

    indicatorClass = "bg-emerald-400";
  } else if (isConnecting) {
    label = "Connecting to live chat";

    indicatorClass =
      "bg-amber-400 animate-pulse";
  } else if (connectionError) {
    label = "Live connection unavailable";
  }

  return (
    <div
      role="status"
      className={[
        "flex items-center gap-2",
        "text-[11px] text-slate-400",
      ].join(" ")}
    >
      <span
        className={[
          "h-2 w-2 rounded-full",
          indicatorClass,
        ].join(" ")}
      />

      <span>{label}</span>
    </div>
  );
}

/**
 * ============================================================
 * NO CONVERSATION SELECTED
 * ============================================================
 */

function NoConversationSelected({
  isConnected,
  isConnecting,
  connectionError,
}) {
  return (
    <div
      className={[
        "flex h-full min-h-0",
        "flex-col",
        "bg-[#0b0b14]",
      ].join(" ")}
    >
      {/* CONNECTION BAR */}

      <div
        className={[
          "flex min-h-14 items-center",
          "justify-end",
          "border-b border-white/10",
          "px-6",
        ].join(" ")}
      >
        <ConnectionStatus
          isConnected={isConnected}
          isConnecting={isConnecting}
          connectionError={connectionError}
        />
      </div>

      {/* EMPTY CONTENT */}

      <div
        className={[
          "flex flex-1 flex-col",
          "items-center justify-center",
          "px-6 py-12",
          "text-center",
        ].join(" ")}
      >
        <div
          className={[
            "flex h-24 w-24",
            "items-center justify-center",
            "rounded-[28px]",
            "border border-violet-500/20",
            "bg-violet-500/10",
            "text-violet-300",
          ].join(" ")}
        >
          <EmptyChatIcon />
        </div>

        <h2
          className={[
            "mt-7 text-2xl",
            "font-bold tracking-tight",
            "text-white",
          ].join(" ")}
        >
          Your conversations
        </h2>

        <p
          className={[
            "mt-3 max-w-sm",
            "text-sm leading-7",
            "text-slate-400",
          ].join(" ")}
        >
          Select a conversation from the
          sidebar to start messaging.

          Your private conversations
          with creators and users
          will appear here.
        </p>

        <div
          className={[
            "mt-7 rounded-full",
            "border border-white/10",
            "bg-white/5",
            "px-4 py-2",
            "text-xs text-slate-400",
          ].join(" ")}
        >
          🔒 Private messaging
        </div>
      </div>
    </div>
  );
}

/**
 * ============================================================
 * ACTIVE CHAT PANEL
 * ============================================================
 */

function ActiveChatPanel({
  conversation,
  conversationId,
  onBack,
  isConnected,
  isConnecting,
  connectionError,
}) {
  /**
   * Use the selected conversation's status
   * to determine whether sending is allowed.
   */

  const conversationStatus =
    conversation?.status ?? "ACTIVE";

  return (
    <div
      className={[
        "flex h-full min-h-0",
        "flex-col",
        "bg-[#0b0b14]",
      ].join(" ")}
    >
      {/* CHAT HEADER */}

      <ChatHeader
        conversation={conversation}
        onBack={onBack}
        showBackButton
      />

      {/* CONNECTION STATUS */}

      <div
        className={[
          "flex min-h-9 items-center",
          "justify-end",
          "border-b border-white/5",
          "bg-[#0e0e19]",
          "px-4",
          "sm:px-6",
        ].join(" ")}
      >
        <ConnectionStatus
          isConnected={isConnected}
          isConnecting={isConnecting}
          connectionError={connectionError}
        />
      </div>

      {/* MESSAGE HISTORY */}

      <MessageList
        conversationId={conversationId}
      />

      {/* MESSAGE COMPOSER */}

      <MessageComposer
        conversationId={conversationId}
        conversationStatus={
          conversationStatus
        }
      />
    </div>
  );
}

/**
 * ============================================================
 * CHAT PAGE
 * ============================================================
 */

export default function ChatPage() {
  /**
   * ========================================================
   * LOCAL UI STATE
   * ========================================================
   */

  const [showMobileChat, setShowMobileChat] =
    useState(false);

  /**
   * ========================================================
   * AUTH STATE
   * ========================================================
   */

  const isAuthenticated = useAuthStore(
    (state) => state.isAuthenticated
  );

  const currentUser = useAuthStore(
    (state) => state.user
  );

  const currentUserId =
    currentUser?._id ??
    currentUser?.id ??
    null;

  /**
   * ========================================================
   * CHAT STATE
   * ========================================================
   */

  const conversations = useChatStore(
    (state) => state.conversations
  );

  const activeConversationId =
    useChatStore(
      (state) =>
        state.activeConversationId
    );

  const activeConversation =
    useChatStore(
      (state) =>
        state.activeConversation
    );

  const isLoadingConversation =
    useChatStore(
      (state) =>
        state.isLoadingConversation
    );

  const conversationError =
    useChatStore(
      (state) =>
        state.conversationError
    );

  /**
   * ========================================================
   * CHAT ACTIONS
   * ========================================================
   */

  const initializeRealtime =
    useChatStore(
      (state) =>
        state.initializeRealtime
    );

  const cleanupRealtime =
    useChatStore(
      (state) =>
        state.cleanupRealtime
    );

  const clearActiveConversation =
    useChatStore(
      (state) =>
        state.clearActiveConversation
    );

  const selectConversation =
    useChatStore(
      (state) =>
        state.selectConversation
    );

  /**
   * ========================================================
   * SOCKET STATE
   * ========================================================
   */

  const isConnected =
    useChatSocketStore(
      (state) => state.isConnected
    );

  const isConnecting =
    useChatSocketStore(
      (state) => state.isConnecting
    );

  const connectionError =
    useChatSocketStore(
      (state) =>
        state.connectionError
    );

  const sessionExpired =
    useChatSocketStore(
      (state) =>
        state.sessionExpired
    );

  /**
   * ========================================================
   * SOCKET ACTIONS
   * ========================================================
   */

  const connectSocket =
    useChatSocketStore(
      (state) => state.connect
    );

  const disconnectSocket =
    useChatSocketStore(
      (state) => state.disconnect
    );

  /**
   * ========================================================
   * INITIALIZE REALTIME CHAT
   * ========================================================
   *
   * The Socket.IO connection should only be
   * started when the authenticated user
   * opens the chat page.
   *
   * Cleanup occurs when leaving the page.
   */

  useEffect(() => {
    if (
      !isAuthenticated ||
      !currentUserId
    ) {
      return;
    }

    initializeRealtime();

    connectSocket();

    return () => {
      cleanupRealtime();

      disconnectSocket();
    };
  }, [
    isAuthenticated,
    currentUserId,
    initializeRealtime,
    cleanupRealtime,
    connectSocket,
    disconnectSocket,
  ]);

  /**
   * ========================================================
   * HANDLE CONVERSATION SELECTION
   * ========================================================
   */

  const handleConversationSelect =
    useCallback(() => {
      setShowMobileChat(true);
    }, []);

  /**
   * ========================================================
   * HANDLE MOBILE BACK
   * ========================================================
   */

  const handleMobileBack =
    useCallback(() => {
      setShowMobileChat(false);
    }, []);

  /**
   * ========================================================
   * RESOLVE ACTIVE CONVERSATION
   * ========================================================
   *
   * The store may have an active conversation
   * ID before its details finish loading.
   *
   * Prefer activeConversation when available.
   * Otherwise, find the conversation in the
   * existing sidebar collection.
   */

  const resolvedConversation =
    activeConversation &&
    getConversationId(
      activeConversation
    ) === activeConversationId
      ? activeConversation
      : conversations.find(
          (conversation) =>
            getConversationId(
              conversation
            ) === activeConversationId
        ) ?? null;

  /**
   * ========================================================
   * OPTIONAL CONVERSATION RELOAD
   * ========================================================
   *
   * If an active ID exists but the conversation
   * cannot be resolved, the user can retry.
   */

  const handleRetryConversation = () => {
    if (!activeConversationId) {
      return;
    }

    void selectConversation(
      activeConversationId
    );
  };

  /**
   * ========================================================
   * RENDER
   * ========================================================
   */

  return (
    <main
      className={[
        "flex h-[calc(100dvh-80px)]",
        "min-h-[400px]",
        "w-full overflow-hidden",
        "bg-[#090911]",
        "text-white",
      ].join(" ")}
    >
      {/* ====================================================
          CONVERSATION SIDEBAR
         ==================================================== */}

      <div
        className={[
          "h-full min-h-0",
          "w-full shrink-0",
          "md:w-[340px]",
          "lg:w-[380px]",

          showMobileChat
            ? "hidden md:block"
            : "block",
        ].join(" ")}
      >
        <ConversationSidebar
          onConversationSelect={
            handleConversationSelect
          }
        />
      </div>

      {/* ====================================================
          MAIN CHAT AREA
         ==================================================== */}

      <div
        className={[
          "min-w-0 flex-1",
          "h-full min-h-0",

          showMobileChat
            ? "flex"
            : "hidden md:flex",

          "flex-col",
        ].join(" ")}
      >
        {/* SESSION EXPIRED */}

        {sessionExpired ? (
          <div
            className={[
              "flex h-full",
              "flex-col items-center",
              "justify-center",
              "px-6 text-center",
            ].join(" ")}
          >
            <h2
              className={[
                "text-lg font-semibold",
                "text-white",
              ].join(" ")}
            >
              Session expired
            </h2>

            <p
              className={[
                "mt-3 max-w-sm",
                "text-sm leading-6",
                "text-slate-400",
              ].join(" ")}
            >
              Your chat session is no longer
              valid. Please sign in again
              to continue messaging.
            </p>
          </div>
        ) : !activeConversationId ? (
          <NoConversationSelected
            isConnected={isConnected}
            isConnecting={isConnecting}
            connectionError={connectionError}
          />
        ) : isLoadingConversation &&
          !resolvedConversation ? (
          <div
            className={[
              "flex h-full items-center",
              "justify-center",
              "text-sm text-slate-400",
            ].join(" ")}
          >
            Loading conversation...
          </div>
        ) : conversationError &&
          !resolvedConversation ? (
          <div
            className={[
              "flex h-full flex-col",
              "items-center justify-center",
              "gap-4 px-6 text-center",
            ].join(" ")}
          >
            <p className="text-sm text-rose-300">
              {conversationError}
            </p>

            <button
              type="button"
              onClick={handleRetryConversation}
              className={[
                "rounded-xl",
                "bg-violet-600",
                "px-4 py-2",
                "text-sm font-medium",
                "text-white",
                "hover:bg-violet-500",
              ].join(" ")}
            >
              Try again
            </button>

            <button
              type="button"
              onClick={handleMobileBack}
              className={[
                "text-xs text-slate-400",
                "md:hidden",
              ].join(" ")}
            >
              Back to conversations
            </button>
          </div>
        ) : resolvedConversation ? (
          <ActiveChatPanel
            conversation={
              resolvedConversation
            }
            conversationId={
              activeConversationId
            }
            onBack={
              handleMobileBack
            }
            isConnected={
              isConnected
            }
            isConnecting={
              isConnecting
            }
            connectionError={
              connectionError
            }
          />
        ) : (
          <NoConversationSelected
            isConnected={isConnected}
            isConnecting={isConnecting}
            connectionError={connectionError}
          />
        )}
      </div>
    </main>
  );
}