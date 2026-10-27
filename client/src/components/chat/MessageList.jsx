import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  ArrowDown,
  ChevronUp,
  Loader2,
  MessageCircle,
} from "lucide-react";

import { useChatStore } from "../../store/useChatStore.js";
import { useAuthStore } from "../../store/useAuthStore.js";

import MessageBubble from "./MessageBubble.jsx";

import { normalizeChatId } from "./chat.utils.js";

/**
 * ============================================================
 * PREMIUMCHAT — MESSAGE LIST
 * ============================================================
 *
 * UI CLEANUP 1.8
 *
 * Preserves:
 * - Chronological message sorting
 * - Date separators
 * - Sender/receiver alignment
 * - Existing MessageBubble component
 * - Cursor-based pagination
 * - Loading older messages
 * - Scroll-position restoration
 * - Smart auto-scroll
 * - Existing Zustand stores
 *
 * Improvements:
 * - Compact black-and-gold design
 * - Smaller message spacing
 * - Cleaner date separators
 * - Improved loading states
 * - Gold scroll-to-bottom button
 * - Better pagination scroll handling
 */

const BOTTOM_THRESHOLD_PX = 120;

/**
 * ============================================================
 * DATE HELPERS
 * ============================================================
 */

const getMessageDateKey = (value) => {
  if (!value) return "unknown";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "unknown";
  }

  return date.toDateString();
};

const formatDateSeparator = (value) => {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const now = new Date();

  if (date.toDateString() === now.toDateString()) {
    return "Today";
  }

  const yesterday = new Date(now);

  yesterday.setDate(yesterday.getDate() - 1);

  if (
    date.toDateString() ===
    yesterday.toDateString()
  ) {
    return "Yesterday";
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

/**
 * ============================================================
 * MESSAGE SKELETON
 * ============================================================
 */

function MessageSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading messages"
      className="space-y-4 animate-pulse"
    >
      <div className="flex justify-start">
        <div className="h-12 w-44 rounded-2xl rounded-bl-md bg-white/10" />
      </div>

      <div className="flex justify-end">
        <div className="h-14 w-52 rounded-2xl rounded-br-md bg-[#ffcc42]/10" />
      </div>

      <div className="flex justify-start">
        <div className="h-10 w-36 rounded-2xl rounded-bl-md bg-white/10" />
      </div>

      <div className="flex justify-end">
        <div className="h-12 w-40 rounded-2xl rounded-br-md bg-[#ffcc42]/10" />
      </div>
    </div>
  );
}

/**
 * ============================================================
 * EMPTY MESSAGE STATE
 * ============================================================
 */

function EmptyMessages() {
  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center px-5 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[#ffcc42]/20 bg-[#ffcc42]/10 text-[#ffcc42]">
        <MessageCircle
          size={25}
          strokeWidth={1.5}
        />
      </div>

      <h3 className="mt-4 text-[14px] font-semibold text-white">
        Start the Conversation
      </h3>

      <p className="mt-2 max-w-[260px] text-[12px] leading-5 text-zinc-400">
        Send your first message to begin this
        private conversation.
      </p>
    </div>
  );
}

/**
 * ============================================================
 * MESSAGE LIST
 * ============================================================
 */

