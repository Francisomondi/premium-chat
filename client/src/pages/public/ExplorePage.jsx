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
} from "lucide-react";

import CreatorGrid from "../../components/creator/CreatorGrid.jsx";

import {
  getPublicCreators,
} from "../../api/creator.api.js";

/**
 * ============================================================
 * PREMIUMCHAT — EXPLORE CREATORS PAGE
 * ============================================================
 *
 * STEP 4.2.5.1
 *
 * Features:
 * - Public creator discovery
 * - Search by display name
 * - URL search parameter synchronization
 * - Pagination
 * - Responsive creator cards
 * - Loading and error states
 * - Retry functionality
 *
 * API:
 *
 * GET /api/creators
 */

const PAGE_LIMIT = 12;

export default function ExplorePage() {
  /**
   * ==========================================================
   * URL SEARCH PARAMETERS
   * ==========================================================
   */

  const [searchParams, setSearchParams] =
    useSearchParams();

  const searchQuery =
    searchParams.get("q") || "";

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
   * STATE
   * ==========================================================
   */

  const [searchInput, setSearchInput] =
    useState(searchQuery);

  const [creators, setCreators] = useState([]);

  const [pagination, setPagination] = useState({
    page: 1,
    limit: PAGE_LIMIT,
    total: 0,
    totalPages: 0,
    hasNextPage: false,
    hasPreviousPage: false,
  });

  const [isLoading, setIsLoading] =
    useState(true);

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
            page: currentPage,
            limit: PAGE_LIMIT,
            total: 0,
            totalPages: 0,
            hasNextPage: false,
            hasPreviousPage: false,
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
  }, [
    currentPage,
    searchQuery,
    reloadKey,
  ]);

  /**
   * ==========================================================
   * SEARCH
   * ==========================================================
   */

  const handleSearch = (event) => {
    event.preventDefault();

    const normalizedQuery =
      searchInput.trim();

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

    nextParams.set(
      "page",
      String(nextPage)
    );

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
      {/* ==================================================== */}
      {/* HERO SECTION                                         */}
      {/* ==================================================== */}

      <section className="relative overflow-hidden border-b border-white/10">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-0 h-80 w-80 -translate-x-1/2 rounded-full bg-[#ffcc42]/10 blur-[120px]"
        />

        <div className="relative mx-auto max-w-[1500px] px-4 pb-12 pt-14 sm:px-6 sm:pb-16 sm:pt-20 lg:px-10">
          <div className="mx-auto max-w-3xl text-center">
            {/* EYEBROW */}

            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#ffcc42]/20 bg-[#ffcc42]/5 px-4 py-2">
              <Crown
                size={15}
                className="text-[#ffcc42]"
              />

              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#ffcc42]">
                PremiumChat Discovery
              </span>
            </div>

            {/* TITLE */}

            <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl">
              Explore{" "}
              <span className="text-[#ffcc42]">
                Creators
              </span>
            </h1>

            <p className="mx-auto mt-5 max-w-2xl text-sm leading-7 text-zinc-400 sm:text-base">
              Discover verified creators, explore their
              profiles, and connect through private
              conversations.
            </p>

            {/* SEARCH */}

            <form
              onSubmit={handleSearch}
              role="search"
              className="mx-auto mt-9 flex max-w-2xl items-center gap-2 rounded-2xl border border-white/15 bg-[#17171c] p-2 shadow-xl transition focus-within:border-[#ffcc42]/60"
            >
              <Search
                size={20}
                className="ml-3 shrink-0 text-[#ffcc42]"
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
                className="min-w-0 flex-1 bg-transparent px-2 py-3 text-sm text-white outline-none placeholder:text-zinc-500"
              />

              {searchInput && (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  aria-label="Clear search"
                  className="rounded-lg p-2 text-zinc-400 transition hover:bg-white/10 hover:text-white"
                >
                  <X size={17} />
                </button>
              )}

              <button
                type="submit"
                className="shrink-0 rounded-xl bg-[#ffcc42] px-4 py-3 text-xs font-bold text-black transition hover:brightness-110 sm:px-6 sm:text-sm"
              >
                Search
              </button>
            </form>

            {/* TRUST LABEL */}

            <div className="mt-6 flex items-center justify-center gap-2 text-xs text-zinc-500">
              <ShieldCheck
                size={16}
                className="text-[#ffcc42]"
              />

              <span>
                Approved and age-verified creators
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ==================================================== */}
      {/* CREATOR RESULTS                                      */}
      {/* ==================================================== */}

      <section className="mx-auto max-w-[1500px] px-4 py-12 sm:px-6 sm:py-16 lg:px-10">
        {/* SECTION HEADER */}

        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-2">
              <Sparkles
                size={16}
                className="text-[#ffcc42]"
              />

              <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#ffcc42]">
                Discover Connections
              </span>
            </div>

            <h2 className="text-2xl font-bold sm:text-3xl">
              {searchQuery
                ? "Search Results"
                : "Discover Creators"}
            </h2>

            <p className="mt-2 text-sm text-zinc-400">
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
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <Users
                size={16}
                className="text-[#ffcc42]"
              />

              <span>
                Verified Creator Community
              </span>
            </div>
          )}
        </div>

        {/* CREATOR GRID */}

        <CreatorGrid
          creators={creators}
          isLoading={isLoading}
          error={error}
          onRetry={handleRetry}
          skeletonCount={PAGE_LIMIT}
        />

        {/* ================================================== */}
        {/* PAGINATION                                         */}
        {/* ================================================== */}

        {!isLoading &&
          !error &&
          pagination.totalPages > 1 && (
            <nav
              aria-label="Creator pagination"
              className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-8 sm:flex-row"
            >
              <p className="text-xs text-zinc-400">
                Page{" "}
                <span className="font-semibold text-white">
                  {pagination.page}
                </span>{" "}
                of{" "}
                <span className="font-semibold text-white">
                  {pagination.totalPages}
                </span>
              </p>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() =>
                    handlePageChange(currentPage - 1)
                  }
                  disabled={
                    !pagination.hasPreviousPage
                  }
                  className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-4 py-2.5 text-xs font-semibold text-white transition hover:border-[#ffcc42]/50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft size={16} />
                  Previous
                </button>

                <button
                  type="button"
                  onClick={() =>
                    handlePageChange(currentPage + 1)
                  }
                  disabled={
                    !pagination.hasNextPage
                  }
                  className="inline-flex items-center gap-2 rounded-lg border border-[#ffcc42]/50 bg-[#ffcc42]/10 px-4 py-2.5 text-xs font-semibold text-[#ffcc42] transition hover:bg-[#ffcc42] hover:text-black disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                  <ChevronRight size={16} />
                </button>
              </div>
            </nav>
          )}

        {/* ================================================== */}
        {/* BOTTOM CTA                                         */}
        {/* ================================================== */}

        <div className="mt-16 rounded-2xl border border-[#ffcc42]/15 bg-gradient-to-r from-[#1c1912] to-[#111115] px-5 py-9 text-center sm:px-8">
          <Crown
            size={24}
            className="mx-auto text-[#ffcc42]"
          />

          <h3 className="mt-4 text-xl font-bold sm:text-2xl">
            Join the PremiumChat Community
          </h3>

          <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-zinc-400">
            Create your account to connect with
            verified creators through private
            conversations.
          </p>

          <Link
            to="/register"
            className="mt-6 inline-flex items-center justify-center rounded-lg bg-[#ffcc42] px-6 py-3 text-sm font-bold text-black transition hover:brightness-110"
          >
            Join PremiumChat
          </Link>
        </div>
      </section>
    </div>
  );
}