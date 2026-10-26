import { useState } from "react";

/**
 * ============================================================
 * PREMIUMCHAT — MESSAGE BUBBLE
 * ============================================================
 *
 * Supports:
 *
 * - Sent and received messages
 * - Text messages
 * - Image/video placeholders
 * - Locked media
 * - Message timestamps
 * - SENT / DELIVERED / READ status
 *
 * IMPORTANT:
 *
 * Locked media must never expose protected
 * image or video URLs before authorization
 * and payment verification.
 *
 * Actual media rendering will be implemented
 * in the paid-media module.
 */

/**
 * ============================================================
 * FORMAT MESSAGE TIME
 * ============================================================
 */

const formatMessageTime = (value) => {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
};

/**
 * ============================================================
 * STATUS INDICATOR
 * ============================================================
 */

function MessageStatus({ status }) {
  const normalizedStatus =
    typeof status === "string"
      ? status.toUpperCase()
      : "SENT";

  if (normalizedStatus === "READ") {
    return (
      <span
        title="Read"
        aria-label="Read"
        className="font-semibold text-sky-300"
      >
        ✓✓
      </span>
    );
  }

  if (normalizedStatus === "DELIVERED") {
    return (
      <span
        title="Delivered"
        aria-label="Delivered"
        className="text-violet-200"
      >
        ✓✓
      </span>
    );
  }

  return (
    <span
      title="Sent"
      aria-label="Sent"
      className="text-violet-200/70"
    >
      ✓
    </span>
  );
}

/**
 * ============================================================
 * LOCK ICON
 * ============================================================
 */

function LockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-5 w-5"
    >
      <rect
        x="5"
        y="10"
        width="14"
        height="11"
        rx="2"
      />

      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

/**
 * ============================================================
 * MEDIA PLACEHOLDER
 * ============================================================
 */

function MediaPlaceholder({
  type,
  isLocked,
}) {
  const isVideo = type === "VIDEO";

  return (
    <div
      className={[
        "flex min-h-32 w-full",
        "flex-col items-center",
        "justify-center gap-3",
        "rounded-xl",
        "border border-white/10",
        "bg-black/20",
        "px-5 py-6",
        "text-center",
      ].join(" ")}
    >
      {isLocked ? (
        <span
          className={[
            "flex h-11 w-11",
            "items-center justify-center",
            "rounded-2xl",
            "bg-amber-500/10",
            "text-amber-300",
          ].join(" ")}
        >
          <LockIcon />
        </span>
      ) : (
        <span className="text-3xl">
          {isVideo ? "🎬" : "🖼️"}
        </span>
      )}

      <div>
        <p className="text-sm font-semibold text-white">
          {isLocked
            ? "Locked premium content"
            : isVideo
              ? "Video message"
              : "Image message"}
        </p>

        <p className="mt-1 text-xs leading-5 text-slate-400">
          {isLocked
            ? "This media requires access before viewing."
            : "Media preview will be available soon."}
        </p>
      </div>
    </div>
  );
}

/**
 * ============================================================
 * MESSAGE BUBBLE
 * ============================================================
 */

export default function MessageBubble({
  message,
  isOwnMessage = false,
}) {
  const [expanded, setExpanded] = useState(false);

  if (!message) {
    return null;
  }

  const type =
    typeof message.type === "string"
      ? message.type.toUpperCase()
      : "TEXT";

  const isMedia =
    type === "IMAGE" ||
    type === "VIDEO";

  const isLocked =
    Boolean(message.isLocked);

  const content =
    typeof message.content === "string"
      ? message.content
      : "";

  const maxPreviewLength = 1500;

  const shouldTruncate =
    content.length > maxPreviewLength;

  const displayedContent =
    shouldTruncate && !expanded
      ? `${content.slice(0, maxPreviewLength)}…`
      : content;

  const timestamp =
    formatMessageTime(
      message.createdAt
    );

  return (
    <div
      className={[
        "flex w-full",
        isOwnMessage
          ? "justify-end"
          : "justify-start",
      ].join(" ")}
    >
      <div
        className={[
          "max-w-[85%]",
          "sm:max-w-[75%]",
          "lg:max-w-[65%]",
          "rounded-2xl",
          "px-4 py-3",
          "shadow-sm",

          isOwnMessage
            ? [
                "rounded-br-md",
                "bg-gradient-to-br",
                "from-violet-600",
                "to-fuchsia-700",
                "text-white",
              ].join(" ")
            : [
                "rounded-bl-md",
                "border border-white/10",
                "bg-[#1b1b2b]",
                "text-slate-100",
              ].join(" "),
        ].join(" ")}
      >
        {/* MEDIA */}

        {isMedia && (
          <MediaPlaceholder
            type={type}
            isLocked={isLocked}
          />
        )}

        {/* TEXT */}

        {type === "TEXT" && content && (
          <div>
            <p
              className={[
                "whitespace-pre-wrap",
                "break-words",
                "text-sm leading-6",
              ].join(" ")}
            >
              {displayedContent}
            </p>

            {shouldTruncate && (
              <button
                type="button"
                onClick={() =>
                  setExpanded(
                    (previous) => !previous
                  )
                }
                className={[
                  "mt-2 text-xs",
                  "font-semibold",
                  isOwnMessage
                    ? "text-violet-100"
                    : "text-violet-300",
                ].join(" ")}
              >
                {expanded
                  ? "Show less"
                  : "Read more"}
              </button>
            )}
          </div>
        )}

        {/* TIMESTAMP + STATUS */}

        <div
          className={[
            "mt-2 flex items-center",
            "justify-end gap-2",
            "text-[10px]",
            isOwnMessage
              ? "text-violet-100/80"
              : "text-slate-500",
          ].join(" ")}
        >
          {timestamp && (
            <time dateTime={message.createdAt}>
              {timestamp}
            </time>
          )}

          {isOwnMessage && (
            <MessageStatus
              status={message.status}
            />
          )}
        </div>
      </div>
    </div>
  );
}