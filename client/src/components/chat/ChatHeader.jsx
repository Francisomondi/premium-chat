import { useState } from "react";

import {
  ArrowLeft,
  Archive,
  Ban,
  LockKeyhole,
} from "lucide-react";

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
 * UI CLEANUP 1.7
 *
 * Features:
 *
 * - Compact black-and-gold interface
 * - Participant avatar
 * - Avatar fallback initials
 * - Participant name
 * - Conversation status
 * - Mobile back navigation
 * - Private conversation indicator
 *
 * Preserves:
 *
 * - Existing authentication store
 * - Existing chat utility functions
 * - Existing conversation statuses
 * - Existing mobile navigation callback
 *
 * Online presence is intentionally not displayed
 * until the presence system is implemented.
 */

export default function ChatHeader({
  conversation,
  onBack,
  showBackButton = false,
}) {
  /**
   * ==========================================================
   * LOCAL STATE
   * ==========================================================
   *
   * Track the URL of a failed avatar.
   *
   * This allows a new avatar URL to load
   * if the participant updates their profile.
   */

  const [failedAvatarUrl, setFailedAvatarUrl] =
    useState(null);

  /**
   * ==========================================================
   * AUTHENTICATED USER
   * ==========================================================
   */

  const currentUser = useAuthStore(
    (state) => state.user
  );

  const currentUserId =
    currentUser?._id ??
    currentUser?.id ??
    null;

  /**
   * ==========================================================
   * PARTICIPANT DETAILS
   * ==========================================================
   */

  const participant = getOtherParticipant(
    conversation,
    currentUserId
  );

  const participantName =
    getParticipantName(participant);

  const avatarUrl =
    getParticipantAvatar(participant);

  const initials =
    getParticipantInitials(participantName);

  /**
   * ==========================================================
   * AVATAR DISPLAY
   * ==========================================================
   */

  const showAvatar =
    Boolean(avatarUrl) &&
    failedAvatarUrl !== avatarUrl;

  /**
   * ==========================================================
   * CONVERSATION STATUS
   * ==========================================================
   */

  const status =
    conversation?.status ?? "ACTIVE";

  const isBlocked = status === "BLOCKED";

  const isArchived = status === "ARCHIVED";

  const statusLabel = isBlocked
    ? "Conversation blocked"
    : isArchived
      ? "Conversation archived"
      : "Private conversation";

  /**
   * ==========================================================
   * STATUS STYLING
   * ==========================================================
   */

  const statusTextClass = isBlocked
    ? "text-rose-400"
    : isArchived
      ? "text-amber-400"
      : "text-zinc-500";

  const statusDotClass = isBlocked
    ? "bg-rose-400"
    : isArchived
      ? "bg-amber-400"
      : "bg-[#ffcc42]";

  /**
   * ==========================================================
   * RENDER
   * ==========================================================
   */

  return (
    <header
      className={[
        "flex min-h-[64px]",
        "shrink-0 items-center",
        "gap-3",
        "border-b border-white/10",
        "bg-[#111115]",
        "px-3 py-2.5",
        "sm:px-5",
      ].join(" ")}
    >
      {/* ================================================= */}
      {/* MOBILE BACK BUTTON                                */}
      {/* ================================================= */}

      {showBackButton && (
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to conversations"
          title="Back to conversations"
          className={[
            "flex h-9 w-9",
            "shrink-0 items-center",
            "justify-center",
            "rounded-lg",
            "border border-transparent",
            "text-zinc-400",
            "transition-colors",
            "hover:border-[#ffcc42]/20",
            "hover:bg-[#ffcc42]/10",
            "hover:text-[#ffcc42]",
            "focus-visible:outline-none",
            "focus-visible:ring-2",
            "focus-visible:ring-[#ffcc42]/50",
            "md:hidden",
          ].join(" ")}
        >
          <ArrowLeft size={19} />
        </button>
      )}

      {/* ================================================= */}
      {/* PARTICIPANT AVATAR                                */}
      {/* ================================================= */}

      <div
        className={[
          "relative flex",
          "h-10 w-10",
          "shrink-0",
          "items-center justify-center",
          "overflow-hidden",
          "rounded-xl",
          "border border-[#ffcc42]/15",
          "bg-gradient-to-br",
          "from-[#3b3018]",
          "via-[#29241b]",
          "to-[#17171c]",
          "text-[13px]",
          "font-bold",
          "text-[#ffcc42]",
        ].join(" ")}
      >
        {showAvatar ? (
          <img
            src={avatarUrl}
            alt=""
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
      {/* PARTICIPANT INFORMATION                           */}
      {/* ================================================= */}

      <div className="min-w-0 flex-1">
        {/* PARTICIPANT NAME */}

        <h2
          className={[
            "truncate",
            "text-[13px]",
            "font-semibold",
            "leading-5",
            "text-white",
            "sm:text-sm",
          ].join(" ")}
          title={participantName}
        >
          {participantName}
        </h2>

        {/* CONVERSATION STATUS */}

        <div className="mt-0.5 flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={[
              "h-1.5 w-1.5",
              "shrink-0 rounded-full",
              statusDotClass,
            ].join(" ")}
          />

          <span
            className={[
              "truncate",
              "text-[11px]",
              "leading-4",
              statusTextClass,
            ].join(" ")}
          >
            {statusLabel}
          </span>

          {/* ARCHIVED ICON */}

          {isArchived && (
            <Archive
              size={12}
              className="shrink-0 text-amber-400"
              aria-hidden="true"
            />
          )}

          {/* BLOCKED ICON */}

          {isBlocked && (
            <Ban
              size={12}
              className="shrink-0 text-rose-400"
              aria-hidden="true"
            />
          )}
        </div>
      </div>

      {/* ================================================= */}
      {/* PRIVATE CHAT INDICATOR                            */}
      {/* ================================================= */}

      <div
        className={[
          "hidden shrink-0",
          "items-center gap-2",
          "rounded-full",
          "border border-[#ffcc42]/15",
          "bg-[#ffcc42]/5",
          "px-3 py-1.5",
          "text-[11px]",
          "font-medium",
          "text-zinc-400",
          "sm:inline-flex",
        ].join(" ")}
        title="Private conversation"
      >
        <LockKeyhole
          size={13}
          className="text-[#ffcc42]"
          aria-hidden="true"
        />

        <span>Private Chat</span>
      </div>
    </header>
  );
}