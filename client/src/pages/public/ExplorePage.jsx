import { useEffect, useState } from "react";

import {
  Link,
  useSearchParams,
} from "react-router-dom";

import {
  Search,
  Users,
  Crown,
  ChevronLeft,
  ChevronRight,
  X,
  ShieldCheck,
  Sparkles,
  ArrowRight,
} from "lucide-react";

import CreatorGrid from "../../components/creator/CreatorGrid.jsx";

import {
  getPublicCreators,
} from "../../api/creator.api.js";

import { useAuthStore } from "../../store/useAuthStore.js";

/**
 * ============================================================
 * PREMIUMCHAT — EXPLORE CREATORS PAGE
 * ============================================================
 *
 * UI CLEANUP 1.3
 *
 * Improvements:
 * - Compact hero section
 * - Smaller typography
 * - Responsive search
 * - Cleaner results header
 * - Compact pagination
 * - Authentication-aware CTA
 *
 * Preserves:
 * - Existing creator discovery API
 * - URL search parameters
 * - Pagination
 * - Request cancellation
 * - Loading/error states
 * - Retry functionality
 * - Existing CreatorGrid
 */

const PAGE_LIMIT = 12;

const DEFAULT_PAGINATION = {
  page: 1,
  limit: PAGE_LIMIT,
  total: 0,
  totalPages: 0,
  hasNextPage: false,
  hasPreviousPage: false,
};

