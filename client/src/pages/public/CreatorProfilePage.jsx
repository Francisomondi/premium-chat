import { useEffect, useRef, useState } from "react";

import {
  Link,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";

import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  Crown,
  LockKeyhole,
  MessageCircle,
  ShieldCheck,
  UserRound,
  RefreshCw,
  AlertCircle,
  Users,
} from "lucide-react";

import {
  getPublicCreatorProfile,
} from "../../api/creator.api.js";

import { useAuthStore } from "../../store/useAuthStore.js";
import { useChatStore } from "../../store/useChatStore.js";

/**
 * ============================================================
 * PREMIUMCHAT — PUBLIC CREATOR PROFILE
 * ============================================================
 *
 * UI CLEANUP 1.4
 *
 * Improvements:
 * - Compact responsive layout
 * - Smaller typography
 * - Refined creator image
 * - Cleaner verification badge
 * - Compact profile information cards
 * - Improved action buttons
 * - Reduced unnecessary spacing
 *
 * Preserves:
 * - Public creator profile API
 * - AbortController cancellation
 * - Loading and error states
 * - Retry functionality
 * - Authentication redirect
 * - Start Chat integration
 * - Conversation validation
 * - Self-chat prevention
 *
 * No fictional creator statistics or biography.
 */

/**
 * ============================================================
 * LOADING SKELETON
 * ============================================================
 */

function CreatorProfileSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading creator profile"
      className="mx-auto max-w-[1120px] px-4 py-8 sm:px-6 lg:px-8"
    >
      <div className="mb-6 h-4 w-28 animate-pulse rounded bg-white/10" />

      <div className="grid gap-7 md:grid-cols-[300px_minmax(0,1fr)] lg:gap-10">
        <div className="mx-auto aspect-[4/5] w-full max-w-[340px] animate-pulse rounded-2xl bg-[#202026] md:mx-0" />

        <div className="space-y-5">
          <div className="h-7 w-36 animate-pulse rounded-full bg-[#ffcc42]/10" />

          <div className="h-9 w-3/4 animate-pulse rounded bg-white/10" />

          <div className="h-4 w-1/2 animate-pulse rounded bg-white/10" />

          <div className="h-20 animate-pulse rounded-xl bg-white/5" />

          <div className="h-10 w-44 animate-pulse rounded-lg bg-[#ffcc42]/20" />
        </div>
      </div>

      <span className="sr-only">
        Loading creator profile...
      </span>
    </div>
  );
}

/**
 * ============================================================
 * CREATOR AVATAR
 * ============================================================
 */

function CreatorProfileAvatar({
  avatarUrl,
  displayName,
}) {
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    setImageError(false);
  }, [avatarUrl]);

  const hasImage =
    typeof avatarUrl === "string" &&
    avatarUrl.trim().length > 0 &&
    !imageError;

  return (
    <div
      className={[
        "relative",
        "mx-auto w-full max-w-[340px]",
        "aspect-[4/5]",
        "overflow-hidden",
        "rounded-2xl",
        "border border-[#ffcc42]/20",
        "bg-[#15151a]",
        "shadow-[0_15px_50px_rgba(0,0,0,0.3)]",
        "md:mx-0",
      ].join(" ")}
    >
      {hasImage ? (
        <img
          src={avatarUrl}
          alt={`${displayName}'s profile`}
          className="h-full w-full object-cover"
          onError={() => setImageError(true)}
        />
      ) : (
        <div
          className={[
            "flex h-full w-full",
            "flex-col items-center justify-center",
            "bg-gradient-to-br",
            "from-[#342915]",
            "via-[#1a1a20]",
            "to-[#09090c]",
          ].join(" ")}
        >
          <div
            className={[
              "flex h-24 w-24",
              "items-center justify-center",
              "rounded-full",
              "border border-[#ffcc42]/25",
              "bg-[#ffcc42]/10",
              "sm:h-28 sm:w-28",
            ].join(" ")}
          >
            <UserRound
              size={52}
              strokeWidth={1.2}
              className="text-[#ffcc42]/70"
            />
          </div>

          <Crown
            size={23}
            className="mt-5 text-[#ffcc42]/40"
          />
        </div>
      )}

      {/* IMAGE GRADIENT */}

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

      {/* IMAGE LABEL */}

      <div className="absolute bottom-4 left-4 right-4 flex items-center gap-2">
        <Crown
          size={15}
          className="text-[#ffcc42]"
        />

        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white">
          PremiumChat Creator
        </span>
      </div>
    </div>
  );
}

/**
 * ============================================================
 * ERROR STATE
 * ============================================================
 */

