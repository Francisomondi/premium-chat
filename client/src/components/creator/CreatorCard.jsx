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
 * STEP 19.5
 *
 * Features:
 * - Premium black-and-gold design
 * - Full-card navigation
 * - Real creator data
 * - Verified creator badge
 * - Responsive portrait images
 * - Image loading fallback
 * - Accessible creator links
 * - Consistent card proportions
 * - Smooth hover transitions
 *
 * No mock creator information.
 */

export default function CreatorCard({
  creator,
  className = "",
}) {
  /**
   * ==========================================================
   * IMAGE STATE
   * ==========================================================
   */

  const [failedImageUrl, setFailedImageUrl] =
    useState(null);

  if (!creator?.id) {
    return null;
  }

  /**
   * ==========================================================
   * CREATOR INFORMATION
   * ==========================================================
   */

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

  const imageUrl =
    typeof avatarUrl === "string"
      ? avatarUrl.trim()
      : "";

  const hasImage =
    imageUrl.length > 0 &&
    failedImageUrl !== imageUrl;

  const profilePath =
    `/creators/${encodeURIComponent(String(id))}`;

  /**
   * ==========================================================
   * RENDER
   * ==========================================================
   */

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
        "hover:border-[#ffcc42]/60",
        "hover:shadow-[0_15px_40px_rgba(255,204,66,0.10)]",
        "focus-within:border-[#ffcc42]",
        "focus-within:ring-2",
        "focus-within:ring-[#ffcc42]/30",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* ============================================= */}
      {/* FULL-CARD NAVIGATION                          */}
      {/* ============================================= */}

      <Link
        to={profilePath}
        aria-label={`View ${name}'s profile`}
        className="
          absolute inset-0 z-20
          rounded-2xl
          focus-visible:outline
          focus-visible:outline-2
          focus-visible:outline-offset-2
          focus-visible:outline-[#ffcc42]
        "
      >
        <span className="sr-only">
          View {name}'s profile
        </span>
      </Link>

      {/* ============================================= */}
      {/* CREATOR IMAGE                                 */}
      {/* ============================================= */}

      <div
        className="
          relative
          aspect-[3/4]
          w-full
          overflow-hidden
          bg-[#101014]
        "
      >
        {hasImage ? (
          <img
            src={imageUrl}
            alt={`${name}'s profile`}
            loading="lazy"
            decoding="async"
            onError={() => {
              setFailedImageUrl(imageUrl);
            }}
            className="
              h-full w-full
              object-cover
              transition-transform
              duration-500
              group-hover:scale-105
            "
          />
        ) : (
          <div
            className="
              flex h-full w-full
              flex-col
              items-center
              justify-center
              bg-gradient-to-br
              from-[#2d2417]
              via-[#19191e]
              to-[#09090c]
            "
          >
            <div
              className="
                flex h-16 w-16
                items-center justify-center
                rounded-full
                border border-[#ffcc42]/20
                bg-[#ffcc42]/10
                sm:h-20 sm:w-20
              "
            >
              <UserRound
                size={38}
                strokeWidth={1.2}
                className="text-[#ffcc42]/70"
                aria-hidden="true"
              />
            </div>

            <Crown
              size={17}
              className="mt-4 text-[#ffcc42]/40"
              aria-hidden="true"
            />
          </div>
        )}

        {/* =========================================== */}
        {/* IMAGE GRADIENT                              */}
        {/* =========================================== */}

        <div
          aria-hidden="true"
          className="
            pointer-events-none
            absolute inset-0
            bg-gradient-to-t
            from-black
            via-black/15
            to-transparent
          "
        />

        {/* =========================================== */}
        {/* VERIFIED BADGE                              */}
        {/* =========================================== */}

        {isVerified === true && (
          <div
            title="Verified creator"
            className="
              absolute
              right-2 top-2
              z-10
              flex items-center
              gap-1
              rounded-full
              border border-[#ffcc42]/30
              bg-black/75
              px-2 py-1
              backdrop-blur-md
            "
          >
            <BadgeCheck
              size={13}
              className="text-[#ffcc42]"
              aria-hidden="true"
            />

            <span
              className="
                hidden
                text-[10px]
                font-semibold
                text-[#ffcc42]
                sm:inline
              "
            >
              Verified
            </span>
          </div>
        )}

        {/* =========================================== */}
        {/* CREATOR DETAILS                             */}
        {/* =========================================== */}

        <div
          className="
            absolute
            bottom-0 left-0 right-0
            z-10
            p-3
            sm:p-4
          "
        >
          <h3
            title={name}
            className="
              truncate
              text-sm
              font-bold
              text-white
              sm:text-base
            "
          >
            {name}
          </h3>

          <p
            className="
              mt-1
              text-[11px]
              text-zinc-300
              sm:text-xs
            "
          >
            PremiumChat Creator
          </p>
        </div>
      </div>

      {/* ============================================= */}
      {/* CARD FOOTER                                   */}
      {/* ============================================= */}

      <div className="p-2.5 sm:p-3">
        <div
          aria-hidden="true"
          className="
            flex min-h-9
            w-full
            items-center
            justify-center
            gap-2
            rounded-lg
            border border-[#ffcc42]/40
            bg-[#ffcc42]/10
            px-3 py-2
            text-[11px]
            font-semibold
            text-[#ffcc42]
            transition-all
            duration-200
            group-hover:border-[#ffcc42]
            group-hover:bg-[#ffcc42]
            group-hover:text-black
            sm:text-xs
          "
        >
          View Profile

          <ArrowUpRight
            size={15}
            aria-hidden="true"
          />
        </div>
      </div>
    </article>
  );
}