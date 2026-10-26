import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useChatStore,
} from "../../store/useChatStore.js";

import {
  useAuthStore,
} from "../../store/useAuthStore.js";

import ConversationItem from "./ConversationItem.jsx";

import {
  getConversationId,
  getOtherParticipant,
  getParticipantName,
} from "./chat.utils.js";

/**
 * ============================================================
 * PREMIUMCHAT — CONVERSATION SIDEBAR
 * ============================================================
 *
 * Features:
 *
 * - Conversation listing
 * - Participant search
 * - Active conversation highlighting
 * - Refresh
 * - Loading skeletons
 * - Empty states
 * - Error handling
 *
 * Styling:
 *
 * PremiumChat dark theme.
 */

/**
 * ============================================================
 * SEARCH ICON
 * ============================================================
 */

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-4 w-4"
    >
      <circle
        cx="11"
        cy="11"
        r="7"
      />

      <path d="m20 20-4-4" />
    </svg>
  );
}

/**
 * ============================================================
 * REFRESH ICON
 * ============================================================
 */

function RefreshIcon({
  spinning = false,
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={[
        "h-4 w-4",
        spinning ? "animate-spin" : "",
      ].join(" ")}
    >
      <path d="M20 11a8 8 0 1 0-2.3 5.7" />

      <path d="M20 4v7h-7" />
    </svg>
  );
}

/**
 * ============================================================
 * EMPTY STATE ICON
 * ============================================================
 */

function EmptyChatIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-10 w-10"
    >
      <path
        d={[
          "M20 11.5a7.5 7.5 0 0 1-7.5 7.5",
          "H6l-3 2v-6.5A7.5 7.5 0 1 1",
          "20 11.5Z",
        ].join(" ")}
      />

      <path d="M8 11h8" />
      <path d="M8 14h5" />
    </svg>
  );
}

/**
 * ============================================================
 * LOADING SKELETON
 * ============================================================
 */

function ConversationSkeleton() {
  return (
    <div
      className={[
        "flex animate-pulse",
        "items-center gap-3",
        "rounded-2xl px-3 py-3",
      ].join(" ")}
    >
      <div
        className={[
          "h-12 w-12 shrink-0",
          "rounded-2xl bg-white/10",
        ].join(" ")}
      />

      <div className="flex-1 space-y-2">
        <div
          className={[
            "h-3 w-2/3",
            "rounded bg-white/10",
          ].join(" ")}
        />

        <div
          className={[
            "h-2.5 w-4/5",
            "rounded bg-white/5",
          ].join(" ")}
        />
      </div>
    </div>
  );
}

/**
 * ============================================================
 * CONVERSATION SIDEBAR
 * ============================================================
 */

