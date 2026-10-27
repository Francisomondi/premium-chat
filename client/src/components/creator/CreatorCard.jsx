import { useState } from "react";

import { Link } from "react-router-dom";

import {
  BadgeCheck,
  ArrowUpRight,
  Crown,
  UserRound,
} from "lucide-react";

/**
 * ============================================================
 * PREMIUMCHAT — CREATOR CARD
 * ============================================================
 *
 * STEP 4.2.3
 *
 * Reusable creator card.
 *
 * Features:
 * - Real creator data
 * - Responsive portrait layout
 * - Verified creator badge
 * - Image fallback
 * - Hover effects
 * - Black-and-gold styling
 * - Accessible navigation
 */

/**
 * ============================================================
 * CREATOR CARD
 * ============================================================
 */

export default function CreatorCard({
  creator,
  className = "",
}) {
  const [imageError, setImageError] = useState(false);

  if (!creator?.id) {
    return null;
  }

  const {
    id,
    displayName,
    avatarUrl,
    isVerified,
  } = creator;

  const name =
    typeof displayName === "string" &&
    displayName.trim()
      ? displayName.trim()
      : "PremiumChat Creator";

  const hasImage =
    typeof avatarUrl === "string" &&
    avatarUrl.trim().length > 0 &&
    !imageError;

  /**
   * Profile navigation will become active when
   * /creators/:creatorId is registered in Step 4.2.5.
   */

  const profilePath = `/creators/${encodeURIComponent(id)}`;

  return (
    <article
      className={[
        "group relative",
        "min-w-0 overflow-hidden",
        "rounded-2xl",
        "border border-white/10",
        "bg-[#15151a]",
        "transition-all duration-300",
        "hover:-translate-y-1",
        "hover:border-[#ffcc42]/70",
        "hover:shadow-[0_12px_35px_rgba(255,204,66,0.12)]",
        className,
      ].join(" ")}
    >
      {/* =============================================== */}
      {/* CREATOR IMAGE                                   */}
      {/* =============================================== */}

      <div className="relative aspect-[3/4] w-full overflow-hidden">
        {hasImage ? (
          <img
            src={avatarUrl}
            alt={`${name}'s profile`}
            loading="lazy"
            decoding="async"
            onError={() => setImageError(true)}
            className={[
              "h-full w-full object-cover",
              "transition-transform duration-500",
              "group-hover:scale-105",
            ].join(" ")}
          />
        ) : (
          <div
            className={[
              "flex h-full w-full",
              "flex-col items-center justify-center",
              "bg-gradient-to-br",
              "from-[#2d2417]",
              "via-[#19191e]",
              "to-[#09090c]",
            ].join(" ")}
          >
            <div className="flex h-20 w-20 items-center justify-center rounded-full border border-[#ffcc42]/20 bg-[#ffcc42]/10 sm:h-24 sm:w-24">
              <UserRound
                size={42}
                strokeWidth={1.2}
                className="text-[#ffcc42]/70"
              />
            </div>

            <Crown
              size={18}
              className="mt-5 text-[#ffcc42]/40"
            />
          </div>
        )}

        {/* ============================================= */}
        {/* GRADIENT OVERLAY                              */}
        {/* ============================================= */}

        <div
          className={[
            "pointer-events-none absolute inset-0",
            "bg-gradient-to-t",
            "from-black via-black/20 to-transparent",
          ].join(" ")}
        />

        {/* ============================================= */}
        {/* VERIFIED BADGE                                */}
        {/* ============================================= */}

        {isVerified && (
          <div
            className={[
              "absolute right-2 top-2",
              "flex items-center gap-1",
              "rounded-full",
              "border border-[#ffcc42]/30",
              "bg-black/65",
              "px-2 py-1",
              "backdrop-blur-md",
            ].join(" ")}
            title="Verified creator"
          >
            <BadgeCheck
              size={13}
              className="text-[#ffcc42]"
            />

            <span className="hidden text-[10px] font-semibold text-[#ffcc42] sm:inline">
              Verified
            </span>
          </div>
        )}

        {/* ============================================= */}
        {/* CREATOR NAME                                  */}
        {/* ============================================= */}

        <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-4">
          <h3
            className={[
              "truncate",
              "text-sm font-bold text-white",
              "sm:text-base",
            ].join(" ")}
            title={name}
          >
            {name}
          </h3>

          <p className="mt-1 text-[11px] text-zinc-300 sm:text-xs">
            PremiumChat Creator
          </p>
        </div>
      </div>

      {/* =============================================== */}
      {/* CARD FOOTER                                     */}
      {/* =============================================== */}

      <div className="p-2.5 sm:p-3">
        <Link
          to={profilePath}
          aria-label={`View ${name}'s profile`}
          className={[
            "flex w-full items-center justify-center",
            "gap-1.5 rounded-lg",
            "border border-[#ffcc42]/50",
            "bg-[#ffcc42]/10",
            "px-2 py-2",
            "text-[11px] font-semibold",
            "text-[#ffcc42]",
            "transition-all duration-200",
            "hover:border-[#ffcc42]",
            "hover:bg-[#ffcc42]",
            "hover:text-black",
            "sm:text-xs",
          ].join(" ")}
        >
          View Profile

          <ArrowUpRight size={14} />
        </Link>
      </div>
    </article>
  );
}