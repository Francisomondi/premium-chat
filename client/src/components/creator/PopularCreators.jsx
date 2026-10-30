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
  Users,
} from "lucide-react";

import CreatorGrid from "./CreatorGrid.jsx";

import {
  getPublicCreators,
} from "../../api/creator.api.js";

/**
 * ============================================================
 * PREMIUMCHAT — FEATURED CREATORS
 * ============================================================
 *
 * STEP 19.4
 *
 * Features:
 * - Fetch eligible public creators
 * - Display responsive creator cards
 * - Preserve existing CreatorGrid
 * - Loading skeletons
 * - Empty and error states
 * - Retry functionality
 * - Abort pending requests
 * - Responsive premium design
 *
 * NOTE:
 * Creators are currently sorted by newest.
 * Genuine popularity ranking requires engagement data.
 */

const FEATURED_CREATOR_LIMIT = 6;

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
   * RETRY HANDLER
   * ==========================================================
   */

  const loadCreators = useCallback(() => {
    setReloadKey((previous) => previous + 1);
  }, []);

  /**
   * ==========================================================
   * FETCH FEATURED CREATORS
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
          limit: FEATURED_CREATOR_LIMIT,
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
          requestError?.code === "ERR_CANCELED" ||
          requestError?.name === "CanceledError" ||
          requestError?.name === "AbortError"
        ) {
          return;
        }

        console.error(
          "[PremiumChat] Creator discovery failed:",
          requestError
        );

        setError(
          "We couldn't load creators right now. Please try again."
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
      aria-labelledby="featured-creators-title"
      className="
        relative
        overflow-hidden
        border-t border-white/5
        bg-[#09090c]
        py-14
        sm:py-16
        lg:py-20
      "
    >
      {/* BACKGROUND GLOW */}

      <div
        aria-hidden="true"
        className="
          pointer-events-none
          absolute
          left-1/2 top-0
          h-80 w-80
          -translate-x-1/2
          rounded-full
          bg-[#ffcc42]/5
          blur-[120px]
        "
      />

      <div
        className="
          relative
          mx-auto
          max-w-[1280px]
          px-4
          sm:px-6
          lg:px-8
        "
      >
        {/* ============================================= */}
        {/* SECTION HEADER                                */}
        {/* ============================================= */}

        <div
          className="
            mb-8
            flex flex-col
            gap-5
            sm:mb-10
            sm:flex-row
            sm:items-end
            sm:justify-between
          "
        >
          <div className="max-w-2xl">
            {/* EYEBROW */}

            <div className="mb-3 flex items-center gap-2">
              <Crown
                size={16}
                className="text-[#ffcc42]"
                aria-hidden="true"
              />

              <span
                className="
                  text-[11px]
                  font-bold
                  uppercase
                  tracking-[0.2em]
                  text-[#ffcc42]
                "
              >
                Discover PremiumChat
              </span>
            </div>

            {/* TITLE */}

            <h2
              id="featured-creators-title"
              className="
                text-[28px]
                font-extrabold
                tracking-tight
                text-white
                sm:text-[34px]
                lg:text-[38px]
              "
            >
              Featured{" "}
              <span className="text-[#ffcc42]">
                Creators
              </span>
            </h2>

            {/* DESCRIPTION */}

            <p
              className="
                mt-3
                max-w-xl
                text-[13px]
                leading-6
                text-zinc-400
                sm:text-sm
              "
            >
              Explore creator profiles, discover
              interesting personalities, and find
              your next great conversation.
            </p>
          </div>

          {/* VIEW ALL */}

          <Link
            to="/explore"
            className="
              group
              inline-flex
              w-fit
              shrink-0
              items-center
              justify-center
              gap-2
              rounded-full
              border border-[#ffcc42]/35
              bg-[#ffcc42]/5
              px-5 py-2.5
              text-[12px]
              font-semibold
              text-[#ffcc42]
              transition-all
              hover:border-[#ffcc42]
              hover:bg-[#ffcc42]/10
              focus-visible:outline
              focus-visible:outline-2
              focus-visible:outline-offset-2
              focus-visible:outline-[#ffcc42]
            "
          >
            Explore All Creators

            <ArrowRight
              size={15}
              className="
                transition-transform
                group-hover:translate-x-1
              "
              aria-hidden="true"
            />
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
          skeletonCount={FEATURED_CREATOR_LIMIT}
        />

        {/* ============================================= */}
        {/* BOTTOM CONTENT                                */}
        {/* ============================================= */}

        {!isLoading &&
          !error &&
          creators.length > 0 && (
            <div
              className="
                mt-10
                flex flex-col
                items-center
                justify-between
                gap-4
                border-t border-white/10
                pt-6
                text-center
                sm:flex-row
                sm:text-left
              "
            >
              <div className="flex items-center gap-2">
                <Sparkles
                  size={16}
                  className="text-[#ffcc42]"
                  aria-hidden="true"
                />

                <p className="text-xs text-zinc-400">
                  Discover genuine connections
                  with creators.
                </p>
              </div>

              <Link
                to="/explore"
                className="
                  inline-flex
                  items-center
                  gap-2
                  text-xs
                  font-semibold
                  text-[#ffcc42]
                  transition
                  hover:text-[#ffe27a]
                "
              >
                <Users
                  size={15}
                  aria-hidden="true"
                />

                Discover More

                <ArrowRight
                  size={14}
                  aria-hidden="true"
                />
              </Link>
            </div>
          )}
      </div>
    </section>
  );
}