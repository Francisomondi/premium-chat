import { useEffect, useState } from "react";

import {
  Link,
  useSearchParams,
} from "react-router-dom";

import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Crown,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from "lucide-react";

import CreatorGrid from "../../components/creator/CreatorGrid.jsx";

import {
  getPublicCreators,
} from "../../api/creator.api.js";

import { useAuthStore } from "../../store/useAuthStore.js";

/**
 * ============================================================
 * PREMIUMCHAT — EXPLORE CREATORS
 * ============================================================
 *
 * STEP 19.6
 *
 * Features:
 * - Public creator discovery
 * - URL-synchronized search
 * - Backend pagination
 * - Newest-first sorting
 * - Responsive creator grid
 * - Request cancellation
 * - Retry functionality
 * - Loading and empty states
 * - Authentication-aware CTA
 *
 * Preserves:
 * - Existing creator API
 * - Existing CreatorGrid
 * - Existing authentication store
 * - Existing URL query parameters
 *
 * No mock creator records.
 */

const PAGE_LIMIT = 12;

const MAX_SEARCH_LENGTH = 100;

const DEFAULT_PAGINATION = {
  page: 1,
  limit: PAGE_LIMIT,
  total: 0,
  totalPages: 0,
  hasNextPage: false,
  hasPreviousPage: false,
};

const SORT_OPTIONS = [
  {
    value: "newest",
    label: "Newest First",
  },
];

/**
 * ============================================================
 * PAGE COMPONENT
 * ============================================================
 */

