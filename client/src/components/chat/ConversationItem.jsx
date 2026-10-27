import {
  useState,
} from "react";

import {
  Archive,
  Ban,
} from "lucide-react";

import {
  formatConversationTime,
  getConversationActivityDate,
  getConversationId,
  getMessagePreview,
  getOtherParticipant,
  getParticipantAvatar,
  getParticipantInitials,
  getParticipantName,
} from "./chat.utils.js";

/**
 * ============================================================
 * PREMIUMCHAT — CONVERSATION ITEM
 * ============================================================
 *
 * UI CLEANUP 1.6.4
 *
 * Displays one conversation in the sidebar.
 *
 * Features:
 *
 * - Compact responsive layout
 * - Participant avatar
 * - Avatar fallback initials
 * - Participant name
 * - Last message preview
 * - Conversation timestamp
 * - Active conversation highlighting
 * - Archived conversation badge
 * - Blocked conversation badge
 * - Keyboard accessibility
 *
 * Preserves:
 *
 * - Existing chat utility functions
 * - Existing conversation data structure
 * - Existing selection callback
 * - Existing blocked conversation restrictions
 *
 * Props:
 *
 * conversation
 * currentUserId
 * isActive
 * onSelect
 * disabled
 */

export default function ConversationItem({
  conversation,
  currentUserId,
  isActive = false,
  onSelect,
  disabled = false,
}) {
  /**
   * ==========================================================
   * LOCAL STATE
   * ==========================================================
   */

  const [failedAvatarUrl, setFailedAvatarUrl] =
    useState(null);

  /**
   * ==========================================================
   * CONVERSATION DETAILS
   * ==========================================================
   */

  const conversationId =
    getConversationId(conversation);

  const participant =
    getOtherParticipant(
      conversation,
      currentUserId
    );

  const participantName =
    getParticipantName(participant);

  const avatarUrl =
    getParticipantAvatar(participant);

  const initials =
    getParticipantInitials(
      participantName
    );

  /**
   * ==========================================================
   * MESSAGE PREVIEW
   * ==========================================================
   */

  const preview =
    getMessagePreview(
      conversation,
      currentUserId
    );

  /**
   * ==========================================================
   * ACTIVITY TIMESTAMP
   * ==========================================================
   */

  const activityDate =
    getConversationActivityDate(
      conversation
    );

  const formattedTime =
    formatConversationTime(
      activityDate
    );

  /**
   * ==========================================================
   * CONVERSATION STATUS
   * ==========================================================
   */

  const status =
    conversation?.status ??
    "ACTIVE";

  const isBlocked =
    status === "BLOCKED";

  const isArchived =
    status === "ARCHIVED";

  const isDisabled =
    disabled ||
    !conversationId ||
    isBlocked;

  /**
   * ==========================================================
   * AVATAR FALLBACK
   * ==========================================================
   *
   * Track the URL that failed instead of a
   * permanent boolean.
   *
   * If the participant uploads a new avatar,
   * the updated URL can display normally.
   */

  const showAvatar =
    Boolean(avatarUrl) &&
    failedAvatarUrl !== avatarUrl;

  /**
   * ==========================================================
   * SELECT CONVERSATION
   * ==========================================================
   */

  const handleSelect = () => {
    if (isDisabled) {
      return;
    }

    onSelect?.(conversationId);
  };

  /**
   * ==========================================================
   * ACCESSIBLE LABEL
   * ==========================================================
   */

  const accessibleLabel = [
    `Conversation with ${participantName}`,
    formattedTime
      ? `Last activity ${formattedTime}`
      : null,
    isArchived ? "Archived" : null,
    isBlocked ? "Blocked" : null,
  ]
    .filter(Boolean)
    .join(". ");

  /**
   * ==========================================================
   * RENDER
   * ==========================================================
   */

  return (
    <button
      type="button"
      onClick={handleSelect}
      disabled={isDisabled}
      aria-current={
        isActive ? "true" : undefined
      }
      aria-label={accessibleLabel}
      className={[
        /**
         * BASE LAYOUT
         */

        "group relative flex",
        "w-full min-w-0",
        "min-h-[68px]",
        "items-center gap-3",
        "rounded-xl",
        "border",
        "px-3 py-2.5",
        "text-left",

        /**
         * TRANSITIONS
         */

        "transition-all duration-200",

        /**
         * KEYBOARD ACCESSIBILITY
         */

        "focus-visible:outline-none",
        "focus-visible:ring-2",
        "focus-visible:ring-[#ffcc42]/60",

        /**
         * ACTIVE CONVERSATION
         */

        isActive
          ? [
              "border-[#ffcc42]/25",
              "bg-[#ffcc42]/10",
              "shadow-[inset_0_0_0_1px_rgba(255,204,66,0.05)]",
            ].join(" ")
          : [
              "border-transparent",
              "bg-transparent",
              "hover:border-white/5",
              "hover:bg-white/5",
            ].join(" "),

        /**
         * DISABLED STATE
         */

        isDisabled
          ? [
              "cursor-not-allowed",
              "opacity-50",
            ].join(" ")
          : "cursor-pointer",
      ].join(" ")}
    >
      {/* ================================================= */}
      {/* ACTIVE CONVERSATION INDICATOR                     */}
      {/* ================================================= */}

      {isActive && (
        <span
          aria-hidden="true"
          className={[
            "absolute left-0",
            "top-3 bottom-3",
            "w-[3px]",
            "rounded-r-full",
            "bg-[#ffcc42]",
          ].join(" ")}
        />
      )}

      {/* ================================================= */}
      {/* PARTICIPANT AVATAR                                */}
      {/* ================================================= */}

      <div
        className={[
          "relative flex",
          "h-[42px] w-[42px]",
          "shrink-0",
          "items-center justify-center",
          "overflow-hidden",
          "rounded-xl",

          /**
           * FALLBACK BACKGROUND
           */

          "border border-[#ffcc42]/15",
          "bg-gradient-to-br",
          "from-[#3b3018]",
          "via-[#29241b]",
          "to-[#17171c]",

          /**
           * FALLBACK TEXT
           */

          "text-[13px]",
          "font-bold",
          "text-[#ffcc42]",
        ].join(" ")}
      >
        {showAvatar ? (
          <img
            src={avatarUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
            onError={() => {
              setFailedAvatarUrl(avatarUrl);
            }}
          />
        ) : (
          <span aria-hidden="true">
            {initials}
          </span>
        )}
      </div>

      {/* ================================================= */}
      {/* CONVERSATION CONTENT                              */}
      {/* ================================================= */}

      <div className="min-w-0 flex-1">
        {/* NAME AND TIME */}

        <div className="flex min-w-0 items-center justify-between gap-2">
          <h3
            className={[
              "min-w-0 flex-1",
              "truncate",
              "text-[12px]",
              "font-semibold",
              "leading-5",

              isActive
                ? "text-[#ffcc42]"
                : "text-zinc-100",
            ].join(" ")}
          >
            {participantName}
          </h3>

          {/* TIMESTAMP */}

          {formattedTime && (
            <span
              className={[
                "shrink-0",
                "whitespace-nowrap",
                "text-[10px]",
                "font-medium",

                isActive
                  ? "text-[#ffcc42]/80"
                  : "text-zinc-500",
              ].join(" ")}
            >
              {formattedTime}
            </span>
          )}
        </div>

        {/* ================================================= */}
        {/* MESSAGE PREVIEW AND STATUS                       */}
        {/* ================================================= */}

        <div className="mt-0.5 flex min-w-0 items-center gap-2">
          {/* MESSAGE PREVIEW */}

          <p
            className={[
              "min-w-0 flex-1",
              "truncate",
              "text-[11px]",
              "leading-5",

              isActive
                ? "text-zinc-300"
                : "text-zinc-500",
            ].join(" ")}
          >
            {preview}
          </p>

          {/* ARCHIVED BADGE */}

          {isArchived && (
            <span
              title="Archived conversation"
              className={[
                "inline-flex",
                "shrink-0",
                "items-center gap-1",
                "rounded-md",
                "border border-amber-500/15",
                "bg-amber-500/10",
                "px-1.5 py-0.5",
                "text-[9px]",
                "font-semibold",
                "text-amber-300",
              ].join(" ")}
            >
              <Archive size={10} />

              <span>Archived</span>
            </span>
          )}

          {/* BLOCKED BADGE */}

          {isBlocked && (
            <span
              title="Blocked conversation"
              className={[
                "inline-flex",
                "shrink-0",
                "items-center gap-1",
                "rounded-md",
                "border border-red-500/15",
                "bg-red-500/10",
                "px-1.5 py-0.5",
                "text-[9px]",
                "font-semibold",
                "text-red-300",
              ].join(" ")}
            >
              <Ban size={10} />

              <span>Blocked</span>
            </span>
          )}
        </div>
      </div>
    </button>
  );
}