function CreatorProfileError({
  message,
  onRetry,
}) {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full border border-red-500/20 bg-red-500/5">
        <AlertCircle
          size={27}
          className="text-[#ffcc42]"
        />
      </div>

      <h1 className="mt-5 text-xl font-bold text-white sm:text-2xl">
        Creator Unavailable
      </h1>

      <p className="mt-3 text-[13px] leading-6 text-zinc-400">
        {message}
      </p>

      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {typeof onRetry === "function" && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#ffcc42]/40 px-4 text-[12px] font-semibold text-[#ffcc42] transition hover:bg-[#ffcc42]/10"
          >
            <RefreshCw size={15} />
            Try Again
          </button>
        )}

        <Link
          to="/explore"
          className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#ffcc42] px-4 text-[12px] font-bold text-black transition hover:brightness-110"
        >
          <ArrowLeft size={15} />
          Explore Creators
        </Link>
      </div>
    </div>
  );
}

/**
 * ============================================================
 * PROFILE INFORMATION CARD
 * ============================================================
 */

function ProfileInfoCard({
  icon: Icon,
  title,
  description,
}) {
  return (
    <div
      className={[
        "flex items-start gap-3",
        "rounded-xl",
        "border border-white/10",
        "bg-[#15151a]",
        "p-4",
        "transition-colors",
        "hover:border-[#ffcc42]/20",
      ].join(" ")}
    >
      <div
        className={[
          "flex h-9 w-9 shrink-0",
          "items-center justify-center",
          "rounded-lg",
          "bg-[#ffcc42]/10",
          "text-[#ffcc42]",
        ].join(" ")}
      >
        <Icon size={18} />
      </div>

      <div className="min-w-0">
        <h3 className="text-[13px] font-semibold text-white">
          {title}
        </h3>

        <p className="mt-1 text-[11px] leading-5 text-zinc-400">
          {description}
        </p>
      </div>
    </div>
  );
}

/**
 * ============================================================
 * PUBLIC CREATOR PROFILE PAGE
 * ============================================================
 */

