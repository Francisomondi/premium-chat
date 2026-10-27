/**
 * ============================================================
 * PREMIUMCHAT — CREATOR CARD SKELETON
 * ============================================================
 *
 * STEP 4.2.3
 *
 * Displays while creator information is loading.
 */

export default function CreatorCardSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading creator"
      className="min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-[#15151a]"
    >
      {/* IMAGE PLACEHOLDER */}

      <div className="relative aspect-[3/4] animate-pulse bg-gradient-to-br from-[#27272e] to-[#17171b]">
        {/* VERIFIED BADGE PLACEHOLDER */}

        <div className="absolute right-3 top-3 h-6 w-16 rounded-full bg-white/10" />

        {/* NAME PLACEHOLDER */}

        <div className="absolute bottom-4 left-3 right-3 space-y-2">
          <div className="h-4 w-3/4 rounded bg-white/15" />

          <div className="h-3 w-1/2 rounded bg-white/10" />
        </div>
      </div>

      {/* BUTTON PLACEHOLDER */}

      <div className="p-2.5 sm:p-3">
        <div className="h-9 animate-pulse rounded-lg bg-[#ffcc42]/10" />
      </div>

      <span className="sr-only">
        Loading creator profile...
      </span>
    </div>
  );
}