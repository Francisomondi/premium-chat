import { useEffect, useRef, useState } from "react";

import {
  Link,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";

import {
  ArrowLeft,
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


function CreatorProfileSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading creator profile"
      className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8"
    >
      <div className="mb-8 h-5 w-32 animate-pulse rounded bg-white/10" />

      <div className="grid gap-8 lg:grid-cols-[380px_minmax(0,1fr)]">
        <div className="aspect-[3/4] animate-pulse rounded-3xl bg-[#202026]" />

        <div className="space-y-6">
          <div className="h-7 w-36 animate-pulse rounded-full bg-[#ffcc42]/10" />

          <div className="h-12 w-3/4 animate-pulse rounded bg-white/10" />

          <div className="h-5 w-1/2 animate-pulse rounded bg-white/10" />

          <div className="h-28 animate-pulse rounded-2xl bg-white/5" />

          <div className="h-12 w-48 animate-pulse rounded-xl bg-[#ffcc42]/20" />
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
  const [imageError, setImageError] =
    useState(false);

  useEffect(() => {
    setImageError(false);
  }, [avatarUrl]);

  const hasImage =
    typeof avatarUrl === "string" &&
    avatarUrl.trim().length > 0 &&
    !imageError;

  return (
    <div className="relative aspect-[3/4] w-full overflow-hidden rounded-3xl border border-[#ffcc42]/20 bg-[#15151a] shadow-[0_20px_70px_rgba(0,0,0,0.35)]">
      {hasImage ? (
        <img
          src={avatarUrl}
          alt={`${displayName}'s profile`}
          className="h-full w-full object-cover"
          onError={() => setImageError(true)}
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-[#342915] via-[#1a1a20] to-[#09090c]">
          <div className="flex h-28 w-28 items-center justify-center rounded-full border border-[#ffcc42]/25 bg-[#ffcc42]/10 sm:h-36 sm:w-36">
            <UserRound
              size={64}
              strokeWidth={1.1}
              className="text-[#ffcc42]/70"
            />
          </div>

          <Crown
            size={28}
            className="mt-7 text-[#ffcc42]/40"
          />
        </div>
      )}

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

      <div className="absolute bottom-5 left-5 right-5 flex items-center gap-2">
        <Crown
          size={18}
          className="text-[#ffcc42]"
        />

        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-white">
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
    <div className="mx-auto flex min-h-[65vh] max-w-xl flex-col items-center justify-center px-4 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full border border-red-500/20 bg-red-500/5">
        <AlertCircle
          size={36}
          className="text-[#ffcc42]"
        />
      </div>

      <h1 className="mt-6 text-2xl font-bold text-white">
        Creator Unavailable
      </h1>

      <p className="mt-3 text-sm leading-7 text-zinc-400">
        {message}
      </p>

      <div className="mt-7 flex flex-wrap justify-center gap-3">
        {typeof onRetry === "function" && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-2 rounded-xl border border-[#ffcc42]/40 px-5 py-3 text-sm font-semibold text-[#ffcc42] transition hover:bg-[#ffcc42]/10"
          >
            <RefreshCw size={17} />
            Try Again
          </button>
        )}

        <Link
          to="/explore"
          className="inline-flex items-center gap-2 rounded-xl bg-[#ffcc42] px-5 py-3 text-sm font-bold text-black transition hover:brightness-110"
        >
          <ArrowLeft size={17} />
          Explore Creators
        </Link>
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
   * ROUTE PARAMETERS
   * ==========================================================
   */

  const { creatorId } = useParams();

  const navigate = useNavigate();
const location = useLocation();

const isAuthenticated = useAuthStore(
  (state) => state.isAuthenticated
);

const currentUser = useAuthStore(
  (state) => state.user
);

const openConversationWithCreator = useChatStore(
  (state) => state.openConversationWithCreator
);

const [isStartingChat, setIsStartingChat] = useState(false);
const [startChatError, setStartChatError] = useState(null);

const startingChatRef = useRef(false);

const currentUserId = String(
  currentUser?._id ?? currentUser?.id ?? ""
).toLowerCase();

const isOwnProfile =
  Boolean(currentUserId) &&
  currentUserId === String(creatorId).toLowerCase();

  /**
   * ==========================================================
   * STATE
   * ==========================================================
   */

  const [creator, setCreator] =
    useState(null);

  const [isLoading, setIsLoading] =
    useState(true);

  const [error, setError] =
    useState(null);

  const [isNotFound, setIsNotFound] =
    useState(false);

  const [reloadKey, setReloadKey] =
    useState(0);

  /**
   * ==========================================================
   * FETCH CREATOR PROFILE
   * ==========================================================
   */

  useEffect(() => {
    const controller =
      new AbortController();

    const fetchCreator = async () => {
      setIsLoading(true);
      setError(null);
      setIsNotFound(false);
      setCreator(null);

      try {
        const response =
          await getPublicCreatorProfile(
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
    setReloadKey(
      (previous) => previous + 1
    );
  };
  const handleStartChat = async () => {
    if (startingChatRef.current) {
        return;
    }

    setStartChatError(null);

    if (!creator?.id || creator.id !== creatorId) {
        setStartChatError("Invalid creator profile.");
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
    } catch (error) {
        setStartChatError(
        error?.message ||
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
        ).toLocaleDateString(
          undefined,
          {
            month: "long",
            year: "numeric",
          }
        )
      : null;

  /**
   * ==========================================================
   * RENDER PROFILE
   * ==========================================================
   */

  return (
    <div className="min-h-screen bg-[#09090c] text-white">
      {/* ==================================================== */}
      {/* BACKGROUND                                           */}
      {/* ==================================================== */}

      <div className="pointer-events-none absolute left-1/2 top-20 h-96 w-96 -translate-x-1/2 rounded-full bg-[#ffcc42]/5 blur-[120px]" />

      <div className="relative mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        {/* ================================================== */}
        {/* BACK NAVIGATION                                    */}
        {/* ================================================== */}

        <Link
          to="/explore"
          className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-zinc-400 transition hover:text-[#ffcc42]"
        >
          <ArrowLeft size={17} />
          Back to Explore
        </Link>

        {/* ================================================== */}
        {/* PROFILE LAYOUT                                     */}
        {/* ================================================== */}

        <div className="grid gap-8 lg:grid-cols-[380px_minmax(0,1fr)] lg:gap-12">
          {/* ================================================ */}
          {/* LEFT — CREATOR PHOTO                             */}
          {/* ================================================ */}

          <div>
            <CreatorProfileAvatar
              avatarUrl={creator.avatarUrl}
              displayName={displayName}
            />
          </div>

          {/* ================================================ */}
          {/* RIGHT — CREATOR INFORMATION                      */}
          {/* ================================================ */}

          <div className="flex flex-col justify-center">
            {/* CREATOR LABEL */}

            <div className="mb-5 inline-flex w-fit items-center gap-2 rounded-full border border-[#ffcc42]/25 bg-[#ffcc42]/10 px-4 py-2">
              <Crown
                size={15}
                className="text-[#ffcc42]"
              />

              <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#ffcc42]">
                PremiumChat Creator
              </span>
            </div>

            {/* CREATOR NAME */}

            <h1 className="break-words text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
              {displayName}
            </h1>

            {/* VERIFICATION */}

            {creator.isVerified && (
              <div className="mt-5 flex items-center gap-2">
                <BadgeCheck
                  size={20}
                  className="text-[#ffcc42]"
                />

                <span className="text-sm font-semibold text-[#ffcc42]">
                  Verified Creator
                </span>
              </div>
            )}

            {/* DESCRIPTION */}

            <p className="mt-6 max-w-xl text-sm leading-8 text-zinc-400 sm:text-base">
              Connect with {displayName} through
              PremiumChat's private messaging
              experience.
            </p>

            {/* PROFILE INFORMATION */}

            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {/* VERIFIED ACCOUNT */}

              <div className="rounded-2xl border border-white/10 bg-[#15151a] p-5">
                <div className="flex items-center gap-3">
                  <ShieldCheck
                    size={22}
                    className="text-[#ffcc42]"
                  />

                  <div>
                    <p className="text-sm font-semibold text-white">
                      Verified Account
                    </p>

                    <p className="mt-1 text-xs text-zinc-400">
                      Approved creator profile
                    </p>
                  </div>
                </div>
              </div>

              {/* PRIVATE MESSAGING */}

              <div className="rounded-2xl border border-white/10 bg-[#15151a] p-5">
                <div className="flex items-center gap-3">
                  <LockKeyhole
                    size={22}
                    className="text-[#ffcc42]"
                  />

                  <div>
                    <p className="text-sm font-semibold text-white">
                      Private Messaging
                    </p>

                    <p className="mt-1 text-xs text-zinc-400">
                      Connect through PremiumChat
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* JOINED DATE */}

            {joinedAt && (
              <div className="mt-6 flex items-center gap-2 text-xs text-zinc-500">
                <CalendarDays
                  size={16}
                  className="text-[#ffcc42]"
                />

                <span>
                  Member since {joinedAt}
                </span>
              </div>
            )}

            {/* ============================================== */}
            {/* ACTION BUTTONS                                 */}
            {/* ============================================== */}

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              {/*
                Start Chat will be connected to the
                existing useChatStore in Step 4.2.5.4.

                Keep disabled until the actual
                conversation flow is implemented.
              */}

            <button
            type="button"
            onClick={handleStartChat}
            disabled={isStartingChat || isOwnProfile}
            aria-busy={isStartingChat}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#ffcc42] px-7 py-3.5 text-sm font-bold text-black transition hover:bg-[#ffd966] disabled:cursor-not-allowed disabled:opacity-50"
            >
            {isStartingChat ? (
                <>
                <RefreshCw size={19} className="animate-spin" />
                Opening Chat...
                </>
            ) : (
                <>
                <MessageCircle size={19} />
                {isOwnProfile ? "Your Profile" : "Start Chat"}
                </>
            )}
            </button>

              <Link
                to="/explore"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-7 py-3.5 text-sm font-semibold text-white transition hover:border-[#ffcc42]/50 hover:text-[#ffcc42]"
              >
                <Users size={18} />

                Explore More Creators
              </Link>
            </div>
            {startChatError && (
            <div
                role="alert"
                className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300"
            >
                {startChatError}
            </div>
            )}

            {/* COMING SOON MESSAGE */}

            <div className="mt-6 flex items-start gap-2 text-xs leading-6 text-zinc-500">
            <ShieldCheck
                size={16}
                className="mt-1 shrink-0 text-[#ffcc42]"
            />

            <span>
                Private messaging is available to authenticated
                PremiumChat members.
            </span>
            </div>
          </div>
        </div>

        {/* ================================================== */}
        {/* BOTTOM CTA                                         */}
        {/* ================================================== */}

        <div className="mt-16 rounded-3xl border border-[#ffcc42]/15 bg-gradient-to-r from-[#1c1912] to-[#111115] px-6 py-10 text-center sm:px-10">
          <Crown
            size={27}
            className="mx-auto text-[#ffcc42]"
          />

          <h2 className="mt-4 text-2xl font-bold text-white">
            Discover More on PremiumChat
          </h2>

          <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-zinc-400">
            Explore approved creators and discover
            meaningful connections through
            PremiumChat.
          </p>

          <Link
            to="/explore"
            className="mt-6 inline-flex items-center justify-center rounded-xl bg-[#ffcc42] px-6 py-3 text-sm font-bold text-black transition hover:brightness-110"
          >
            Explore Creators
          </Link>
        </div>
      </div>
    </div>
  );
}