import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  AlertCircle,
  Clock3,
  Loader2,
  Send,
} from "lucide-react";

import { useChatStore } from "../../store/useChatStore.js";

import {
  normalizeChatId,
} from "./chat.utils.js";

/**
 * ============================================================
 * PREMIUMCHAT — MESSAGE COMPOSER
 * ============================================================
 *
 * UI CLEANUP 1.9
 *
 * Features:
 * - Compact black-and-gold interface
 * - Multiline text input
 * - Enter to send
 * - Shift + Enter for newline
 * - 5000-character limit
 * - Automatic textarea resizing
 * - Draft preservation per conversation
 * - Socket.IO / REST sending through Zustand
 * - Duplicate submission prevention
 * - Sending indicator
 * - Error handling
 * - Rate-limit countdown
 * - Blocked/archived conversation restrictions
 *
 * IMPORTANT:
 *
 * This component does not directly emit Socket.IO
 * events or make REST API requests.
 *
 * Message sending remains managed by useChatStore.
 */

const MAX_MESSAGE_LENGTH = 5000;

const MAX_TEXTAREA_HEIGHT = 140;

/**
 * ============================================================
 * FORMAT RETRY COUNTDOWN
 * ============================================================
 */

function formatRetryCountdown(milliseconds) {
  const seconds = Math.ceil(
    Math.max(0, milliseconds) / 1000
  );

  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);

  const remainingSeconds = seconds % 60;

  return `${minutes}m ${remainingSeconds}s`;
}

/**
 * ============================================================
 * MESSAGE COMPOSER
 * ============================================================
 */

