import {
  useCallback,
  useEffect,
  useState,
} from "react";

import { Link } from "react-router-dom";

import {
  ArrowRight,
  Crown,
  Sparkles,
} from "lucide-react";

import CreatorGrid from "./CreatorGrid.jsx";

import {
  getPublicCreators,
} from "../../api/creator.api.js";

/**
 * ============================================================
 * PREMIUMCHAT — POPULAR CREATORS
 * ============================================================
 *
 * STEP 4.2.4
 *
 * Features:
 * - Fetch approved creators
 * - Display responsive creator cards
 * - Loading skeletons
 * - Empty state
 * - Error handling
 * - Retry functionality
 * - Abort pending requests on unmount
 *
 * Note:
 * Current ordering is newest eligible creators.
 * Popularity ranking will require engagement metrics.
 */

export default function PopularCreators() {
  /**
   * ==========================================================
   * STATE
   * ==========================================================
   */

  const [creators, setCreators] = useState([]);

  const [isLoading, setIsLoading] = useState(true);

  const [error, setError] = useState(null);

  const [reloadKey, setReloadKey] = useState(0);

  /**
   * ==========================================================
   * LOAD CREATORS
   * ==========================================================
   */

  const loadCreators = useCallback(() => {
    setReloadKey((previous) => previous + 1);
  }, []);

  /**
   * ==========================================================
   * FETCH CREATORS
   * ==========================================================
   */

  useEffect(() => {
    const controller = new AbortController();

    const fetchCreators = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await getPublicCreators({
          page: 1,
          limit: 6,
          sort: "newest",
          signal: controller.signal,
        });

        if (controller.signal.aborted) {
          return;
        }

        const fetchedCreators =
          response?.data?.creators;

        if (!Array.isArray(fetchedCreators)) {
          throw new Error(
            "Invalid creator discovery response."
          );
        }

        setCreators(fetchedCreators);
      } catch (requestError) {
        if (
          controller.signal.aborted ||
          requestError?.code === "ERR_CANCELED"
        ) {
          return;
        }

        setError(
          "Unable to load creators."
        );

        setCreators([]);
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    };

    fetchCreators();

    return () => {
      controller.abort();
    };
  }, [reloadKey]);

  /**
   * ==========================================================
   * RENDER
   * ==========================================================
   */

  return (
    <section
      id="popular-creators"
      className="relative overflow-hidden bg-[#09090c] py-16 sm:py-20 lg:py-24"
    >
      {/* BACKGROUND DECORATION */}

      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-0 h-80 w-80 -translate-x-1/2 rounded-full bg-[#ffcc42]/5 blur-[120px]"
      />

      <div className="relative mx-auto max-w-[1500px] px-4 sm:px-6 lg:px-10">
        {/* ============================================= */}
        {/* SECTION HEADING                               */}
        {/* ============================================= */}

        <div className="mb-8 flex flex-col gap-5 sm:mb-10 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-2">
              <Crown
                size={17}
                className="text-[#ffcc42]"
              />

              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#ffcc42]">
                Discover PremiumChat
              </span>
            </div>

            <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-[42px]">
              Popular{" "}
              <span className="text-[#ffcc42]">
                Creators
              </span>
            </h2>

            <p className="mt-3 max-w-xl text-sm leading-7 text-zinc-400 sm:text-base">
              Discover verified creators and explore
              exclusive connections.
            </p>
          </div>

          {/* VIEW ALL CREATORS */}

          <Link
            to="/explore"
            className="inline-flex w-fit items-center gap-2 rounded-lg border border-[#ffcc42]/40 px-4 py-2.5 text-xs font-semibold text-[#ffcc42] transition hover:border-[#ffcc42] hover:bg-[#ffcc42]/10 sm:text-sm"
          >
            View All Creators

            <ArrowRight size={16} />
          </Link>
        </div>

        {/* ============================================= */}
        {/* CREATOR GRID                                  */}
        {/* ============================================= */}

        <CreatorGrid
          creators={creators}
          isLoading={isLoading}
          error={error}
          onRetry={loadCreators}
          skeletonCount={6}
        />

        {/* ============================================= */}
        {/* BOTTOM DECORATION                             */}
        {/* ============================================= */}

        {!isLoading &&
          !error &&
          creators.length > 0 && (
            <div className="mt-10 flex items-center justify-center gap-2 text-xs text-zinc-500">
              <Sparkles
                size={15}
                className="text-[#ffcc42]"
              />

              <span>
                Discover genuine connections with
                verified creators.
              </span>
            </div>
          )}
      </div>
    </section>
  );
}