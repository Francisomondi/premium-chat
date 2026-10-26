import {
  useEffect,
  useRef,
  useState,
} from "react";

import { useChatStore } from "../../store/useChatStore.js";

import {
  normalizeChatId,
} from "./chat.utils.js";

/**
 * ============================================================
 * PREMIUMCHAT — MESSAGE COMPOSER
 * ============================================================
 *
 * Features:
 *
 * - Multiline text input
 * - Enter to send
 * - Shift + Enter for newline
 * - 5000-character limit
 * - Socket.IO / REST sending through Zustand
 * - Sending indicator
 * - Error handling
 * - Rate-limit countdown
 * - Disabled state for blocked/archived chats
 * - Draft preservation
 * - Responsive dark theme
 *
 * IMPORTANT:
 *
 * This component does not directly emit Socket.IO
 * events or make REST API requests.
 *
 * All message sending is handled by useChatStore.
 */

const MAX_MESSAGE_LENGTH = 5000;

const MAX_TEXTAREA_HEIGHT = 160;

/**
 * ============================================================
 * SEND ICON
 * ============================================================
 */

function SendIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-5 w-5"
    >
      <path d="m22 2-7 20-4-9-9-4Z" />

      <path d="M22 2 11 13" />
    </svg>
  );
}

/**
 * ============================================================
 * SPINNER
 * ============================================================
 */

