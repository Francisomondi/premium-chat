import {
  Crown,
  RefreshCw,
  Users,
  ArrowRight,
} from "lucide-react";

import { Link } from "react-router-dom";

import CreatorCard from "./CreatorCard.jsx";
import CreatorCardSkeleton from "./CreatorCardSkeleton.jsx";

/**
 * ============================================================
 * PREMIUMCHAT — CREATOR GRID
 * ============================================================
 *
 * STEP 19.5
 *
 * Features:
 * - Responsive creator grid
 * - Consistent card dimensions
 * - Loading skeletons
 * - Accessible loading state
 * - Error handling
 * - Retry functionality
 * - Empty state
 * - Creator profile navigation
 *
 * Preserves:
 * - Existing CreatorCard component
 * - Existing CreatorCardSkeleton component
 * - Existing props and API integration
 */

const DEFAULT_SKELETON_COUNT = 6;
const MAX_SKELETON_COUNT = 24;

export default function CreatorGrid({
  creators = [],
  isLoading = false,
  error = null,
  onRetry,
  skeletonCount = DEFAULT_SKELETON_COUNT,
  className = "",
}) {
  /**
   * ==========================================================
   * RESPONSIVE GRID
   * ==========================================================
   */

  const gridClassName = [
    "grid",
    "grid-cols-2",
    "gap-3",
    "sm:grid-cols-3",
    "sm:gap-4",
    "lg:grid-cols-4",
    "xl:grid-cols-5",
    "2xl:grid-cols-6",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const safeSkeletonCount = Number.isFinite(
    Number(skeletonCount)
  )
    ? Math.min(
        MAX_SKELETON_COUNT,
        Math.max(1, Math.floor(Number(skeletonCount)))
      )
    : DEFAULT_SKELETON_COUNT;

  /**
   * ==========================================================
   * LOADING STATE
   * ==========================================================
   */

  if (isLoading) {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-busy="true"
        aria-label="Loading creators"
      >
        <span className="sr-only">
          Loading creator profiles...
        </span>

        <div className={gridClassName}>
          {Array.from({
            length: safeSkeletonCount,
          }).map((_, index) => (
            <CreatorCardSkeleton
              key={`creator-skeleton-${index}`}
            />
          ))}
        </div>
      </div>
    );
  }

  /**
   * ==========================================================
   * ERROR STATE
   * ==========================================================
   */

  if (error) {
    return (
      <div
        role="alert"
        className="
          mx-auto
          flex min-h-[280px]
          max-w-2xl
          flex-col items-center
          justify-center
          rounded-2xl
          border border-red-500/20
          bg-[#15151a]
          px-5 py-10
          text-center
          sm:px-8
        "
      >
        <div
          className="
            flex h-14 w-14
            items-center justify-center
            rounded-2xl
            border border-[#ffcc42]/20
            bg-[#ffcc42]/10
          "
        >
          <RefreshCw
            size={25}
            className="text-[#ffcc42]"
            aria-hidden="true"
          />
        </div>

        <h3 className="mt-5 text-lg font-bold text-white">
          Unable to Load Creators
        </h3>

        <p className="mt-3 max-w-md text-sm leading-6 text-zinc-400">
          {typeof error === "string" && error.trim()
            ? error
            : "Creator profiles are temporarily unavailable. Please try again."}
        </p>

        {typeof onRetry === "function" && (
          <button
            type="button"
            onClick={onRetry}
            className="
              mt-6
              inline-flex min-h-11
              items-center justify-center
              gap-2
              rounded-full
              bg-[#ffcc42]
              px-6
              text-sm font-bold
              text-black
              transition
              hover:bg-[#ffe27a]
              focus-visible:outline
              focus-visible:outline-2
              focus-visible:outline-offset-2
              focus-visible:outline-[#ffcc42]
            "
          >
            <RefreshCw
              size={16}
              aria-hidden="true"
            />

            Try Again
          </button>
        )}
      </div>
    );
  }

  /**
   * ==========================================================
   * EMPTY STATE
   * ==========================================================
   */

  if (!Array.isArray(creators) || creators.length === 0) {
    return (
      <div
        className="
          mx-auto
          flex min-h-[300px]
          max-w-2xl
          flex-col items-center
          justify-center
          rounded-2xl
          border border-[#ffcc42]/15
          bg-gradient-to-br
          from-[#19191e]
          to-[#0d0d10]
          px-5 py-10
          text-center
          sm:px-8
        "
      >
        <div
          className="
            flex h-16 w-16
            items-center justify-center
            rounded-full
            border border-[#ffcc42]/20
            bg-[#ffcc42]/10
          "
        >
          <Users
            size={28}
            className="text-[#ffcc42]"
            aria-hidden="true"
          />
        </div>

        <h3 className="mt-5 text-xl font-bold text-white">
          Creators Coming Soon
        </h3>

        <p className="mt-3 max-w-md text-sm leading-7 text-zinc-400">
          New creators will appear here as they become
          available. Explore PremiumChat and check back
          for new profiles.
        </p>

        <div className="mt-6 flex items-center gap-2">
          <Crown
            size={16}
            className="text-[#ffcc42]"
            aria-hidden="true"
          />

          <span className="text-xs font-medium text-zinc-500">
            PremiumChat Creators
          </span>
        </div>

        <Link
          to="/explore"
          className="
            mt-6
            inline-flex items-center
            gap-2
            text-sm font-semibold
            text-[#ffcc42]
            transition
            hover:text-[#ffe27a]
          "
        >
          Explore Creators

          <ArrowRight
            size={16}
            aria-hidden="true"
          />
        </Link>
      </div>
    );
  }

  /**
   * ==========================================================
   * VALID CREATOR RECORDS
   * ==========================================================
   */

  const validCreators = creators.filter(
    (creator) =>
      creator &&
      typeof creator.id === "string" &&
      creator.id.trim().length > 0
  );

  if (validCreators.length === 0) {
    return (
      <div
        role="status"
        className="rounded-2xl border border-white/10 bg-[#15151a] px-5 py-10 text-center text-sm text-zinc-400"
      >
        No creator profiles are available right now.
      </div>
    );
  }

  /**
   * ==========================================================
   * CREATOR CARDS
   * ==========================================================
   */

  return (
    <div
      className={gridClassName}
      aria-label="Creator profiles"
    >
      {validCreators.map((creator) => (
        <CreatorCard
          key={creator.id}
          creator={creator}
        />
      ))}
    </div>
  );
}