export default function CreatorProfilePage() {
  /**
   * ==========================================================
   * ROUTING
   * ==========================================================
   */

  const { creatorId } = useParams();

  const navigate = useNavigate();

  const location = useLocation();

  /**
   * ==========================================================
   * AUTH STORE
   * ==========================================================
   */

  const isAuthenticated = useAuthStore(
    (state) => state.isAuthenticated
  );

  const currentUser = useAuthStore(
    (state) => state.user
  );

  /**
   * ==========================================================
   * CHAT STORE
   * ==========================================================
   */

  const openConversationWithCreator = useChatStore(
    (state) => state.openConversationWithCreator
  );

  /**
   * ==========================================================
   * CHAT STATE
   * ==========================================================
   */

  const [isStartingChat, setIsStartingChat] =
    useState(false);

  const [startChatError, setStartChatError] =
    useState(null);

  const startingChatRef = useRef(false);

  /**
   * ==========================================================
   * CURRENT USER
   * ==========================================================
   */

  const currentUserId = String(
    currentUser?._id ?? currentUser?.id ?? ""
  ).toLowerCase();

  const isOwnProfile =
    Boolean(currentUserId) &&
    currentUserId === String(creatorId).toLowerCase();

  /**
   * ==========================================================
   * PROFILE STATE
   * ==========================================================
   */

  const [creator, setCreator] = useState(null);

  const [isLoading, setIsLoading] = useState(true);

  const [error, setError] = useState(null);

  const [isNotFound, setIsNotFound] = useState(false);

  const [reloadKey, setReloadKey] = useState(0);

  /**
   * ==========================================================
   * FETCH CREATOR PROFILE
   * ==========================================================
   */

  useEffect(() => {
    const controller = new AbortController();

    const fetchCreator = async () => {
      setIsLoading(true);
      setError(null);
      setIsNotFound(false);
      setCreator(null);
      setStartChatError(null);

      try {
        const response = await getPublicCreatorProfile(
          creatorId,
          {
            signal: controller.signal,
          }
        );

        if (controller.signal.aborted) {
          return;
        }

        const fetchedCreator =
          response?.data?.creator;

        if (!fetchedCreator?.id) {
          throw new Error(
            "Invalid creator profile response."
          );
        }

        setCreator(fetchedCreator);
      } catch (requestError) {
        if (
          controller.signal.aborted ||
          requestError?.code === "ERR_CANCELED"
        ) {
          return;
        }

        const status =
          requestError?.response?.status;

        if (status === 404) {
          setIsNotFound(true);

          setError(
            "This creator profile could not be found or is no longer available."
          );
        } else {
          console.error(
            "Creator profile error:",
            requestError
          );

          setError(
            "We couldn't load this creator profile. Please try again."
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    };

    if (creatorId) {
      fetchCreator();
    } else {
      setCreator(null);
      setError("Invalid creator profile.");
      setIsLoading(false);
    }

    return () => {
      controller.abort();
    };
  }, [creatorId, reloadKey]);

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
   * START CHAT
   * ==========================================================
   *
   * Preserve existing working conversation flow.
   */

  const handleStartChat = async () => {
    if (startingChatRef.current) {
      return;
    }

    setStartChatError(null);

    if (!creator?.id || creator.id !== creatorId) {
      setStartChatError(
        "Invalid creator profile."
      );

      return;
    }

    if (!isAuthenticated) {
      navigate("/login", {
        state: {
          from: `${location.pathname}${location.search}`,
        },
      });

      return;
    }

    if (isOwnProfile) {
      setStartChatError(
        "You cannot start a conversation with yourself."
      );

      return;
    }

    startingChatRef.current = true;
    setIsStartingChat(true);

    try {
      const conversation =
        await openConversationWithCreator(creatorId);

      const chatState = useChatStore.getState();

      const conversationId = String(
        conversation?._id ?? conversation?.id ?? ""
      ).toLowerCase();

      const selectedId = String(
        chatState.activeConversationId ?? ""
      ).toLowerCase();

      const loadedId = String(
        chatState.activeConversation?._id ??
          chatState.activeConversation?.id ??
          ""
      ).toLowerCase();

      if (
        !conversationId ||
        selectedId !== conversationId ||
        loadedId !== conversationId ||
        chatState.conversationError
      ) {
        throw new Error(
          chatState.conversationError ||
            "Unable to open the conversation."
        );
      }

      navigate("/messages");
    } catch (chatError) {
      setStartChatError(
        chatError?.message ||
          "Unable to start chat. Please try again."
      );
    } finally {
      startingChatRef.current = false;
      setIsStartingChat(false);
    }
  };

  /**
   * ==========================================================
   * LOADING STATE
   * ==========================================================
   */

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#09090c]">
        <CreatorProfileSkeleton />
      </div>
    );
  }

  /**
   * ==========================================================
   * ERROR STATE
   * ==========================================================
   */

  if (error || !creator) {
    return (
      <div className="min-h-screen bg-[#09090c]">
        <CreatorProfileError
          message={
            error || "Creator unavailable."
          }
          onRetry={
            isNotFound ? undefined : handleRetry
          }
        />
      </div>
    );
  }

  /**
   * ==========================================================
   * CREATOR DATA
   * ==========================================================
   */

  const displayName =
    typeof creator.displayName === "string" &&
    creator.displayName.trim()
      ? creator.displayName.trim()
      : "PremiumChat Creator";

  const joinedAt =
    creator.joinedAt &&
    !Number.isNaN(
      new Date(creator.joinedAt).getTime()
    )
      ? new Date(
          creator.joinedAt
        ).toLocaleDateString(undefined, {
          month: "long",
          year: "numeric",
        })
      : null;

  /**
   * ==========================================================
   * RENDER
   * ==========================================================
   */

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#09090c] text-white">
      {/* BACKGROUND GLOW */}

      <div
        aria-hidden="true"
        className={[
          "pointer-events-none absolute",
          "left-1/2 top-12",
          "h-72 w-72",
          "-translate-x-1/2",
          "rounded-full",
          "bg-[#ffcc42]/5",
          "blur-[100px]",
        ].join(" ")}
      />

      <div className="relative mx-auto max-w-[1120px] px-4 py-7 sm:px-6 sm:py-9 lg:px-8">
        {/* =============================================== */}
        {/* BACK NAVIGATION                                 */}
        {/* =============================================== */}

        <Link
          to="/explore"
          className="mb-6 inline-flex items-center gap-2 text-[12px] font-medium text-zinc-400 transition hover:text-[#ffcc42]"
        >
          <ArrowLeft size={15} />
          Back to Explore
        </Link>

        {/* =============================================== */}
        {/* PROFILE LAYOUT                                  */}
        {/* =============================================== */}

        <div className="grid items-start gap-7 md:grid-cols-[300px_minmax(0,1fr)] lg:gap-10">
          {/* CREATOR IMAGE */}

          <CreatorProfileAvatar
            avatarUrl={creator.avatarUrl}
            displayName={displayName}
          />

          {/* CREATOR INFORMATION */}

          <div className="min-w-0 py-1">
            {/* CREATOR LABEL */}

            <div
              className={[
                "inline-flex items-center gap-2",
                "rounded-full",
                "border border-[#ffcc42]/25",
                "bg-[#ffcc42]/10",
                "px-3 py-1.5",
              ].join(" ")}
            >
              <Crown
                size={13}
                className="text-[#ffcc42]"
              />

              <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#ffcc42]">
                PremiumChat Creator
              </span>
            </div>

            {/* NAME */}

            <h1 className="mt-4 break-words text-[30px] font-extrabold leading-tight tracking-tight text-white sm:text-[36px] lg:text-[40px]">
              {displayName}
            </h1>

            {/* VERIFIED BADGE */}

            {creator.isVerified && (
              <div className="mt-3 flex items-center gap-2">
                <BadgeCheck
                  size={17}
                  className="text-[#ffcc42]"
                />

                <span className="text-[12px] font-semibold text-[#ffcc42]">
                  Verified Creator
                </span>
              </div>
            )}

            {/* DESCRIPTION */}

            <p className="mt-4 max-w-lg text-[13px] leading-6 text-zinc-400 sm:text-sm">
              Connect with {displayName} through
              PremiumChat's private messaging experience.
            </p>

            {/* =========================================== */}
            {/* PROFILE INFORMATION                         */}
            {/* =========================================== */}

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <ProfileInfoCard
                icon={ShieldCheck}
                title="Approved Creator"
                description="Public creator profile"
              />

              <ProfileInfoCard
                icon={LockKeyhole}
                title="Private Messaging"
                description="Connect through PremiumChat"
              />
            </div>

            {/* JOINED DATE */}

            {joinedAt && (
              <div className="mt-5 flex items-center gap-2 text-[11px] text-zinc-500">
                <CalendarDays
                  size={14}
                  className="text-[#ffcc42]"
                />

                <span>
                  Member since {joinedAt}
                </span>
              </div>
            )}

            {/* =========================================== */}
            {/* ACTION BUTTONS                              */}
            {/* =========================================== */}

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              {/* START CHAT */}

              <button
                type="button"
                onClick={handleStartChat}
                disabled={isStartingChat || isOwnProfile}
                aria-busy={isStartingChat}
                className={[
                  "inline-flex min-h-11",
                  "items-center justify-center gap-2",
                  "rounded-lg",
                  "bg-[#ffcc42]",
                  "px-5",
                  "text-[12px] font-bold",
                  "text-black",
                  "transition",
                  "hover:bg-[#ffd966]",
                  "disabled:cursor-not-allowed",
                  "disabled:opacity-50",
                ].join(" ")}
              >
                {isStartingChat ? (
                  <>
                    <RefreshCw
                      size={16}
                      className="animate-spin"
                    />

                    Opening Chat...
                  </>
                ) : (
                  <>
                    <MessageCircle size={16} />

                    {isOwnProfile
                      ? "Your Profile"
                      : "Start Chat"}
                  </>
                )}
              </button>

              {/* EXPLORE MORE */}

              <Link
                to="/explore"
                className={[
                  "inline-flex min-h-11",
                  "items-center justify-center gap-2",
                  "rounded-lg",
                  "border border-white/15",
                  "bg-white/5",
                  "px-5",
                  "text-[12px] font-semibold",
                  "text-white",
                  "transition",
                  "hover:border-[#ffcc42]/50",
                  "hover:text-[#ffcc42]",
                ].join(" ")}
              >
                <Users size={16} />

                Explore More
              </Link>
            </div>

            {/* CHAT ERROR */}

            {startChatError && (
              <div
                role="alert"
                className="mt-4 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-[12px] leading-5 text-red-300"
              >
                {startChatError}
              </div>
            )}

            {/* ACCESS NOTICE */}

            <div className="mt-5 flex items-start gap-2 text-[11px] leading-5 text-zinc-500">
              <ShieldCheck
                size={14}
                className="mt-0.5 shrink-0 text-[#ffcc42]"
              />

              <span>
                Private messaging is available to
                authenticated PremiumChat members.
              </span>
            </div>
          </div>
        </div>

        {/* =============================================== */}
        {/* BOTTOM CTA                                      */}
        {/* =============================================== */}

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

          <h2 className="mt-3 text-lg font-bold text-white sm:text-xl">
            Discover More on PremiumChat
          </h2>

          <p className="mx-auto mt-2 max-w-lg text-[12px] leading-6 text-zinc-400 sm:text-[13px]">
            Explore approved creators and discover
            meaningful connections through PremiumChat.
          </p>

          <Link
            to="/explore"
            className={[
              "mt-5 inline-flex min-h-10",
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
            Explore Creators
            <ArrowRight size={15} />
          </Link>
        </div>
      </div>
    </div>
  );
}