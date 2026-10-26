import { useState } from "react";

import { useAuthStore } from "../../store/useAuthStore.js";

import {
  getOtherParticipant,
  getParticipantAvatar,
  getParticipantInitials,
  getParticipantName,
} from "./chat.utils.js";

/**
 * ============================================================
 * PREMIUMCHAT — CHAT HEADER
 * ============================================================
 *
 * Displays:
 *
 * - Participant avatar
 * - Participant name
 * - Conversation status
 * - Mobile back button
 *
 * Online presence will be added after
 * the presence system is implemented.
 */

/**
 * ============================================================
 * BACK ICON
 * ============================================================
 */

function BackIcon() {
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
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

/**
 * ============================================================
 * CHAT HEADER
 * ============================================================
 */

export default function ChatHeader({
  conversation,
  onBack,
  showBackButton = false,
}) {
  const [avatarFailed, setAvatarFailed] =
    useState(false);

  const currentUser = useAuthStore(
    (state) => state.user
  );

  const currentUserId =
    currentUser?._id ??
    currentUser?.id ??
    null;

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

  const status =
    conversation?.status ??
    "ACTIVE";

  const statusLabel =
    status === "BLOCKED"
      ? "Conversation blocked"
      : status === "ARCHIVED"
        ? "Conversation archived"
        : "Private conversation";

  return (
    <header
      className={[
        "flex min-h-20",
        "items-center gap-3",
        "border-b border-white/10",
        "bg-[#11111d]",
        "px-4 py-3",
        "sm:px-6",
      ].join(" ")}
    >
      {/* MOBILE BACK BUTTON */}

      {showBackButton && (
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to conversations"
          className={[
            "flex h-10 w-10",
            "shrink-0 items-center",
            "justify-center",
            "rounded-xl",
            "text-slate-300",
            "transition-colors",
            "hover:bg-white/10",
            "hover:text-white",
          ].join(" ")}
        >
          <BackIcon />
        </button>
      )}

      {/* AVATAR */}

      <div
        className={[
          "flex h-11 w-11",
          "shrink-0 items-center",
          "justify-center",
          "overflow-hidden rounded-2xl",
          "bg-gradient-to-br",
          "from-violet-600",
          "to-fuchsia-600",
          "text-sm font-bold",
          "text-white",
        ].join(" ")}
      >
        {avatarUrl && !avatarFailed ? (
          <img
            src={avatarUrl}
            alt=""
            className="h-full w-full object-cover"
            onError={() =>
              setAvatarFailed(true)
            }
          />
        ) : (
          <span>{initials}</span>
        )}
      </div>

      {/* PARTICIPANT DETAILS */}

      <div className="min-w-0 flex-1">
        <h2
          className={[
            "truncate text-sm",
            "font-semibold text-white",
            "sm:text-base",
          ].join(" ")}
        >
          {participantName}
        </h2>

        <p
          className={[
            "mt-1 text-xs",
            status === "BLOCKED"
              ? "text-rose-400"
              : status === "ARCHIVED"
                ? "text-amber-400"
                : "text-slate-400",
          ].join(" ")}
        >
          {statusLabel}
        </p>
      </div>

      {/* PRIVATE CHAT BADGE */}

      <div
        className={[
          "hidden items-center",
          "gap-2 rounded-full",
          "border border-white/10",
          "bg-white/5",
          "px-3 py-1.5",
          "text-xs text-slate-400",
          "sm:flex",
        ].join(" ")}
      >
        <span>🔒</span>

        <span>Private chat</span>
      </div>
    </header>
  );
}