export default function MessageComposer({
  conversationId,
  conversationStatus = "ACTIVE",
  className = "",
  onMessageSent,
}) {
  /**
   * ==========================================================
   * REFS
   * ==========================================================
   */

  const textareaRef = useRef(null);

  const sendingRef = useRef(false);

  /**
   * ==========================================================
   * LOCAL STATE
   * ==========================================================
   */

  const [drafts, setDrafts] = useState({});

  const [now, setNow] = useState(
    () => Date.now()
  );

  /**
   * ==========================================================
   * NORMALIZE CONVERSATION ID
   * ==========================================================
   */

  const normalizedConversationId =
    normalizeChatId(conversationId);

  /**
   * ==========================================================
   * CHAT STORE
   * ==========================================================
   */

  const sendMessage = useChatStore(
    (state) => state.sendMessage
  );

  const isSendingMessage = useChatStore(
    (state) => state.isSendingMessage
  );

  const sendError = useChatStore(
    (state) => state.sendError
  );

  const rateLimitedUntil = useChatStore(
    (state) => state.rateLimitedUntil
  );

  /**
   * ==========================================================
   * DRAFT PRESERVATION
   * ==========================================================
   */

  const draft = normalizedConversationId
    ? drafts[normalizedConversationId] ?? ""
    : "";

  const trimmedDraft = draft.trim();

  const characterCount = draft.length;

  const remainingCharacters =
    MAX_MESSAGE_LENGTH - characterCount;

  /**
   * ==========================================================
   * CONVERSATION STATUS
   * ==========================================================
   */

  const normalizedStatus =
    typeof conversationStatus === "string"
      ? conversationStatus.toUpperCase()
      : "ACTIVE";

  const isBlocked =
    normalizedStatus === "BLOCKED";

  const isArchived =
    normalizedStatus === "ARCHIVED";

  const isConversationUnavailable =
    !normalizedConversationId ||
    normalizedStatus !== "ACTIVE";

  /**
   * ==========================================================
   * RATE LIMIT
   * ==========================================================
   */

  const retryRemainingMs = rateLimitedUntil
    ? Math.max(0, rateLimitedUntil - now)
    : 0;

  const isRateLimited =
    retryRemainingMs > 0;

  /**
   * ==========================================================
   * CAN SEND
   * ==========================================================
   */

  const canSend =
    !isConversationUnavailable &&
    !isSendingMessage &&
    !sendingRef.current &&
    !isRateLimited &&
    trimmedDraft.length > 0 &&
    characterCount <= MAX_MESSAGE_LENGTH;

  /**
   * ==========================================================
   * UPDATE RATE-LIMIT COUNTDOWN
   * ==========================================================
   */

  useEffect(() => {
    if (
      !rateLimitedUntil ||
      rateLimitedUntil <= Date.now()
    ) {
      return;
    }

    setNow(Date.now());

    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [rateLimitedUntil]);

  /**
   * ==========================================================
   * AUTO-RESIZE TEXTAREA
   * ==========================================================
   */

  useEffect(() => {
    const textarea = textareaRef.current;

    if (!textarea) {
      return;
    }

    textarea.style.height = "auto";

    textarea.style.height = `${Math.min(
      textarea.scrollHeight,
      MAX_TEXTAREA_HEIGHT
    )}px`;
  }, [
    draft,
    normalizedConversationId,
  ]);

  /**
   * ==========================================================
   * HANDLE DRAFT CHANGE
   * ==========================================================
   */

  const handleDraftChange = (event) => {
    if (!normalizedConversationId) {
      return;
    }

    const value = event.target.value;

    if (value.length > MAX_MESSAGE_LENGTH) {
      return;
    }

    setDrafts((previous) => ({
      ...previous,
      [normalizedConversationId]: value,
    }));
  };

  /**
   * ==========================================================
   * HANDLE SEND
   * ==========================================================
   */

  const handleSend = async () => {
    const targetConversationId =
      normalizedConversationId;

    const messageContent = draft.trim();

    /**
     * Prevent duplicate submissions.
     */

    if (
      sendingRef.current ||
      isSendingMessage ||
      isConversationUnavailable ||
      isRateLimited ||
      !messageContent ||
      draft.length > MAX_MESSAGE_LENGTH
    ) {
      return;
    }

    sendingRef.current = true;

    try {
      /**
       * Send through existing Zustand store.
       */

      const message = await sendMessage({
        conversationId: targetConversationId,
        content: messageContent,
      });

      /**
       * Preserve draft when sending fails.
       */

      if (!message) {
        return;
      }

      /**
       * Clear only the successfully sent draft.
       *
       * If the user edited the draft while sending,
       * preserve their newer text.
       */

      setDrafts((previous) => {
        if (
          previous[targetConversationId] !==
          draft
        ) {
          return previous;
        }

        return {
          ...previous,
          [targetConversationId]: "",
        };
      });

      onMessageSent?.(message);
    } finally {
      sendingRef.current = false;
    }
  };

  /**
   * ==========================================================
   * HANDLE KEYBOARD
   * ==========================================================
   */

  const handleKeyDown = (event) => {
    /**
     * Shift + Enter inserts a newline.
     */

    if (
      event.key !== "Enter" ||
      event.shiftKey
    ) {
      return;
    }

    /**
     * Preserve IME composition support.
     */

    if (
      event.nativeEvent?.isComposing ||
      event.keyCode === 229
    ) {
      return;
    }

    event.preventDefault();

    if (canSend) {
      void handleSend();
    }
  };

  /**
   * ==========================================================
   * INPUT PLACEHOLDER
   * ==========================================================
   */

  let placeholder = "Write a message...";

  if (!normalizedConversationId) {
    placeholder = "Select a conversation";
  } else if (isBlocked) {
    placeholder = "Messaging is unavailable";
  } else if (isArchived) {
    placeholder = "This conversation is archived";
  } else if (isConversationUnavailable) {
    placeholder = "Messaging is currently unavailable";
  }

  /**
   * ==========================================================
   * RENDER
   * ==========================================================
   */

  return (
    <div
      className={[
        "shrink-0",
        "border-t border-white/10",
        "bg-[#111115]",
        "px-3 py-3",
        "sm:px-5 sm:py-4",
        className,
      ].join(" ")}
    >
      {/* ================================================= */}
      {/* SEND ERROR                                        */}
      {/* ================================================= */}

      {sendError && (
        <div
          role="alert"
          className={[
            "mb-3 flex items-start gap-2",
            "rounded-lg",
            "border border-rose-500/20",
            "bg-rose-500/10",
            "px-3 py-2.5",
            "text-[12px]",
            "leading-5",
            "text-rose-300",
          ].join(" ")}
        >
          <AlertCircle
            size={15}
            className="mt-0.5 shrink-0"
          />

          <span>{sendError}</span>
        </div>
      )}

      {/* ================================================= */}
      {/* RATE LIMIT WARNING                                */}
      {/* ================================================= */}

      {isRateLimited && (
        <div
          role="status"
          className={[
            "mb-3 flex items-start gap-2",
            "rounded-lg",
            "border border-[#ffcc42]/20",
            "bg-[#ffcc42]/5",
            "px-3 py-2.5",
            "text-[12px]",
            "leading-5",
            "text-[#ffcc42]",
          ].join(" ")}
        >
          <Clock3
            size={15}
            className="mt-0.5 shrink-0"
          />

          <span>
            You're sending messages too quickly.
            Try again in{" "}
            <strong>
              {formatRetryCountdown(
                retryRemainingMs
              )}
            </strong>
            .
          </span>
        </div>
      )}

      {/* ================================================= */}
      {/* COMPOSER CONTAINER                                */}
      {/* ================================================= */}

      <div
        className={[
          "rounded-xl",
          "border border-white/10",
          "bg-[#1a1a20]",
          "transition-colors",
          "focus-within:border-[#ffcc42]/40",
          "focus-within:ring-2",
          "focus-within:ring-[#ffcc42]/10",
        ].join(" ")}
      >
        {/* =============================================== */}
        {/* TEXTAREA                                        */}
        {/* =============================================== */}

        <textarea
          ref={textareaRef}
          value={draft}
          onChange={handleDraftChange}
          onKeyDown={handleKeyDown}
          disabled={isConversationUnavailable}
          maxLength={MAX_MESSAGE_LENGTH}
          rows={1}
          placeholder={placeholder}
          aria-label="Message"
          className={[
            "block w-full",
            "resize-none",
            "overflow-y-auto",
            "bg-transparent",
            "px-3.5 pb-1.5 pt-3",
            "text-[12px]",
            "leading-5",
            "text-white",
            "placeholder:text-zinc-500",
            "outline-none",
            "sm:text-[13px]",
            "disabled:cursor-not-allowed",
            "disabled:opacity-50",
          ].join(" ")}
        />

        {/* =============================================== */}
        {/* BOTTOM TOOLBAR                                  */}
        {/* =============================================== */}

        <div
          className={[
            "flex items-center",
            "justify-between",
            "gap-3",
            "px-3 pb-2.5",
          ].join(" ")}
        >
          {/* CHARACTER COUNTER / KEYBOARD HINT */}

          <div className="min-w-0">
            <p className="hidden text-[10px] text-zinc-500 sm:block">
              Enter to send · Shift+Enter for new line
            </p>

            <p
              className={[
                "text-[10px]",
                "sm:hidden",
                remainingCharacters < 100
                  ? "text-[#ffcc42]"
                  : "text-zinc-500",
              ].join(" ")}
            >
              {characterCount}/{MAX_MESSAGE_LENGTH}
            </p>
          </div>

          {/* ============================================= */}
          {/* SEND CONTROLS                                 */}
          {/* ============================================= */}

          <div className="flex shrink-0 items-center gap-3">
            {/* DESKTOP CHARACTER COUNTER */}

            <span
              className={[
                "hidden",
                "text-[10px]",
                "sm:inline",
                remainingCharacters < 100
                  ? "text-[#ffcc42]"
                  : "text-zinc-500",
              ].join(" ")}
            >
              {characterCount}/{MAX_MESSAGE_LENGTH}
            </span>

            {/* SEND BUTTON */}

            <button
              type="button"
              onClick={() => {
                void handleSend();
              }}
              disabled={!canSend}
              aria-label={
                isSendingMessage
                  ? "Sending message"
                  : "Send message"
              }
              title="Send message"
              className={[
                "inline-flex",
                "h-9 min-w-9",
                "items-center justify-center",
                "gap-2",
                "rounded-lg",
                "px-3",
                "text-[12px]",
                "font-bold",
                "transition-all duration-200",
                "focus-visible:outline-none",
                "focus-visible:ring-2",
                "focus-visible:ring-[#ffcc42]/50",

                canSend
                  ? [
                      "bg-[#ffcc42]",
                      "text-black",
                      "hover:brightness-110",
                    ].join(" ")
                  : [
                      "cursor-not-allowed",
                      "bg-white/10",
                      "text-zinc-500",
                    ].join(" "),
              ].join(" ")}
            >
              {isSendingMessage ? (
                <>
                  <Loader2
                    size={16}
                    className="animate-spin"
                  />

                  <span className="hidden sm:inline">
                    Sending
                  </span>
                </>
              ) : (
                <>
                  <span className="hidden sm:inline">
                    Send
                  </span>

                  <Send size={16} />
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ================================================= */}
      {/* CONVERSATION STATUS NOTICE                        */}
      {/* ================================================= */}

      {isBlocked && (
        <p className="mt-2 text-center text-[11px] text-rose-400">
          You cannot send messages in this conversation.
        </p>
      )}

      {isArchived && (
        <p className="mt-2 text-center text-[11px] text-amber-400">
          This conversation is archived.
        </p>
      )}
    </div>
  );
}