export default function ExplorePage() {
  /**
   * ==========================================================
   * URL SEARCH PARAMETERS
   * ==========================================================
   */

  const [searchParams, setSearchParams] =
    useSearchParams();

  const searchQuery = searchParams.get("q") || "";

  const requestedPage = Number(
    searchParams.get("page") || 1
  );

  const currentPage =
    Number.isSafeInteger(requestedPage) &&
    requestedPage > 0
      ? requestedPage
      : 1;

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
   * SYNC SEARCH INPUT WITH NAVBAR
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

      try {
        const response = await getPublicCreators({
          page: currentPage,
          limit: PAGE_LIMIT,
          search: searchQuery,
          sort: "newest",
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

        setCreators(result.creators);

        setPagination(
          result.pagination || {
            ...DEFAULT_PAGINATION,
            page: currentPage,
          }
        );
      } catch (requestError) {
        if (
          controller.signal.aborted ||
          requestError?.code === "ERR_CANCELED"
        ) {
          return;
        }

        console.error(
          "Explore creators error:",
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
  }, [currentPage, searchQuery, reloadKey]);

  /**
   * ==========================================================
   * SEARCH
   * ==========================================================
   */

  const handleSearch = (event) => {
    event.preventDefault();

    const normalizedQuery = searchInput.trim();

    const nextParams = new URLSearchParams();

    if (normalizedQuery) {
      nextParams.set("q", normalizedQuery);
    }

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
   * CHANGE PAGE
   * ==========================================================
   */

  const handlePageChange = (nextPage) => {
    if (
      nextPage < 1 ||
      nextPage > pagination.totalPages
    ) {
      return;
    }

    const nextParams = new URLSearchParams();

    if (searchQuery) {
      nextParams.set("q", searchQuery);
    }

    nextParams.set("page", String(nextPage));

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
   * RENDER
   * ==========================================================
   */

  return (
    <div className="min-h-screen bg-[#09090c] text-white">
      {/* ================================================= */}
      {/* HERO                                              */}
      {/* ================================================= */}

      <section className="relative overflow-hidden border-b border-white/10">
        {/* DECORATIVE GLOW */}

        <div
          aria-hidden="true"
          className={[
            "pointer-events-none absolute",
            "left-1/2 top-0",
            "h-64 w-64",
            "-translate-x-1/2",
            "rounded-full",
            "bg-[#ffcc42]/10",
            "blur-[100px]",
          ].join(" ")}
        />

        <div
          className={[
            "relative mx-auto",
            "max-w-[1280px]",
            "px-4 pb-10 pt-11",
            "sm:px-6 sm:pb-12 sm:pt-14",
            "lg:px-8",
          ].join(" ")}
        >
          <div className="mx-auto max-w-2xl text-center">
            {/* EYEBROW */}

            <div
              className={[
                "inline-flex items-center gap-2",
                "rounded-full",
                "border border-[#ffcc42]/20",
                "bg-[#ffcc42]/5",
                "px-3 py-1.5",
              ].join(" ")}
            >
              <Crown
                size={13}
                className="text-[#ffcc42]"
              />

              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#ffcc42]">
                PremiumChat Discovery
              </span>
            </div>

            {/* TITLE */}

            <h1
              className={[
                "mt-4",
                "text-[30px]",
                "font-extrabold",
                "tracking-tight",
                "sm:text-[36px]",
                "lg:text-[42px]",
              ].join(" ")}
            >
              Explore{" "}
              <span className="text-[#ffcc42]">
                Creators
              </span>
            </h1>

            {/* DESCRIPTION */}

            <p className="mx-auto mt-3 max-w-xl text-[13px] leading-6 text-zinc-400 sm:text-sm">
              Discover verified creators, explore their
              profiles, and start private conversations.
            </p>

            {/* SEARCH */}

            <form
              onSubmit={handleSearch}
              role="search"
              className={[
                "mx-auto mt-7",
                "flex max-w-xl",
                "items-center gap-2",
                "rounded-xl",
                "border border-white/15",
                "bg-[#17171c]",
                "p-1.5",
                "transition-colors",
                "focus-within:border-[#ffcc42]/60",
              ].join(" ")}
            >
              <Search
                size={17}
                className="ml-2 shrink-0 text-[#ffcc42]"
              />

              <input
                type="search"
                value={searchInput}
                onChange={(event) =>
                  setSearchInput(event.target.value)
                }
                placeholder="Search creators by name..."
                aria-label="Search creators"
                maxLength={100}
                className={[
                  "min-w-0 flex-1",
                  "bg-transparent",
                  "px-1 py-2",
                  "text-[12px]",
                  "text-white",
                  "outline-none",
                  "placeholder:text-zinc-500",
                  "sm:text-[13px]",
                ].join(" ")}
              />

              {searchInput && (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  aria-label="Clear search"
                  className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-white/10 hover:text-white"
                >
                  <X size={15} />
                </button>
              )}

              <button
                type="submit"
                className={[
                  "shrink-0",
                  "rounded-lg",
                  "bg-[#ffcc42]",
                  "px-3 py-2",
                  "text-[11px]",
                  "font-bold text-black",
                  "transition",
                  "hover:brightness-110",
                  "sm:px-5 sm:text-xs",
                ].join(" ")}
              >
                Search
              </button>
            </form>

            {/* TRUST LABEL */}

            <div className="mt-4 flex items-center justify-center gap-2 text-[11px] text-zinc-500">
              <ShieldCheck
                size={14}
                className="text-[#ffcc42]"
              />

              <span>
                Approved and age-verified creators
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================= */}
      {/* CREATOR RESULTS                                   */}
      {/* ================================================= */}

      <section
        className={[
          "mx-auto max-w-[1280px]",
          "px-4 py-9",
          "sm:px-6 sm:py-12",
          "lg:px-8",
        ].join(" ")}
      >
        {/* RESULTS HEADER */}

        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Sparkles
                size={14}
                className="text-[#ffcc42]"
              />

              <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#ffcc42]">
                Discover Connections
              </span>
            </div>

            <h2 className="text-xl font-bold sm:text-2xl">
              {searchQuery
                ? "Search Results"
                : "Discover Creators"}
            </h2>

            <p className="mt-2 text-[12px] leading-5 text-zinc-400 sm:text-[13px]">
              {isLoading
                ? "Loading creators..."
                : error
                  ? "Creator discovery is temporarily unavailable."
                  : searchQuery
                    ? `${pagination.total} creator(s) found for "${searchQuery}"`
                    : `${pagination.total} verified creator(s) available`}
            </p>
          </div>

          {!searchQuery && (
            <div className="flex items-center gap-2 text-[11px] text-zinc-500">
              <Users
                size={14}
                className="text-[#ffcc42]"
              />

              <span>
                Verified Creator Community
              </span>
            </div>
          )}
        </div>

        {/* EXISTING CREATOR GRID */}

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
          pagination.totalPages > 1 && (
            <nav
              aria-label="Creator pagination"
              className={[
                "mt-9 flex flex-col",
                "items-center justify-between",
                "gap-4",
                "border-t border-white/10",
                "pt-6",
                "sm:flex-row",
              ].join(" ")}
            >
              <p className="text-[12px] text-zinc-400">
                Page{" "}
                <span className="font-semibold text-white">
                  {pagination.page}
                </span>{" "}
                of{" "}
                <span className="font-semibold text-white">
                  {pagination.totalPages}
                </span>
              </p>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    handlePageChange(currentPage - 1)
                  }
                  disabled={
                    !pagination.hasPreviousPage
                  }
                  className={[
                    "inline-flex items-center gap-1.5",
                    "rounded-lg",
                    "border border-white/15",
                    "px-3 py-2",
                    "text-[11px] font-semibold",
                    "text-white",
                    "transition",
                    "hover:border-[#ffcc42]/50",
                    "disabled:cursor-not-allowed",
                    "disabled:opacity-40",
                  ].join(" ")}
                >
                  <ChevronLeft size={15} />
                  Previous
                </button>

                <button
                  type="button"
                  onClick={() =>
                    handlePageChange(currentPage + 1)
                  }
                  disabled={!pagination.hasNextPage}
                  className={[
                    "inline-flex items-center gap-1.5",
                    "rounded-lg",
                    "border border-[#ffcc42]/50",
                    "bg-[#ffcc42]/10",
                    "px-3 py-2",
                    "text-[11px] font-semibold",
                    "text-[#ffcc42]",
                    "transition",
                    "hover:bg-[#ffcc42]",
                    "hover:text-black",
                    "disabled:cursor-not-allowed",
                    "disabled:opacity-40",
                  ].join(" ")}
                >
                  Next
                  <ChevronRight size={15} />
                </button>
              </div>
            </nav>
          )}

        {/* ================================================= */}
        {/* BOTTOM CTA                                        */}
        {/* ================================================= */}

        <div
          className={[
            "mt-12",
            "rounded-2xl",
            "border border-[#ffcc42]/15",
            "bg-gradient-to-r",
            "from-[#1c1912]",
            "to-[#111115]",
            "px-5 py-7",
            "text-center",
            "sm:px-8 sm:py-9",
          ].join(" ")}
        >
          <Crown
            size={21}
            className="mx-auto text-[#ffcc42]"
          />

          <h3 className="mt-3 text-lg font-bold sm:text-xl">
            {isAuthenticated
              ? "Ready to Connect?"
              : "Join the PremiumChat Community"}
          </h3>

          <p className="mx-auto mt-2 max-w-lg text-[12px] leading-6 text-zinc-400 sm:text-[13px]">
            {isAuthenticated
              ? "Explore creator profiles and start a private conversation."
              : "Create your account to connect with verified creators through private conversations."}
          </p>

          <Link
            to={isAuthenticated ? "/messages" : "/register"}
            className={[
              "mt-5 inline-flex",
              "min-h-10",
              "items-center justify-center gap-2",
              "rounded-lg",
              "bg-[#ffcc42]",
              "px-5",
              "text-[12px] font-bold",
              "text-black",
              "transition",
              "hover:brightness-110",
            ].join(" ")}
          >
            {isAuthenticated
              ? "Open Messages"
              : "Join PremiumChat"}

            <ArrowRight size={15} />
          </Link>
        </div>
      </section>
    </div>
  );
}