function SendingSpinner() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="h-5 w-5 animate-spin"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="3"
        strokeOpacity="0.25"
      />

      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

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
   * ========================================================
   * REFS
   * ========================================================
   */

  const textareaRef = useRef(null);

  const sendingRef = useRef(false);

  /**
   * ========================================================
   * LOCAL STATE
   * ========================================================
   */

  const [drafts, setDrafts] = useState({});

  const [now, setNow] = useState(
    () => Date.now()
  );

  /**
   * ========================================================
   * NORMALIZE CONVERSATION ID
   * ========================================================
   */

  const normalizedConversationId =
    normalizeChatId(conversationId);

  /**
   * ========================================================
   * ZUSTAND CHAT STATE
   * ========================================================
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
   * ========================================================
   * CURRENT DRAFT
   * ========================================================
   *
   * Store drafts by conversation ID.
   *
   * Switching between conversations will not
   * overwrite the text belonging to another chat.
   */

  const draft = normalizedConversationId
    ? drafts[normalizedConversationId] ?? ""
    : "";

  const trimmedDraft = draft.trim();

  const characterCount = draft.length;

  const remainingCharacters =
    MAX_MESSAGE_LENGTH - characterCount;

  /**
   * ========================================================
   * CONVERSATION STATUS
   * ========================================================
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
    isBlocked ||
    isArchived ||
    normalizedStatus !== "ACTIVE";

  /**
   * ========================================================
   * RATE LIMIT STATE
   * ========================================================
   */

  const retryRemainingMs =
    rateLimitedUntil
      ? Math.max(
          0,
          rateLimitedUntil - now
        )
      : 0;

  const isRateLimited =
    retryRemainingMs > 0;

  /**
   * ========================================================
   * CAN SEND MESSAGE
   * ========================================================
   */

  const canSend =
    !isConversationUnavailable &&
    !isSendingMessage &&
    !sendingRef.current &&
    !isRateLimited &&
    trimmedDraft.length > 0 &&
    characterCount <= MAX_MESSAGE_LENGTH;

  /**
   * ========================================================
   * UPDATE RATE LIMIT COUNTDOWN
   * ========================================================
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
   * ========================================================
   * AUTO-RESIZE TEXTAREA
   * ========================================================
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
  }, [draft, normalizedConversationId]);

  /**
   * ========================================================
   * HANDLE DRAFT CHANGE
   * ========================================================
   */

  const handleDraftChange = (event) => {
    if (!normalizedConversationId) {
      return;
    }

    const value = event.target.value;

    /**
     * The textarea maxLength attribute also
     * enforces the character limit.
     */

    if (value.length > MAX_MESSAGE_LENGTH) {
      return;
    }

    setDrafts((previous) => ({
      ...previous,

      [normalizedConversationId]: value,
    }));
  };

  /**
   * ========================================================
   * HANDLE SEND
   * ========================================================
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
       * Send through the existing Zustand store.
       *
       * The store chooses Socket.IO or REST.
       */

      const message = await sendMessage({
        conversationId: targetConversationId,

        content: messageContent,
      });

      if (!message) {
        /**
         * Keep the draft if sending fails.
         *
         * Do not automatically retry.
         */

        return;
      }

      /**
       * Clear the submitted draft only if
       * it has not been edited while sending.
       *
       * Also clear only the conversation
       * that actually sent the message.
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
   * ========================================================
   * HANDLE KEYBOARD
   * ========================================================
   */

  const handleKeyDown = (event) => {
    /**
     * Allow Shift + Enter to insert a newline.
     */

    if (
      event.key !== "Enter" ||
      event.shiftKey
    ) {
      return;
    }

    /**
     * Do not intercept IME composition.
     *
     * This supports users entering text
     * through composition-based keyboards.
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
   * ========================================================
   * INPUT PLACEHOLDER
   * ========================================================
   */

  let placeholder =
    "Type your message...";

  if (!normalizedConversationId) {
    placeholder =
      "Select a conversation to start messaging";
  } else if (isBlocked) {
    placeholder =
      "Messaging is unavailable for this conversation";
  } else if (isArchived) {
    placeholder =
      "This conversation is archived";
  } else if (isConversationUnavailable) {
    placeholder =
      "Messaging is currently unavailable";
  }

  /**
   * ========================================================
   * RENDER
   * ========================================================
   */

  return (
    <div
      className={[
        "shrink-0",
        "border-t border-white/10",
        "bg-[#11111d]",
        "px-4 py-4",
        "sm:px-6",
        className,
      ].join(" ")}
    >
      {/* ERROR MESSAGE */}

      {sendError && (
        <div
          role="alert"
          className={[
            "mb-3 rounded-xl",
            "border border-rose-500/20",
            "bg-rose-500/10",
            "px-4 py-3",
            "text-xs leading-5",
            "text-rose-200",
          ].join(" ")}
        >
          {sendError}
        </div>
      )}

      {/* RATE LIMIT MESSAGE */}

      {isRateLimited && (
        <div
          role="status"
          className={[
            "mb-3 rounded-xl",
            "border border-amber-500/20",
            "bg-amber-500/10",
            "px-4 py-3",
            "text-xs leading-5",
            "text-amber-200",
          ].join(" ")}
        >
          You're sending messages too quickly.
          Please wait{" "}
          <strong>
            {formatRetryCountdown(
              retryRemainingMs
            )}
          </strong>{" "}
          before sending another message.
        </div>
      )}

      {/* COMPOSER */}

      <div
        className={[
          "rounded-2xl",
          "border border-white/10",
          "bg-white/5",
          "transition-colors",
          "focus-within:border-violet-500/40",
          "focus-within:ring-2",
          "focus-within:ring-violet-500/10",
        ].join(" ")}
      >
        {/* TEXTAREA */}

        <textarea
          ref={textareaRef}
          value={draft}
          onChange={handleDraftChange}
          onKeyDown={handleKeyDown}
          disabled={isConversationUnavailable}
          maxLength={MAX_MESSAGE_LENGTH}
          rows={2}
          placeholder={placeholder}
          aria-label="Message"
          className={[
            "block w-full resize-none",
            "bg-transparent",
            "px-4 pb-2 pt-4",
            "text-sm leading-6",
            "text-white",
            "placeholder:text-slate-500",
            "outline-none",
            "disabled:cursor-not-allowed",
            "disabled:opacity-50",
          ].join(" ")}
        />

        {/* BOTTOM TOOLBAR */}

        <div
          className={[
            "flex items-center",
            "justify-between gap-3",
            "px-3 pb-3",
          ].join(" ")}
        >
          {/* KEYBOARD HINT */}

          <div className="min-w-0">
            <p
              className={[
                "hidden text-[11px]",
                "text-slate-500",
                "sm:block",
              ].join(" ")}
            >
              Enter to send · Shift+Enter for new line
            </p>

            <p
              className={[
                "text-[11px]",
                "sm:hidden",
                remainingCharacters < 100
                  ? "text-amber-400"
                  : "text-slate-500",
              ].join(" ")}
            >
              {characterCount} / {MAX_MESSAGE_LENGTH}
            </p>
          </div>

          {/* SEND BUTTON */}

          <div className="flex items-center gap-3">
            {/* DESKTOP CHARACTER COUNTER */}

            <span
              className={[
                "hidden text-[11px]",
                "sm:inline",
                remainingCharacters < 100
                  ? "text-amber-400"
                  : "text-slate-500",
              ].join(" ")}
            >
              {characterCount} / {MAX_MESSAGE_LENGTH}
            </span>

            <button
              type="button"
              onClick={handleSend}
              disabled={!canSend}
              aria-label={
                isSendingMessage
                  ? "Sending message"
                  : "Send message"
              }
              className={[
                "flex h-10",
                "items-center justify-center",
                "gap-2 rounded-xl",
                "px-4",
                "text-sm font-semibold",
                "text-white",
                "transition-all duration-200",

                canSend
                  ? [
                      "bg-gradient-to-r",
                      "from-violet-600",
                      "to-fuchsia-600",
                      "shadow-lg",
                      "shadow-violet-900/20",
                      "hover:from-violet-500",
                      "hover:to-fuchsia-500",
                    ].join(" ")
                  : [
                      "cursor-not-allowed",
                      "bg-white/10",
                      "text-slate-500",
                    ].join(" "),
              ].join(" ")}
            >
              {isSendingMessage ? (
                <>
                  <SendingSpinner />

                  <span className="hidden sm:inline">
                    Sending
                  </span>
                </>
              ) : (
                <>
                  <span className="hidden sm:inline">
                    Send
                  </span>

                  <SendIcon />
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* CONVERSATION STATUS NOTICE */}

      {isBlocked && (
        <p
          className={[
            "mt-3 text-center",
            "text-xs text-rose-400",
          ].join(" ")}
        >
          You cannot send messages in this conversation.
        </p>
      )}

      {isArchived && (
        <p
          className={[
            "mt-3 text-center",
            "text-xs text-amber-400",
          ].join(" ")}
        >
          This conversation is archived.
        </p>
      )}
    </div>
  );
}