export default function ExplorePage() {
  /**
   * ==========================================================
   * SEARCH PARAMETERS
   * ==========================================================
   */

  const [searchParams, setSearchParams] =
    useSearchParams();

  const searchQuery = (
    searchParams.get("q") || ""
  ).trim().slice(0, MAX_SEARCH_LENGTH);

  const requestedPage = Number(
    searchParams.get("page") || 1
  );

  const currentPage =
    Number.isSafeInteger(requestedPage) &&
    requestedPage > 0
      ? requestedPage
      : 1;

  // Only enable sorting modes supported by the backend.
  const sort = "newest";

  /**
   * ==========================================================
   * AUTHENTICATION
   * ==========================================================
   */

  const isAuthenticated = useAuthStore(
    (state) => state.isAuthenticated
  );

  /**
   * ==========================================================
   * STATE
   * ==========================================================
   */

  const [searchInput, setSearchInput] =
    useState(searchQuery);

  const [creators, setCreators] = useState([]);

  const [pagination, setPagination] = useState(
    DEFAULT_PAGINATION
  );

  const [isLoading, setIsLoading] = useState(true);

  const [error, setError] = useState(null);

  const [reloadKey, setReloadKey] = useState(0);

  /**
   * ==========================================================
   * SYNC SEARCH INPUT WITH URL
   * ==========================================================
   */

  useEffect(() => {
    setSearchInput(searchQuery);
  }, [searchQuery]);

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

      // Prevent showing results from a previous query
      // while the new request is loading.
      setCreators([]);
      setPagination(DEFAULT_PAGINATION);

      try {
        const response = await getPublicCreators({
          page: currentPage,
          limit: PAGE_LIMIT,
          search: searchQuery,
          sort,
          signal: controller.signal,
        });

        if (controller.signal.aborted) {
          return;
        }

        const result = response?.data;

        if (!Array.isArray(result?.creators)) {
          throw new Error(
            "Invalid creator discovery response."
          );
        }

        const nextPagination =
          result.pagination || {
            ...DEFAULT_PAGINATION,
            page: currentPage,
          };

        setCreators(result.creators);

        setPagination({
          ...DEFAULT_PAGINATION,
          ...nextPagination,
        });
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
          "[PremiumChat] Explore creators:",
          requestError
        );

        setError(
          "Unable to load creators. Please try again."
        );

        setCreators([]);
        setPagination(DEFAULT_PAGINATION);
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
  }, [currentPage, searchQuery, sort, reloadKey]);

  /**
   * ==========================================================
   * SEARCH
   * ==========================================================
   */

  const handleSearch = (event) => {
    event.preventDefault();

    const normalizedQuery = searchInput
      .trim()
      .slice(0, MAX_SEARCH_LENGTH);

    const nextParams = new URLSearchParams();

    if (normalizedQuery) {
      nextParams.set("q", normalizedQuery);
    }

    // Searching starts at page 1.
    setSearchParams(nextParams);
  };

  /**
   * ==========================================================
   * CLEAR SEARCH
   * ==========================================================
   */

  const handleClearSearch = () => {
    setSearchInput("");

    setSearchParams(new URLSearchParams());
  };

  /**
   * ==========================================================
   * PAGINATION
   * ==========================================================
   */

  const handlePageChange = (nextPage) => {
    if (
      !Number.isSafeInteger(nextPage) ||
      nextPage < 1 ||
      nextPage > pagination.totalPages ||
      nextPage === currentPage
    ) {
      return;
    }

    const nextParams = new URLSearchParams();

    if (searchQuery) {
      nextParams.set("q", searchQuery);
    }

    if (nextPage > 1) {
      nextParams.set("page", String(nextPage));
    }

    setSearchParams(nextParams);

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  /**
   * ==========================================================
   * RETRY
   * ==========================================================
   */

  const handleRetry = () => {
    setReloadKey((previous) => previous + 1);
  };

  /**
   * ==========================================================
   * RESULT INFORMATION
   * ==========================================================
   */

  const totalCreators = Number.isFinite(
    Number(pagination.total)
  )
    ? Math.max(0, Number(pagination.total))
    : 0;

  const totalPages = Number.isSafeInteger(
    Number(pagination.totalPages)
  )
    ? Math.max(0, Number(pagination.totalPages))
    : 0;

  const hasPreviousPage =
    pagination.hasPreviousPage === true;

  const hasNextPage =
    pagination.hasNextPage === true;

  const resultsDescription = isLoading
    ? "Loading creators..."
    : error
      ? "Creator discovery is temporarily unavailable."
      : searchQuery
        ? `${totalCreators} creator(s) found for "${searchQuery}"`
        : `${totalCreators} creator(s) available`;

  /**
   * ==========================================================
   * RENDER
   * ==========================================================
   */

  return (
    <div className="min-h-screen bg-[#09090c] text-white">
      {/* ================================================= */}
      {/* HERO                                              */}
      {/* ================================================= */}

      <section className="relative overflow-hidden border-b border-white/10">
        {/* BACKGROUND GLOW */}

        <div
          aria-hidden="true"
          className="
            pointer-events-none
            absolute left-1/2 top-0
            h-64 w-64
            -translate-x-1/2
            rounded-full
            bg-[#ffcc42]/10
            blur-[100px]
          "
        />

        <div className="relative mx-auto max-w-[1280px] px-4 pb-10 pt-12 sm:px-6 sm:pb-12 sm:pt-16 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            {/* EYEBROW */}

            <div className="inline-flex items-center gap-2 rounded-full border border-[#ffcc42]/20 bg-[#ffcc42]/5 px-3 py-1.5">
              <Crown
                size={14}
                className="text-[#ffcc42]"
                aria-hidden="true"
              />

              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#ffcc42]">
                PremiumChat Discovery
              </span>
            </div>

            {/* TITLE */}

            <h1 className="mt-5 text-[32px] font-extrabold tracking-tight sm:text-[40px] lg:text-[46px]">
              Explore{" "}
              <span className="text-[#ffcc42]">
                Creators
              </span>
            </h1>

            {/* DESCRIPTION */}

            <p className="mx-auto mt-4 max-w-xl text-[13px] leading-7 text-zinc-400 sm:text-sm">
              Discover creators, explore their profiles,
              and find people you'd love to connect with.
            </p>

            {/* SEARCH FORM */}

            <form
              onSubmit={handleSearch}
              role="search"
              className="
                mx-auto mt-8
                flex max-w-xl items-center gap-2
                rounded-xl
                border border-white/15
                bg-[#17171c]
                p-1.5
                transition-colors
                focus-within:border-[#ffcc42]/60
              "
            >
              <Search
                size={18}
                className="ml-2 shrink-0 text-[#ffcc42]"
                aria-hidden="true"
              />

              <input
                type="search"
                value={searchInput}
                onChange={(event) =>
                  setSearchInput(event.target.value)
                }
                placeholder="Search creators..."
                aria-label="Search creators"
                maxLength={MAX_SEARCH_LENGTH}
                className="
                  min-w-0 flex-1
                  bg-transparent
                  px-1 py-2
                  text-xs text-white
                  outline-none
                  placeholder:text-zinc-500
                  sm:text-sm
                "
              />

              {searchInput && (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  aria-label="Clear search"
                  className="rounded-lg p-2 text-zinc-400 transition hover:bg-white/10 hover:text-white"
                >
                  <X
                    size={16}
                    aria-hidden="true"
                  />
                </button>
              )}

              <button
                type="submit"
                className="
                  shrink-0 rounded-lg
                  bg-[#ffcc42]
                  px-4 py-2.5
                  text-xs font-bold
                  text-black
                  transition
                  hover:brightness-110
                  focus-visible:outline
                  focus-visible:outline-2
                  focus-visible:outline-offset-2
                  focus-visible:outline-[#ffcc42]
                  sm:px-6
                "
              >
                Search
              </button>
            </form>

            {/* TRUST LABEL */}

            <div className="mt-5 flex items-center justify-center gap-2 text-[11px] text-zinc-500">
              <ShieldCheck
                size={14}
                className="text-[#ffcc42]"
                aria-hidden="true"
              />

              <span>
                Discover approved creator profiles
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================= */}
      {/* CREATOR RESULTS                                   */}
      {/* ================================================= */}

      <section
        aria-labelledby="creator-results-title"
        className="mx-auto max-w-[1280px] px-4 py-10 sm:px-6 sm:py-12 lg:px-8"
      >
        {/* RESULTS HEADER */}

        <div className="mb-7 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Sparkles
                size={14}
                className="text-[#ffcc42]"
                aria-hidden="true"
              />

              <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#ffcc42]">
                Discover Connections
              </span>
            </div>

            <h2
              id="creator-results-title"
              className="text-xl font-bold sm:text-2xl"
            >
              {searchQuery
                ? "Search Results"
                : "Discover Creators"}
            </h2>

            <p
              role="status"
              aria-live="polite"
              className="mt-2 text-xs leading-6 text-zinc-400 sm:text-[13px]"
            >
              {resultsDescription}
            </p>
          </div>

          {/* SORT CONTROL */}

          <div className="flex items-center gap-3">
            <label
              htmlFor="creator-sort"
              className="text-xs font-medium text-zinc-400"
            >
              Sort by
            </label>

            <select
              id="creator-sort"
              value={sort}
              disabled={SORT_OPTIONS.length === 1}
              onChange={() => {}}
              className="
                rounded-lg
                border border-white/15
                bg-[#17171c]
                px-3 py-2
                text-xs text-white
                outline-none
                focus:border-[#ffcc42]/60
                disabled:cursor-default
                disabled:opacity-75
              "
            >
              {SORT_OPTIONS.map((option) => (
                <option
                  key={option.value}
                  value={option.value}
                >
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* ACTIVE SEARCH */}

        {searchQuery && (
          <div className="mb-6 flex flex-wrap items-center gap-2">
            <span className="text-xs text-zinc-500">
              Searching for:
            </span>

            <button
              type="button"
              onClick={handleClearSearch}
              className="
                inline-flex items-center gap-2
                rounded-full
                border border-[#ffcc42]/25
                bg-[#ffcc42]/10
                px-3 py-1.5
                text-xs text-[#ffcc42]
                transition
                hover:border-[#ffcc42]/60
              "
            >
              <span className="max-w-[220px] truncate">
                {searchQuery}
              </span>

              <X
                size={13}
                aria-hidden="true"
              />

              <span className="sr-only">
                Clear search
              </span>
            </button>
          </div>
        )}

        {/* CREATOR GRID */}

        <CreatorGrid
          creators={creators}
          isLoading={isLoading}
          error={error}
          onRetry={handleRetry}
          skeletonCount={PAGE_LIMIT}
        />

        {/* ================================================= */}
        {/* PAGINATION                                        */}
        {/* ================================================= */}

        {!isLoading &&
          !error &&
          totalPages > 1 && (
            <nav
              aria-label="Creator pagination"
              className="
                mt-10
                flex flex-col items-center
                justify-between gap-4
                border-t border-white/10
                pt-6
                sm:flex-row
              "
            >
              <p className="text-xs text-zinc-400">
                Page{" "}
                <span className="font-semibold text-white">
                  {pagination.page}
                </span>{" "}
                of{" "}
                <span className="font-semibold text-white">
                  {totalPages}
                </span>
              </p>

              <div className="flex items-center gap-2">
                {/* PREVIOUS */}

                <button
                  type="button"
                  onClick={() =>
                    handlePageChange(currentPage - 1)
                  }
                  disabled={!hasPreviousPage}
                  className="
                    inline-flex items-center gap-2
                    rounded-lg
                    border border-white/15
                    px-4 py-2.5
                    text-xs font-semibold
                    text-white
                    transition
                    hover:border-[#ffcc42]/50
                    disabled:cursor-not-allowed
                    disabled:opacity-40
                  "
                >
                  <ChevronLeft
                    size={16}
                    aria-hidden="true"
                  />

                  Previous
                </button>

                {/* NEXT */}

                <button
                  type="button"
                  onClick={() =>
                    handlePageChange(currentPage + 1)
                  }
                  disabled={!hasNextPage}
                  className="
                    inline-flex items-center gap-2
                    rounded-lg
                    border border-[#ffcc42]/50
                    bg-[#ffcc42]/10
                    px-4 py-2.5
                    text-xs font-semibold
                    text-[#ffcc42]
                    transition
                    hover:bg-[#ffcc42]
                    hover:text-black
                    disabled:cursor-not-allowed
                    disabled:opacity-40
                  "
                >
                  Next

                  <ChevronRight
                    size={16}
                    aria-hidden="true"
                  />
                </button>
              </div>
            </nav>
          )}

        {/* ================================================= */}
        {/* BOTTOM CTA                                        */}
        {/* ================================================= */}

        <div
          className="
            mt-12
            rounded-2xl
            border border-[#ffcc42]/15
            bg-gradient-to-r
            from-[#1c1912]
            to-[#111115]
            px-5 py-8
            text-center
            sm:px-8 sm:py-10
          "
        >
          <Crown
            size={22}
            className="mx-auto text-[#ffcc42]"
            aria-hidden="true"
          />

          <h3 className="mt-4 text-xl font-bold">
            {isAuthenticated
              ? "Ready to Connect?"
              : "Join the PremiumChat Community"}
          </h3>

          <p className="mx-auto mt-3 max-w-lg text-[13px] leading-6 text-zinc-400">
            {isAuthenticated
              ? "Discover creator profiles and start meaningful private conversations."
              : "Create your PremiumChat account and discover a new way to connect with creators."}
          </p>

          <Link
            to={
              isAuthenticated
                ? "/messages"
                : "/register"
            }
            className="
              mt-6
              inline-flex min-h-11
              items-center justify-center
              gap-2
              rounded-full
              bg-[#ffcc42]
              px-6
              text-xs font-bold
              text-black
              transition
              hover:brightness-110
            "
          >
            {isAuthenticated
              ? "Open Messages"
              : "Join PremiumChat"}

            <ArrowRight
              size={16}
              aria-hidden="true"
            />
          </Link>
        </div>
      </section>
    </div>
  );
}