export default function MessageList({
  conversationId,
  className = "",
}) {
  /**
   * ==========================================================
   * REFS
   * ==========================================================
   */

  const scrollContainerRef = useRef(null);
  const bottomRef = useRef(null);

  const shouldAutoScrollRef = useRef(true);

  const previousConversationIdRef = useRef(null);
  const previousMessageCountRef = useRef(0);

  const scrollRestoreRef = useRef(null);

  /**
   * Track the latest rendered message to distinguish
   * newly appended messages from older prepended ones.
   */

  const previousLastMessageIdRef = useRef(null);

  /**
   * ==========================================================
   * LOCAL STATE
   * ==========================================================
   */

  const [isNearBottom, setIsNearBottom] =
    useState(true);

  /**
   * ==========================================================
   * AUTHENTICATED USER
   * ==========================================================
   */

  const currentUser = useAuthStore(
    (state) => state.user
  );

  const currentUserId = normalizeChatId(
    currentUser?._id ?? currentUser?.id
  );

  /**
   * ==========================================================
   * CHAT STORE
   * ==========================================================
   */

  const messages = useChatStore(
    (state) =>
      state.messagesByConversation[conversationId] ?? []
  );

  const pagination = useChatStore(
    (state) =>
      state.messagePagination[conversationId] ?? null
  );

  const isLoadingMessages = useChatStore(
    (state) => state.isLoadingMessages
  );

  const messagesError = useChatStore(
    (state) => state.messagesError
  );

  const loadOlderMessages = useChatStore(
    (state) => state.loadOlderMessages
  );

  /**
   * ==========================================================
   * SORT MESSAGES
   * ==========================================================
   */

  const sortedMessages = useMemo(() => {
    return [...messages].sort(
      (a, b) =>
        new Date(a.createdAt).getTime() -
        new Date(b.createdAt).getTime()
    );
  }, [messages]);

  /**
   * ==========================================================
   * MESSAGE METADATA
   * ==========================================================
   */

  const messageCount = sortedMessages.length;

  const lastMessage =
    messageCount > 0
      ? sortedMessages[messageCount - 1]
      : null;

  const lastMessageId =
    lastMessage?._id ??
    lastMessage?.id ??
    lastMessage?.clientMessageId ??
    null;

  /**
   * ==========================================================
   * TRACK CONVERSATION CHANGES
   * ==========================================================
   */

  useEffect(() => {
    if (
      previousConversationIdRef.current ===
      conversationId
    ) {
      return;
    }

    previousConversationIdRef.current =
      conversationId;

    previousMessageCountRef.current = 0;
    previousLastMessageIdRef.current = null;

    shouldAutoScrollRef.current = true;
    scrollRestoreRef.current = null;

    setIsNearBottom(true);
  }, [conversationId]);

  /**
   * ==========================================================
   * HANDLE SCROLL
   * ==========================================================
   */

  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;

    if (!container) return;

    const distanceFromBottom =
      container.scrollHeight -
      container.scrollTop -
      container.clientHeight;

    const nearBottom =
      distanceFromBottom <= BOTTOM_THRESHOLD_PX;

    shouldAutoScrollRef.current = nearBottom;

    setIsNearBottom(nearBottom);
  }, []);

  /**
   * ==========================================================
   * SCROLL TO LATEST
   * ==========================================================
   */

  const scrollToLatest = useCallback(
    (behavior = "smooth") => {
      const container = scrollContainerRef.current;

      if (!container) return;

      container.scrollTo({
        top: container.scrollHeight,
        behavior,
      });

      shouldAutoScrollRef.current = true;
      setIsNearBottom(true);
    },
    []
  );

  /**
   * ==========================================================
   * LOAD OLDER MESSAGES
   * ==========================================================
   */

  const handleLoadOlder = async () => {
    const container = scrollContainerRef.current;

    if (
      !container ||
      !pagination?.hasMore ||
      !pagination?.nextCursor ||
      isLoadingMessages
    ) {
      return;
    }

    /**
     * Record the viewport before older messages
     * are prepended.
     */

    scrollRestoreRef.current = {
      conversationId,
      height: container.scrollHeight,
      top: container.scrollTop,
    };

    shouldAutoScrollRef.current = false;

    try {
      await loadOlderMessages(conversationId);
    } catch {
      /**
       * The store manages the error state.
       * Preserve the current viewport.
       */
    } finally {
      /**
       * If pagination did not change the messages,
       * clear the pending restoration.
       */
      const currentContainer =
        scrollContainerRef.current;

      const pending = scrollRestoreRef.current;

      if (
        pending &&
        pending.conversationId === conversationId &&
        currentContainer &&
        currentContainer.scrollHeight === pending.height
      ) {
        scrollRestoreRef.current = null;
      }
    }
  };

  /**
   * ==========================================================
   * RESTORE SCROLL AFTER PAGINATION
   * ==========================================================
   */

  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    const restore = scrollRestoreRef.current;

    if (!container || !restore) return;

    if (restore.conversationId !== conversationId) {
      scrollRestoreRef.current = null;
      return;
    }

    const heightDifference =
      container.scrollHeight - restore.height;

    if (heightDifference > 0) {
      container.scrollTop =
        restore.top + heightDifference;

      scrollRestoreRef.current = null;
    }
  }, [conversationId, sortedMessages]);

  /**
   * ==========================================================
   * AUTO-SCROLL
   * ==========================================================
   *
   * Initial load:
   *   Scroll to latest.
   *
   * New message at bottom:
   *   Scroll to latest.
   *
   * Loading older messages:
   *   Preserve viewport.
   *
   * User reading older messages:
   *   Do not force scrolling.
   */

  useLayoutEffect(() => {
    const previousCount =
      previousMessageCountRef.current;

    const previousLastMessageId =
      previousLastMessageIdRef.current;

    const isInitialLoad =
      previousCount === 0 && messageCount > 0;

    const hasNewMessages =
      messageCount > previousCount;

    const lastMessageChanged =
      lastMessageId !== previousLastMessageId;

    const isAppendingNewMessages =
      hasNewMessages && lastMessageChanged;

    const isRestoringOlderMessages =
      scrollRestoreRef.current !== null;

    if (
      !isRestoringOlderMessages &&
      (
        isInitialLoad ||
        (
          isAppendingNewMessages &&
          shouldAutoScrollRef.current
        )
      )
    ) {
      scrollToLatest(
        isInitialLoad ? "auto" : "smooth"
      );
    }

    previousMessageCountRef.current =
      messageCount;

    previousLastMessageIdRef.current =
      lastMessageId;
  }, [
    conversationId,
    messageCount,
    lastMessageId,
    scrollToLatest,
  ]);

  /**
   * ==========================================================
   * RENDER
   * ==========================================================
   */

  return (
    <section
      aria-label="Message history"
      className={[
        "relative flex min-h-0",
        "flex-1 flex-col",
        "bg-[#09090c]",
        className,
      ].join(" ")}
    >
      {/* ================================================= */}
      {/* SCROLLABLE MESSAGE AREA                           */}
      {/* ================================================= */}

      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className={[
          "min-h-0 flex-1",
          "overflow-y-auto",
          "overscroll-contain",
          "px-3 py-4",
          "sm:px-5 sm:py-5",
          "[scrollbar-width:thin]",
          "[scrollbar-color:#33333b_transparent]",
        ].join(" ")}
      >
        {/* =============================================== */}
        {/* LOAD OLDER MESSAGES                             */}
        {/* =============================================== */}

        {pagination?.hasMore && (
          <div className="mb-5 flex justify-center">
            <button
              type="button"
              onClick={handleLoadOlder}
              disabled={isLoadingMessages}
              className={[
                "inline-flex min-h-8",
                "items-center gap-2",
                "rounded-full",
                "border border-white/10",
                "bg-[#17171c]",
                "px-3 py-1.5",
                "text-[11px] font-medium",
                "text-zinc-400",
                "transition",
                "hover:border-[#ffcc42]/25",
                "hover:text-[#ffcc42]",
                "disabled:cursor-not-allowed",
                "disabled:opacity-50",
              ].join(" ")}
            >
              {isLoadingMessages ? (
                <Loader2
                  size={13}
                  className="animate-spin"
                />
              ) : (
                <ChevronUp size={13} />
              )}

              {isLoadingMessages
                ? "Loading messages..."
                : "Load older messages"}
            </button>
          </div>
        )}

        {/* =============================================== */}
        {/* INITIAL LOADING                                 */}
        {/* =============================================== */}

        {isLoadingMessages &&
          messageCount === 0 && (
            <MessageSkeleton />
          )}

        {/* =============================================== */}
        {/* ERROR                                           */}
        {/* =============================================== */}

        {messagesError && (
          <div
            role="alert"
            className={[
              "mb-4 rounded-xl",
              "border border-rose-500/20",
              "bg-rose-500/10",
              "px-3 py-2.5",
              "text-[12px]",
              "leading-5",
              "text-rose-200",
            ].join(" ")}
          >
            {messagesError}
          </div>
        )}

        {/* =============================================== */}
        {/* EMPTY STATE                                     */}
        {/* =============================================== */}

        {!isLoadingMessages &&
          !messagesError &&
          messageCount === 0 && (
            <EmptyMessages />
          )}

        {/* =============================================== */}
        {/* MESSAGES                                        */}
        {/* =============================================== */}

        {messageCount > 0 && (
          <div className="space-y-2">
            {sortedMessages.map((message, index) => {
              const previousMessage =
                sortedMessages[index - 1];

              const currentDate =
                getMessageDateKey(
                  message.createdAt
                );

              const previousDate =
                previousMessage
                  ? getMessageDateKey(
                      previousMessage.createdAt
                    )
                  : null;

              const showDateSeparator =
                currentDate !== previousDate;

              const senderId =
                normalizeChatId(
                  message.senderId
                );

              const isOwnMessage =
                Boolean(
                  senderId &&
                  currentUserId &&
                  senderId === currentUserId
                );

              const messageKey =
                message._id ??
                message.id ??
                message.clientMessageId ??
                index;

              return (
                <div key={messageKey}>
                  {/* DATE SEPARATOR */}

                  {showDateSeparator && (
                    <div className="my-5 flex items-center justify-center">
                      <span
                        className={[
                          "rounded-full",
                          "border border-white/10",
                          "bg-[#17171c]",
                          "px-3 py-1",
                          "text-[10px]",
                          "font-medium",
                          "text-zinc-400",
                        ].join(" ")}
                      >
                        {formatDateSeparator(
                          message.createdAt
                        )}
                      </span>
                    </div>
                  )}

                  {/* MESSAGE BUBBLE */}

                  <MessageBubble
                    message={message}
                    isOwnMessage={isOwnMessage}
                  />
                </div>
              );
            })}
          </div>
        )}

        {/* SCROLL ANCHOR */}

        <div ref={bottomRef} />
      </div>

      {/* ================================================= */}
      {/* SCROLL TO LATEST BUTTON                           */}
      {/* ================================================= */}

      {!isNearBottom && messageCount > 0 && (
        <button
          type="button"
          onClick={() => scrollToLatest("smooth")}
          aria-label="Scroll to latest messages"
          title="Scroll to latest messages"
          className={[
            "absolute bottom-4 right-4",
            "flex h-9 w-9",
            "items-center justify-center",
            "rounded-full",
            "border border-[#ffcc42]/30",
            "bg-[#ffcc42]",
            "text-black",
            "shadow-lg",
            "shadow-black/30",
            "transition-transform",
            "hover:scale-105",
            "focus-visible:outline-none",
            "focus-visible:ring-2",
            "focus-visible:ring-[#ffcc42]/50",
            "sm:bottom-5 sm:right-5",
          ].join(" ")}
        >
          <ArrowDown size={17} />
        </button>
      )}
    </section>
  );
}