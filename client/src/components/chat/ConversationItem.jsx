import {
  useState,
} from "react";

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
 * Displays one conversation in the sidebar.
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
  const [avatarFailed, setAvatarFailed] =
    useState(false);

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

  const preview =
    getMessagePreview(
      conversation,
      currentUserId
    );

  const activityDate =
    getConversationActivityDate(
      conversation
    );

  const formattedTime =
    formatConversationTime(
      activityDate
    );

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

  const handleSelect = () => {
    if (isDisabled) {
      return;
    }

    onSelect?.(conversationId);
  };

  return (
    <button
      type="button"
      onClick={handleSelect}
      disabled={isDisabled}
      aria-current={
        isActive ? "true" : undefined
      }
      className={[
        "group relative flex w-full",
        "items-center gap-3 rounded-2xl",
        "px-3 py-3 text-left",
        "transition-all duration-200",

        "focus-visible:outline-none",
        "focus-visible:ring-2",
        "focus-visible:ring-violet-500",

        isActive
          ? [
              "bg-violet-500/15",
              "ring-1 ring-violet-500/30",
            ].join(" ")
          : [
              "hover:bg-white/5",
              "border border-transparent",
            ].join(" "),

        isDisabled
          ? "cursor-not-allowed opacity-50"
          : "cursor-pointer",
      ].join(" ")}
    >
      {/* ACTIVE INDICATOR */}

      {isActive && (
        <span
          className={[
            "absolute bottom-3 left-0 top-3",
            "w-1 rounded-r-full",
            "bg-violet-400",
          ].join(" ")}
        />
      )}

      {/* AVATAR */}

      <div
        className={[
          "relative flex h-12 w-12",
          "shrink-0 items-center",
          "justify-center overflow-hidden",
          "rounded-2xl",
          "bg-gradient-to-br",
          "from-violet-600",
          "to-fuchsia-600",
          "text-sm font-bold text-white",
        ].join(" ")}
      >
        {avatarUrl && !avatarFailed ? (
          <img
            src={avatarUrl}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
            onError={() =>
              setAvatarFailed(true)
            }
          />
        ) : (
          <span>
            {initials}
          </span>
        )}
      </div>

      {/* CONTENT */}

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <h3
            className={[
              "truncate text-sm font-semibold",
              isActive
                ? "text-white"
                : "text-slate-200",
            ].join(" ")}
          >
            {participantName}
          </h3>

          {formattedTime && (
            <span
              className={[
                "shrink-0 text-[11px]",
                isActive
                  ? "text-violet-300"
                  : "text-slate-500",
              ].join(" ")}
            >
              {formattedTime}
            </span>
          )}
        </div>

        <div className="mt-1 flex items-center gap-2">
          <p
            className={[
              "min-w-0 flex-1 truncate",
              "text-xs leading-5",
              isActive
                ? "text-violet-200/80"
                : "text-slate-400",
            ].join(" ")}
          >
            {preview}
          </p>

          {isArchived && (
            <span
              className={[
                "shrink-0 rounded-md",
                "bg-amber-500/10",
                "px-1.5 py-0.5",
                "text-[10px]",
                "font-medium text-amber-300",
              ].join(" ")}
            >
              Archived
            </span>
          )}

          {isBlocked && (
            <span
              className={[
                "shrink-0 rounded-md",
                "bg-rose-500/10",
                "px-1.5 py-0.5",
                "text-[10px]",
                "font-medium text-rose-300",
              ].join(" ")}
            >
              Blocked
            </span>
          )}
        </div>
      </div>
    </button>
  );
}