import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  ArrowLeft,
  Loader2,
  LockKeyhole,
  MessageCircle,
  RefreshCw,
  WifiOff,
} from "lucide-react";

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
 * PREMIUMCHAT — CHAT PAGE
 * ============================================================
 *
 * UI CLEANUP 1.10
 *
 * Features:
 * - Responsive desktop/mobile layout
 * - Conversation sidebar
 * - Active chat header
 * - Message history
 * - Message composer
 * - Socket.IO lifecycle management
 * - Connection status
 * - Loading/error states
 * - Session expiration handling
 *
 * Existing Zustand stores and chat APIs are preserved.
 */

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
  let label = "Live chat offline";

  let indicatorClass = "bg-zinc-500";

  if (isConnected) {
    label = "Live chat connected";
    indicatorClass = "bg-emerald-400";
  } else if (isConnecting) {
    label = "Connecting to live chat";
    indicatorClass = "animate-pulse bg-[#ffcc42]";
  } else if (connectionError) {
    label = "Live connection unavailable";
    indicatorClass = "bg-rose-400";
  }

  return (
    <div
      role="status"
      className="flex min-w-0 items-center gap-2 text-[10px] text-zinc-500 sm:text-[11px]"
    >
      <span
        aria-hidden="true"
        className={[
          "h-1.5 w-1.5 shrink-0 rounded-full",
          indicatorClass,
        ].join(" ")}
      />

      <span className="truncate">
        {label}
      </span>
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
    <div className="flex h-full min-h-0 flex-col bg-[#09090c]">
      {/* CONNECTION BAR */}

      <div className="flex min-h-10 shrink-0 items-center justify-end border-b border-white/5 bg-[#111115] px-5">
        <ConnectionStatus
          isConnected={isConnected}
          isConnecting={isConnecting}
          connectionError={connectionError}
        />
      </div>

      {/* EMPTY CONTENT */}

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-5 py-8 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-[#ffcc42]/20 bg-[#ffcc42]/10 text-[#ffcc42]">
          <MessageCircle
            size={30}
            strokeWidth={1.5}
          />
        </div>

        <h2 className="mt-5 text-xl font-bold tracking-tight text-white">
          Your Conversations
        </h2>

        <p className="mt-3 max-w-sm text-[13px] leading-6 text-zinc-400">
          Select a conversation from the sidebar
          to start messaging.
        </p>

        <p className="mt-1 max-w-sm text-[12px] leading-5 text-zinc-500">
          Your private conversations with creators
          and other users will appear here.
        </p>

        <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-[#ffcc42]/15 bg-[#ffcc42]/5 px-3 py-1.5 text-[11px] text-zinc-400">
          <LockKeyhole
            size={13}
            className="text-[#ffcc42]"
          />

          <span>Private Messaging</span>
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
  const conversationStatus =
    conversation?.status ?? "ACTIVE";

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#09090c]">
      {/* CHAT HEADER */}

      <ChatHeader
        conversation={conversation}
        onBack={onBack}
        showBackButton={true}
      />

      {/* CONNECTION STATUS */}

      <div className="flex min-h-8 shrink-0 items-center justify-end border-b border-white/5 bg-[#111115] px-3 sm:px-5">
        <ConnectionStatus
          isConnected={isConnected}
          isConnecting={isConnecting}
          connectionError={connectionError}
        />
      </div>

      {/* MESSAGE HISTORY */}

      <MessageList
        key={conversationId}
        conversationId={conversationId}
      />

      {/* MESSAGE COMPOSER */}

      <MessageComposer
        conversationId={conversationId}
        conversationStatus={conversationStatus}
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
   * ==========================================================
   * LOCAL UI STATE
   * ==========================================================
   */

  const [showMobileChat, setShowMobileChat] =
    useState(false);

  /**
   * ==========================================================
   * AUTH STATE
   * ==========================================================
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
   * ==========================================================
   * CHAT STATE
   * ==========================================================
   */

  const conversations = useChatStore(
    (state) => state.conversations
  );

  const activeConversationId = useChatStore(
    (state) => state.activeConversationId
  );

  const activeConversation = useChatStore(
    (state) => state.activeConversation
  );

  const isLoadingConversation = useChatStore(
    (state) => state.isLoadingConversation
  );

  const conversationError = useChatStore(
    (state) => state.conversationError
  );

  /**
   * ==========================================================
   * CHAT ACTIONS
   * ==========================================================
   */

  const initializeRealtime = useChatStore(
    (state) => state.initializeRealtime
  );

  const cleanupRealtime = useChatStore(
    (state) => state.cleanupRealtime
  );

  const selectConversation = useChatStore(
    (state) => state.selectConversation
  );

  /**
   * ==========================================================
   * SOCKET STATE
   * ==========================================================
   */

  const isConnected = useChatSocketStore(
    (state) => state.isConnected
  );

  const isConnecting = useChatSocketStore(
    (state) => state.isConnecting
  );

  const connectionError = useChatSocketStore(
    (state) => state.connectionError
  );

  const sessionExpired = useChatSocketStore(
    (state) => state.sessionExpired
  );

  /**
   * ==========================================================
   * SOCKET ACTIONS
   * ==========================================================
   */

  const connectSocket = useChatSocketStore(
    (state) => state.connect
  );

  const disconnectSocket = useChatSocketStore(
    (state) => state.disconnect
  );

  /**
   * ==========================================================
   * INITIALIZE REALTIME CHAT
   * ==========================================================
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
   * ==========================================================
   * MOBILE NAVIGATION
   * ==========================================================
   */

  const handleConversationSelect = useCallback(
    () => {
      setShowMobileChat(true);
    },
    []
  );

  const handleMobileBack = useCallback(
    () => {
      setShowMobileChat(false);
    },
    []
  );

  /**
   * ==========================================================
   * RESOLVE ACTIVE CONVERSATION
   * ==========================================================
   */

  const resolvedConversation =
    activeConversation &&
    getConversationId(activeConversation) ===
      activeConversationId
      ? activeConversation
      : conversations.find(
          (conversation) =>
            getConversationId(conversation) ===
            activeConversationId
        ) ?? null;

  /**
   * ==========================================================
   * RETRY CONVERSATION
   * ==========================================================
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
   * ==========================================================
   * RENDER
   * ==========================================================
   */

  return (
    <main
      className={[
        "flex",
        "h-[calc(100dvh-80px)]",
        "min-h-[400px]",
        "w-full overflow-hidden",
        "bg-[#09090c]",
        "text-white",
      ].join(" ")}
    >
      {/* ================================================= */}
      {/* CONVERSATION SIDEBAR                              */}
      {/* ================================================= */}

      <div
        className={[
          "h-full min-h-0",
          "w-full shrink-0",
          "border-r border-white/10",
          "md:w-[320px]",
          "lg:w-[360px]",

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

      {/* ================================================= */}
      {/* MAIN CHAT AREA                                   */}
      {/* ================================================= */}

      <div
        className={[
          "h-full min-h-0",
          "min-w-0 flex-1",
          "flex-col",

          showMobileChat
            ? "flex"
            : "hidden md:flex",
        ].join(" ")}
      >
        {/* =============================================== */}
        {/* SESSION EXPIRED                                 */}
        {/* =============================================== */}

        {sessionExpired ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-rose-500/20 bg-rose-500/10 text-rose-400">
              <WifiOff size={25} />
            </div>

            <h2 className="mt-4 text-lg font-semibold text-white">
              Session Expired
            </h2>

            <p className="mt-2 max-w-sm text-[13px] leading-6 text-zinc-400">
              Your chat session is no longer valid.
              Please sign in again to continue messaging.
            </p>

            <button
              type="button"
              onClick={handleMobileBack}
              className="mt-5 inline-flex items-center gap-2 text-[12px] text-[#ffcc42] md:hidden"
            >
              <ArrowLeft size={15} />
              Back to conversations
            </button>
          </div>
        ) : !activeConversationId ? (
          <NoConversationSelected
            isConnected={isConnected}
            isConnecting={isConnecting}
            connectionError={connectionError}
          />
        ) : isLoadingConversation &&
          !resolvedConversation ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-zinc-400">
            <Loader2
              size={23}
              className="animate-spin text-[#ffcc42]"
            />

            <p className="text-[12px]">
              Loading conversation...
            </p>
          </div>
        ) : conversationError &&
          !resolvedConversation ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-rose-500/20 bg-rose-500/10 text-rose-400">
              <WifiOff size={22} />
            </div>

            <p className="max-w-sm text-[13px] leading-6 text-rose-300">
              {conversationError}
            </p>

            <button
              type="button"
              onClick={handleRetryConversation}
              className="inline-flex items-center gap-2 rounded-lg bg-[#ffcc42] px-4 py-2 text-[12px] font-semibold text-black transition hover:brightness-110"
            >
              <RefreshCw size={14} />
              Try Again
            </button>

            <button
              type="button"
              onClick={handleMobileBack}
              className="inline-flex items-center gap-2 text-[12px] text-zinc-400 md:hidden"
            >
              <ArrowLeft size={14} />
              Back to conversations
            </button>
          </div>
        ) : resolvedConversation ? (
          <ActiveChatPanel
            conversation={resolvedConversation}
            conversationId={activeConversationId}
            onBack={handleMobileBack}
            isConnected={isConnected}
            isConnecting={isConnecting}
            connectionError={connectionError}
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