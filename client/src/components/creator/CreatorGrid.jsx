import {
  Crown,
  RefreshCw,
  Users,
} from "lucide-react";

import CreatorCard from "./CreatorCard.jsx";

import CreatorCardSkeleton from "./CreatorCardSkeleton.jsx";

/**
 * ============================================================
 * PREMIUMCHAT — CREATOR GRID
 * ============================================================
 *
 * STEP 4.2.3
 *
 * Features:
 * - Responsive grid
 * - Loading skeletons
 * - Empty state
 * - Error state
 * - Retry functionality
 */

export default function CreatorGrid({
  creators = [],
  isLoading = false,
  error = null,
  onRetry,
  skeletonCount = 6,
  className = "",
}) {
  /**
   * ==========================================================
   * RESPONSIVE GRID CLASSES
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
  ].join(" ");

  /**
   * ==========================================================
   * LOADING STATE
   * ==========================================================
   */

  if (isLoading) {
    return (
      <div
        className={gridClassName}
        aria-busy="true"
        aria-label="Loading creators"
      >
        {Array.from({
          length: skeletonCount,
        }).map((_, index) => (
          <CreatorCardSkeleton
            key={`creator-skeleton-${index}`}
          />
        ))}
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
      <div className="rounded-2xl border border-red-500/20 bg-[#15151a] px-5 py-12 text-center">
        <RefreshCw
          size={34}
          className="mx-auto text-[#ffcc42]"
        />

        <h3 className="mt-4 text-lg font-bold text-white">
          Unable to Load Creators
        </h3>

        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-400">
          We couldn't load creator profiles right now.
          Please try again.
        </p>

        {typeof onRetry === "function" && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#ffcc42] px-5 py-2.5 text-sm font-semibold text-black transition hover:brightness-110"
          >
            <RefreshCw size={16} />

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
      <div className="rounded-2xl border border-[#ffcc42]/15 bg-gradient-to-br from-[#19191e] to-[#0d0d10] px-5 py-12 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-[#ffcc42]/20 bg-[#ffcc42]/10">
          <Users
            size={30}
            className="text-[#ffcc42]"
          />
        </div>

        <h3 className="mt-5 text-xl font-bold text-white">
          Creators Coming Soon
        </h3>

        <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-zinc-400">
          We're preparing an exciting community of
          verified creators. Check back soon to
          discover and connect with them.
        </p>

        <Crown
          size={20}
          className="mx-auto mt-5 text-[#ffcc42]/50"
        />
      </div>
    );
  }

  /**
   * ==========================================================
   * CREATOR CARDS
   * ==========================================================
   */

  return (
    <div className={gridClassName}>
      {creators.map((creator) => (
        <CreatorCard
          key={creator.id}
          creator={creator}
        />
      ))}
    </div>
  );
}