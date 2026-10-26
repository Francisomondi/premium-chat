import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useChatStore } from "../../store/useChatStore.js";

import { useAuthStore } from "../../store/useAuthStore.js";

import MessageBubble from "./MessageBubble.jsx";

import { normalizeChatId } from "./chat.utils.js";

/**
 * ============================================================
 * PREMIUMCHAT — MESSAGE LIST
 * ============================================================
 *
 * Features:
 *
 * - Chronological messages
 * - Date separators
 * - Sender/receiver alignment
 * - Loading older messages
 * - Smart auto-scroll
 * - Empty states
 *
 * Messages are provided by useChatStore.
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

  if (
    date.toDateString() ===
    now.toDateString()
  ) {
    return "Today";
  }

  const yesterday = new Date(now);

  yesterday.setDate(
    yesterday.getDate() - 1
  );

  if (
    date.toDateString() ===
    yesterday.toDateString()
  ) {
    return "Yesterday";
  }

  return date.toLocaleDateString(undefined, {
    month: "long",
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
    <div className="space-y-5 animate-pulse">
      <div className="flex justify-start">
        <div
          className={[
            "h-14 w-48",
            "rounded-2xl bg-white/10",
          ].join(" ")}
        />
      </div>

      <div className="flex justify-end">
        <div
          className={[
            "h-16 w-56",
            "rounded-2xl bg-violet-500/10",
          ].join(" ")}
        />
      </div>

      <div className="flex justify-start">
        <div
          className={[
            "h-12 w-36",
            "rounded-2xl bg-white/10",
          ].join(" ")}
        />
      </div>
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
   * REFERENCES
   */

  const scrollContainerRef = useRef(null);

  const bottomRef = useRef(null);

  const shouldAutoScrollRef = useRef(true);

  const previousConversationIdRef =
    useRef(null);

  const previousMessageCountRef =
    useRef(0);

  const scrollRestoreRef = useRef(null);

  /**
   * LOCAL STATE
   */

  const [isNearBottom, setIsNearBottom] =
    useState(true);

  /**
   * AUTHENTICATED USER
   */

  const currentUser = useAuthStore(
    (state) => state.user
  );

  const currentUserId =
    normalizeChatId(
      currentUser?._id ??
        currentUser?.id
    );

  /**
   * ZUSTAND CHAT STATE
   */

  const messages = useChatStore(
    (state) =>
      state.messagesByConversation[
        conversationId
      ] ?? []
  );

  const pagination = useChatStore(
    (state) =>
      state.messagePagination[
        conversationId
      ] ?? null
  );

  const isLoadingMessages =
    useChatStore(
      (state) =>
        state.isLoadingMessages
    );

  const messagesError =
    useChatStore(
      (state) =>
        state.messagesError
    );

  const loadOlderMessages =
    useChatStore(
      (state) =>
        state.loadOlderMessages
    );

  /**
   * ========================================================
   * SORT MESSAGES
   * ========================================================
   */

  const sortedMessages = useMemo(() => {
    return [...messages].sort(
      (a, b) =>
        new Date(a.createdAt).getTime() -
        new Date(b.createdAt).getTime()
    );
  }, [messages]);

  /**
   * ========================================================
   * TRACK CONVERSATION CHANGES
   * ========================================================
   */

  useEffect(() => {
    if (
      previousConversationIdRef.current !==
      conversationId
    ) {
      previousConversationIdRef.current =
        conversationId;

      previousMessageCountRef.current = 0;

      shouldAutoScrollRef.current = true;

      scrollRestoreRef.current = null;

      setIsNearBottom(true);
    }
  }, [conversationId]);

  /**
   * ========================================================
   * HANDLE SCROLL
   * ========================================================
   */

  const handleScroll = useCallback(() => {
    const container =
      scrollContainerRef.current;

    if (!container) return;

    const distanceFromBottom =
      container.scrollHeight -
      container.scrollTop -
      container.clientHeight;

    const nearBottom =
      distanceFromBottom <=
      BOTTOM_THRESHOLD_PX;

    shouldAutoScrollRef.current =
      nearBottom;

    setIsNearBottom(nearBottom);
  }, []);

  /**
   * ========================================================
   * LOAD OLDER MESSAGES
   * ========================================================
   */

  const handleLoadOlder = async () => {
    const container =
      scrollContainerRef.current;

    if (
      !container ||
      !pagination?.hasMore ||
      !pagination?.nextCursor ||
      isLoadingMessages
    ) {
      return;
    }

    /**
     * Remember scroll dimensions so
     * older messages can be prepended
     * without jumping the viewport.
     */

    scrollRestoreRef.current = {
      height: container.scrollHeight,
      top: container.scrollTop,
    };

    shouldAutoScrollRef.current = false;

    await loadOlderMessages(
      conversationId
    );
  };

  /**
   * ========================================================
   * RESTORE SCROLL AFTER PAGINATION
   * ========================================================
   */

  useLayoutEffect(() => {
    const container =
      scrollContainerRef.current;

    const restore =
      scrollRestoreRef.current;

    if (!container || !restore) {
      return;
    }

    const heightDifference =
      container.scrollHeight -
      restore.height;

    container.scrollTop =
      restore.top +
      heightDifference;

    scrollRestoreRef.current = null;
  }, [sortedMessages]);

  /**
   * ========================================================
   * AUTO-SCROLL
   * ========================================================
   */

  useLayoutEffect(() => {
    const messageCount =
      sortedMessages.length;

    const conversationChanged =
      previousMessageCountRef.current === 0;

    const hasNewMessages =
      messageCount >
      previousMessageCountRef.current;

    if (
      conversationChanged ||
      (hasNewMessages &&
        shouldAutoScrollRef.current)
    ) {
      bottomRef.current?.scrollIntoView({
        behavior: conversationChanged
          ? "auto"
          : "smooth",

        block: "end",
      });
    }

    previousMessageCountRef.current =
      messageCount;
  }, [sortedMessages]);

  /**
   * ========================================================
   * RENDER
   * ========================================================
   */

  return (
    <section
      aria-label="Message history"
      className={[
        "relative flex min-h-0",
        "flex-1 flex-col",
        "bg-[#0b0b14]",
        className,
      ].join(" ")}
    >
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className={[
          "min-h-0 flex-1",
          "overflow-y-auto",
          "px-4 py-6",
          "sm:px-6",
        ].join(" ")}
      >
        {/* LOAD OLDER */}

        {pagination?.hasMore && (
          <div className="mb-6 flex justify-center">
            <button
              type="button"
              onClick={handleLoadOlder}
              disabled={isLoadingMessages}
              className={[
                "rounded-full",
                "border border-white/10",
                "bg-white/5",
                "px-4 py-2",
                "text-xs font-medium",
                "text-slate-300",
                "transition-colors",
                "hover:bg-white/10",
                "disabled:opacity-50",
              ].join(" ")}
            >
              {isLoadingMessages
                ? "Loading..."
                : "Load older messages"}
            </button>
          </div>
        )}

        {/* INITIAL LOADING */}

        {isLoadingMessages &&
          sortedMessages.length === 0 && (
            <MessageSkeleton />
          )}

        {/* ERROR */}

        {messagesError && (
          <div
            role="alert"
            className={[
              "mb-5 rounded-xl",
              "border border-rose-500/20",
              "bg-rose-500/10",
              "px-4 py-3",
              "text-sm text-rose-200",
            ].join(" ")}
          >
            {messagesError}
          </div>
        )}

        {/* EMPTY STATE */}

        {!isLoadingMessages &&
          !messagesError &&
          sortedMessages.length === 0 && (
            <div
              className={[
                "flex min-h-[320px]",
                "flex-col items-center",
                "justify-center",
                "text-center",
              ].join(" ")}
            >
              <div
                className={[
                  "flex h-16 w-16",
                  "items-center",
                  "justify-center",
                  "rounded-3xl",
                  "bg-violet-500/10",
                  "text-3xl",
                ].join(" ")}
              >
                💬
              </div>

              <h3
                className={[
                  "mt-5 text-base",
                  "font-semibold text-white",
                ].join(" ")}
              >
                Start the conversation
              </h3>

              <p
                className={[
                  "mt-2 max-w-xs",
                  "text-sm leading-6",
                  "text-slate-400",
                ].join(" ")}
              >
                Your private messages will
                appear here once the
                conversation begins.
              </p>
            </div>
          )}

        {/* MESSAGES */}

        {sortedMessages.length > 0 && (
          <div className="space-y-4">
            {sortedMessages.map(
              (message, index) => {
                const previousMessage =
                  sortedMessages[
                    index - 1
                  ];

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
                  currentDate !==
                  previousDate;

                const senderId =
                  normalizeChatId(
                    message.senderId
                  );

                const isOwnMessage =
                  Boolean(
                    senderId &&
                      currentUserId &&
                      senderId ===
                        currentUserId
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
                      <div
                        className={[
                          "my-6 flex",
                          "items-center",
                          "justify-center",
                        ].join(" ")}
                      >
                        <span
                          className={[
                            "rounded-full",
                            "border border-white/10",
                            "bg-white/5",
                            "px-4 py-1.5",
                            "text-[11px]",
                            "font-medium",
                            "text-slate-400",
                          ].join(" ")}
                        >
                          {formatDateSeparator(
                            message.createdAt
                          )}
                        </span>
                      </div>
                    )}

                    <MessageBubble
                      message={message}
                      isOwnMessage={
                        isOwnMessage
                      }
                    />
                  </div>
                );
              }
            )}
          </div>
        )}

        {/* SCROLL ANCHOR */}

        <div ref={bottomRef} />
      </div>

      {/* NEW MESSAGE SCROLL BUTTON */}

      {!isNearBottom &&
        sortedMessages.length > 0 && (
          <button
            type="button"
            onClick={() => {
              bottomRef.current?.scrollIntoView({
                behavior: "smooth",
              });
            }}
            aria-label="Scroll to latest messages"
            className={[
              "absolute bottom-5 right-5",
              "flex h-11 w-11",
              "items-center justify-center",
              "rounded-full",
              "border border-violet-500/30",
              "bg-violet-600",
              "text-white",
              "shadow-lg",
              "transition-transform",
              "hover:scale-105",
            ].join(" ")}
          >
            ↓
          </button>
        )}
    </section>
  );
}