export default function ConversationSidebar({
  className = "",
  onConversationSelect,
}) {
  /**
   * LOCAL STATE
   */

  const [searchQuery, setSearchQuery] =
    useState("");

  /**
   * AUTHENTICATED USER
   */

  const currentUser = useAuthStore(
    (state) => state.user
  );

  const currentUserId =
    currentUser?._id ??
    currentUser?.id ??
    null;

  /**
   * CHAT STORE STATE
   */

  const conversations = useChatStore(
    (state) => state.conversations
  );

  const activeConversationId =
    useChatStore(
      (state) =>
        state.activeConversationId
    );

  const isLoadingConversations =
    useChatStore(
      (state) =>
        state.isLoadingConversations
    );

  const conversationsError =
    useChatStore(
      (state) =>
        state.conversationsError
    );

  /**
   * CHAT STORE ACTIONS
   */

  const loadConversations =
    useChatStore(
      (state) =>
        state.loadConversations
    );

  const selectConversation =
    useChatStore(
      (state) =>
        state.selectConversation
    );

  /**
   * ========================================================
   * LOAD CONVERSATIONS ON MOUNT
   * ========================================================
   */

  useEffect(() => {
    if (!currentUserId) {
      return;
    }

    loadConversations();
  }, [
    currentUserId,
    loadConversations,
  ]);

  /**
   * ========================================================
   * FILTER CONVERSATIONS
   * ========================================================
   */

  const filteredConversations =
    useMemo(() => {
      const query =
        searchQuery
          .trim()
          .toLowerCase();

      if (!query) {
        return conversations;
      }

      return conversations.filter(
        (conversation) => {
          const participant =
            getOtherParticipant(
              conversation,
              currentUserId
            );

          const name =
            getParticipantName(
              participant
            ).toLowerCase();

          return name.includes(query);
        }
      );
    }, [
      conversations,
      currentUserId,
      searchQuery,
    ]);

  /**
   * ========================================================
   * HANDLE CONVERSATION SELECTION
   * ========================================================
   */

  const handleSelectConversation = async (
    conversationId
  ) => {
    if (!conversationId) {
      return;
    }

    /**
     * Open conversation in the chat store.
     */

    const conversation =
      await selectConversation(
        conversationId
      );

    if (conversation) {
      onConversationSelect?.(
        conversationId,
        conversation
      );
    }
  };

  /**
   * ========================================================
   * HANDLE REFRESH
   * ========================================================
   */

  const handleRefresh = () => {
    if (
      !currentUserId ||
      isLoadingConversations
    ) {
      return;
    }

    loadConversations();
  };

  /**
   * ========================================================
   * RENDER
   * ========================================================
   */

  return (
    <aside
      aria-label="Conversations"
      className={[
        "flex h-full min-h-0",
        "w-full flex-col",
        "border-r border-white/10",
        "bg-[#0c0c16]",
        className,
      ].join(" ")}
    >
      {/* HEADER */}

      <div
        className={[
          "border-b border-white/10",
          "px-5 pb-5 pt-6",
        ].join(" ")}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1
              className={[
                "text-xl font-bold",
                "tracking-tight text-white",
              ].join(" ")}
            >
              Messages
            </h1>

            <p
              className={[
                "mt-1 text-xs",
                "text-slate-400",
              ].join(" ")}
            >
              Your private conversations
            </p>
          </div>

          <button
            type="button"
            onClick={handleRefresh}
            disabled={
              isLoadingConversations ||
              !currentUserId
            }
            aria-label="Refresh conversations"
            title="Refresh conversations"
            className={[
              "flex h-9 w-9",
              "items-center justify-center",
              "rounded-xl",
              "border border-white/10",
              "bg-white/5",
              "text-slate-300",
              "transition-colors",
              "hover:bg-white/10",
              "hover:text-white",
              "disabled:cursor-not-allowed",
              "disabled:opacity-50",
            ].join(" ")}
          >
            <RefreshIcon
              spinning={
                isLoadingConversations
              }
            />
          </button>
        </div>

        {/* SEARCH */}

        <div className="relative mt-5">
          <span
            className={[
              "pointer-events-none",
              "absolute left-3 top-1/2",
              "-translate-y-1/2",
              "text-slate-500",
            ].join(" ")}
          >
            <SearchIcon />
          </span>

          <input
            type="search"
            value={searchQuery}
            onChange={(event) =>
              setSearchQuery(
                event.target.value
              )
            }
            placeholder="Search conversations..."
            aria-label="Search conversations"
            className={[
              "h-11 w-full rounded-xl",
              "border border-white/10",
              "bg-white/5",
              "pl-10 pr-4",
              "text-sm text-white",
              "placeholder:text-slate-500",
              "outline-none",
              "transition-colors",
              "focus:border-violet-500/50",
              "focus:ring-2",
              "focus:ring-violet-500/10",
            ].join(" ")}
          />
        </div>
      </div>

      {/* CONVERSATION COUNT */}

      <div
        className={[
          "flex items-center",
          "justify-between",
          "px-5 pb-3 pt-5",
        ].join(" ")}
      >
        <span
          className={[
            "text-[11px]",
            "font-semibold uppercase",
            "tracking-[0.15em]",
            "text-slate-500",
          ].join(" ")}
        >
          Recent conversations
        </span>

        <span
          className={[
            "rounded-full",
            "bg-white/5",
            "px-2 py-0.5",
            "text-[11px]",
            "text-slate-400",
          ].join(" ")}
        >
          {conversations.length}
        </span>
      </div>

      {/* CONVERSATION LIST */}

      <div
        className={[
          "min-h-0 flex-1",
          "overflow-y-auto",
          "px-3 pb-5",
        ].join(" ")}
      >
        {/* LOADING */}

        {isLoadingConversations &&
          conversations.length === 0 && (
            <div className="space-y-1">
              {Array.from({
                length: 5,
              }).map((_, index) => (
                <ConversationSkeleton
                  key={index}
                />
              ))}
            </div>
          )}

        {/* ERROR */}

        {!isLoadingConversations &&
          conversationsError && (
            <div
              role="alert"
              className={[
                "mx-2 mb-4",
                "rounded-2xl",
                "border border-rose-500/20",
                "bg-rose-500/10",
                "p-4",
              ].join(" ")}
            >
              <p
                className={[
                  "text-sm",
                  "text-rose-200",
                ].join(" ")}
              >
                {conversationsError}
              </p>

              <button
                type="button"
                onClick={handleRefresh}
                className={[
                  "mt-3 text-xs",
                  "font-semibold",
                  "text-rose-300",
                  "hover:text-rose-200",
                ].join(" ")}
              >
                Try again
              </button>
            </div>
          )}

        {/* EMPTY CONVERSATIONS */}

        {!isLoadingConversations &&
          !conversationsError &&
          conversations.length === 0 && (
            <div
              className={[
                "flex flex-col",
                "items-center",
                "px-6 py-14",
                "text-center",
              ].join(" ")}
            >
              <div
                className={[
                  "flex h-20 w-20",
                  "items-center",
                  "justify-center",
                  "rounded-3xl",
                  "bg-violet-500/10",
                  "text-violet-300",
                ].join(" ")}
              >
                <EmptyChatIcon />
              </div>

              <h2
                className={[
                  "mt-5 text-sm",
                  "font-semibold",
                  "text-white",
                ].join(" ")}
              >
                No conversations yet
              </h2>

              <p
                className={[
                  "mt-2 max-w-[230px]",
                  "text-xs leading-5",
                  "text-slate-400",
                ].join(" ")}
              >
                Discover creators and
                start a conversation.
                Your messages will
                appear here.
              </p>
            </div>
          )}

        {/* NO SEARCH RESULTS */}

        {!isLoadingConversations &&
          conversations.length > 0 &&
          filteredConversations.length === 0 && (
            <div
              className={[
                "px-6 py-12",
                "text-center",
              ].join(" ")}
            >
              <p
                className={[
                  "text-sm",
                  "font-medium",
                  "text-slate-300",
                ].join(" ")}
              >
                No matching conversations
              </p>

              <p
                className={[
                  "mt-2 text-xs",
                  "text-slate-500",
                ].join(" ")}
              >
                Try searching for
                another name.
              </p>
            </div>
          )}

        {/* CONVERSATION ITEMS */}

        {filteredConversations.length > 0 && (
          <div className="space-y-1">
            {filteredConversations.map(
              (conversation) => {
                const conversationId =
                  getConversationId(
                    conversation
                  );

                return (
                  <ConversationItem
                    key={
                      conversationId
                    }
                    conversation={
                      conversation
                    }
                    currentUserId={
                      currentUserId
                    }
                    isActive={
                      conversationId ===
                      activeConversationId
                    }
                    onSelect={
                      handleSelectConversation
                    }
                  />
                );
              }
            )}
          </div>
        )}
      </div>

      {/* FOOTER */}

      <div
        className={[
          "border-t border-white/10",
          "px-5 py-4",
        ].join(" ")}
      >
        <div
          className={[
            "flex items-center gap-2",
            "text-xs text-slate-500",
          ].join(" ")}
        >
          <span
            className={[
              "h-2 w-2 rounded-full",
              "bg-violet-400",
            ].join(" ")}
          />

          Private messaging
        </div>
      </div>
    </aside>
  );
}