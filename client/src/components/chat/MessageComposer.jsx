
import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  AlertCircle,
  Clock3,
  Loader2,
  Paperclip,
  Send,
} from "lucide-react";

import { useChatStore } from "../../store/useChatStore.js";
import { useAuthStore } from "../../store/useAuthStore.js";

import ChatImageComposer from "./ChatImageComposer.jsx";

import {
  normalizeChatId,
} from "./chat.utils.js";

const MAX_MESSAGE_LENGTH = 5000;
const MAX_TEXTAREA_HEIGHT = 100;

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

export default function MessageComposer({
  conversationId,
  conversationStatus = "ACTIVE",
  className = "",
  onMessageSent,
}) {
  const textareaRef = useRef(null);
  const sendingRef = useRef(false);

  const [drafts, setDrafts] = useState({});
  const [now, setNow] = useState(() => Date.now());

  const [
    showPaidMediaComposer,
    setShowPaidMediaComposer,
  ] = useState(false);

  const userRole = useAuthStore(
    (state) => state.user?.role
  );

  const isCreator = userRole === "CREATOR";

  const normalizedConversationId =
    normalizeChatId(conversationId);

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

  const draft = normalizedConversationId
    ? drafts[normalizedConversationId] ?? ""
    : "";

  const trimmedDraft = draft.trim();

  const characterCount = draft.length;

  const remainingCharacters =
    MAX_MESSAGE_LENGTH - characterCount;

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

  const retryRemainingMs = rateLimitedUntil
    ? Math.max(0, rateLimitedUntil - now)
    : 0;

  const isRateLimited =
    retryRemainingMs > 0;

  const canSend =
    !isConversationUnavailable &&
    !isSendingMessage &&
    !sendingRef.current &&
    !isRateLimited &&
    trimmedDraft.length > 0 &&
    characterCount <= MAX_MESSAGE_LENGTH;

  /**
   * RATE LIMIT COUNTDOWN
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

    return () => window.clearInterval(interval);
  }, [rateLimitedUntil]);

  /**
   * TEXTAREA AUTO RESIZE
   *
   * Recalculate when returning from image mode,
   * because the textarea is temporarily unmounted.
   */

  useEffect(() => {
    if (showPaidMediaComposer) return;

    const textarea = textareaRef.current;

    if (!textarea) return;

    textarea.style.height = "auto";

    textarea.style.height = `${Math.min(
      textarea.scrollHeight,
      MAX_TEXTAREA_HEIGHT
    )}px`;
  }, [
    draft,
    normalizedConversationId,
    showPaidMediaComposer,
  ]);

  /**
   * DRAFT CHANGE
   */

  const handleDraftChange = (event) => {
    if (!normalizedConversationId) return;

    const value = event.target.value;

    if (value.length > MAX_MESSAGE_LENGTH) return;

    setDrafts((previous) => ({
      ...previous,
      [normalizedConversationId]: value,
    }));
  };

  /**
   * SEND TEXT MESSAGE
   */

  const handleSend = async () => {
    const targetConversationId =
      normalizedConversationId;

    const messageContent = draft.trim();

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
      const message = await sendMessage({
        conversationId: targetConversationId,
        content: messageContent,
      });

      if (!message) return;

      setDrafts((previous) => {
        if (previous[targetConversationId] !== draft) {
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
   * KEYBOARD HANDLING
   */

  const handleKeyDown = (event) => {
    if (
      event.key !== "Enter" ||
      event.shiftKey
    ) {
      return;
    }

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
   * OPEN IMAGE COMPOSER
   */

  const handleOpenImageComposer = () => {
    if (isConversationUnavailable) return;

    setShowPaidMediaComposer(true);
  };

  /**
   * CLOSE IMAGE COMPOSER
   */

  const handleCloseImageComposer = () => {
    setShowPaidMediaComposer(false);
  };

  /**
   * IMAGE MESSAGE SENT
   */

  const handleImageMessageSent = (message) => {
    setShowPaidMediaComposer(false);
    onMessageSent?.(message);
  };

  /**
   * PLACEHOLDER
   */

  let placeholder = "Write a message...";

  if (!normalizedConversationId) {
    placeholder = "Select a conversation";
  } else if (isBlocked) {
    placeholder = "Messaging unavailable";
  } else if (isArchived) {
    placeholder = "Conversation archived";
  } else if (isConversationUnavailable) {
    placeholder = "Messaging unavailable";
  }

  return (
    <div
      className={[
        "w-full min-w-0 shrink-0",
        "border-t border-white/10",
        "bg-[#111115]",
        "px-2 py-1.5",
        "sm:px-3 sm:py-2",
        className,
      ].join(" ")}
    >
      {/* TEXT MESSAGE ERROR */}

      {!showPaidMediaComposer && sendError && (
        <div
          role="alert"
          className="mb-1.5 flex min-w-0 items-center gap-1.5 rounded-md bg-rose-500/10 px-2 py-1.5 text-[9px] text-rose-300"
        >
          <AlertCircle
            size={12}
            className="shrink-0"
          />

          <span className="break-words">
            {sendError}
          </span>
        </div>
      )}

      {/* RATE LIMIT */}

      {isRateLimited && (
        <div
          role="status"
          className="mb-1.5 flex items-center gap-1.5 rounded-md bg-[#ffcc42]/5 px-2 py-1.5 text-[9px] text-[#ffcc42]"
        >
          <Clock3
            size={12}
            className="shrink-0"
          />

          <span>
            Try again in{" "}
            {formatRetryCountdown(retryRemainingMs)}.
          </span>
        </div>
      )}

      {/* IMAGE COMPOSER */}

      {showPaidMediaComposer && (
        <div className="w-full min-w-0">
          <ChatImageComposer
            conversationId={normalizedConversationId}
            isCreator={isCreator}
            onClose={handleCloseImageComposer}
            onMessageSent={handleImageMessageSent}
          />
        </div>
      )}

      {/* NORMAL TEXT COMPOSER
          Hidden while image composer is active.
      */}

      {!showPaidMediaComposer && (
        <div className="w-full min-w-0 rounded-lg border border-white/10 bg-[#1a1a20] focus-within:border-[#ffcc42]/40">
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
            className="block max-h-[100px] min-h-8 w-full resize-none overflow-y-auto bg-transparent px-2.5 py-1.5 text-[11px] leading-4 text-white outline-none placeholder:text-zinc-500 disabled:opacity-50 sm:text-xs"
          />

          {/* TOOLBAR */}

          <div className="flex min-w-0 items-center justify-between gap-1.5 px-1.5 pb-1.5">
            <span
              className={[
                "hidden text-[9px] sm:inline",
                remainingCharacters < 100
                  ? "text-[#ffcc42]"
                  : "text-zinc-600",
              ].join(" ")}
            >
              {characterCount}/{MAX_MESSAGE_LENGTH}
            </span>

            <div className="ml-auto flex shrink-0 items-center gap-1.5">
              {/* ATTACH IMAGE */}

              <button
                type="button"
                onClick={handleOpenImageComposer}
                disabled={isConversationUnavailable}
                aria-label="Attach image"
                aria-expanded={false}
                title="Attach image"
                className="flex h-7 w-7 items-center justify-center rounded-md border border-white/10 text-[#ffcc42] hover:bg-white/5 disabled:opacity-40"
              >
                <Paperclip size={13} />
              </button>

              {/* SEND TEXT */}

              <button
                type="button"
                onClick={() => void handleSend()}
                disabled={!canSend}
                aria-label="Send message"
                title="Send message"
                className={[
                  "flex h-7 min-w-7 items-center justify-center gap-1 rounded-md px-2 text-[9px] font-bold",
                  canSend
                    ? "bg-[#ffcc42] text-black hover:bg-[#f2bd2e]"
                    : "cursor-not-allowed bg-white/10 text-zinc-500",
                ].join(" ")}
              >
                {isSendingMessage ? (
                  <Loader2
                    size={12}
                    className="animate-spin"
                  />
                ) : (
                  <>
                    <span className="hidden sm:inline">
                      Send
                    </span>

                    <Send size={12} />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONVERSATION STATUS */}

      {isBlocked && (
        <p className="mt-1 text-center text-[9px] text-rose-400">
          Messaging is disabled.
        </p>
      )}

      {isArchived && (
        <p className="mt-1 text-center text-[9px] text-amber-400">
          This conversation is archived.
        </p>
      )}
    </div>
  );
}
