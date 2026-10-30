import { useEffect, useRef, useState } from "react";

import {
  ArrowRight,
  Crown,
  LockKeyhole,
  MessageCircle,
  Play,
  ShieldCheck,
  Sparkles,
  Users,
  Video,
  X,
} from "lucide-react";

import { Link, useNavigate } from "react-router-dom";

import { useAuthStore } from "../../store/useAuthStore.js";

import PopularCreators from "../../components/creator/PopularCreators.jsx";

/**
 * ============================================================
 * PREMIUMCHAT — HOMEPAGE
 * ============================================================
 *
 * UI CLEANUP 1.2
 *
 * Improvements:
 * - Compact typography
 * - Balanced hero layout
 * - Cleaner buttons
 * - Improved feature cards
 * - Responsive spacing
 * - Refined How It Works section
 * - Cleaner CTA section
 * - Accessible introduction dialog
 *
 * Preserves:
 * - Authentication-aware navigation
 * - Existing PopularCreators component
 * - Hero image
 * - Introduction dialog
 * - Development status link
 *
 * No fictional creator accounts or statistics.
 */

const GOLD = "#ffcc42";

/**
 * ============================================================
 * FEATURES
 * ============================================================
 */

const features = [
  {
    icon: ShieldCheck,
    title: "Private Conversations",
    description: "Connect with confidence.",
  },
  {
    icon: LockKeyhole,
    title: "Exclusive Experiences",
    description: "More ways to connect.",
  },
  {
    icon: Users,
    title: "Discover Creators",
    description: "Find people worth following.",
  },
];

/**
 * ============================================================
 * HOW IT WORKS
 * ============================================================
 */

const steps = [
  {
    number: "01",
    title: "Create Your Account",
    description:
      "Join PremiumChat and set up your personal profile.",
  },
  {
    number: "02",
    title: "Discover Creators",
    description:
      "Explore creator profiles and discover people who match your interests.",
  },
  {
    number: "03",
    title: "Connect Privately",
    description:
      "Start conversations and explore the experiences available from your favourite creators.",
  },
];
/**
 * ============================================================
 * FEATURE CARD
 * ============================================================
 */

function FeatureItem({ icon: Icon, title, description }) {
  return (
    <div
      className={[
        "flex items-start gap-3",
        "rounded-xl border border-white/10",
        "bg-white/[0.035]",
        "px-4 py-3",
        "transition-colors",
        "hover:border-[#ffcc42]/25",
        "hover:bg-white/[0.055]",
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
        <Icon size={18} strokeWidth={1.9} />
      </div>

      <div className="min-w-0">
        <h3 className="text-[13px] font-semibold text-white">
          {title}
        </h3>

        <p className="mt-1 text-xs leading-5 text-zinc-400">
          {description}
        </p>
      </div>
    </div>
  );
}

/**
 * ============================================================
 * DECORATIVE FLOATING MESSAGE
 * ============================================================
 *
 * This is decorative UI, not a real chat message.
 */

function FloatingMessage() {
  return (
    <div
      aria-hidden="true"
      className={[
        "pointer-events-none absolute",
        "right-[5%] top-[26%]",
        "hidden items-center gap-3",
        "rounded-xl",
        "border border-[#ffcc42]/30",
        "bg-[#111115]/90",
        "px-4 py-3",
        "shadow-[0_18px_50px_rgba(0,0,0,0.45)]",
        "backdrop-blur-xl",
        "xl:flex",
      ].join(" ")}
    >
      <div
        className={[
          "flex h-10 w-10 shrink-0",
          "items-center justify-center",
          "rounded-full",
          "bg-gradient-to-br",
          "from-[#ffe27a] to-[#ffbd30]",
          "text-black",
        ].join(" ")}
      >
        <MessageCircle size={19} />
      </div>

      <div>
        <p className="text-xs font-semibold text-white">
          Say hello
        </p>

        <p className="mt-1 text-[11px] text-zinc-300">
          Great conversations start here.
        </p>
      </div>
    </div>
  );
}

/**
 * ============================================================
 * HOW IT WORKS SECTION
 * ============================================================
 */

function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className={[
        "scroll-mt-20",
        "border-t border-white/10",
        "bg-[#101014]",
        "py-14 sm:py-16 lg:py-20",
      ].join(" ")}
    >
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8">
        {/* SECTION HEADING */}

        <div className="mx-auto max-w-xl text-center">
          <div className="inline-flex items-center gap-2 text-[#ffcc42]">
            <Sparkles size={14} />

            <span className="text-[10px] font-bold uppercase tracking-[0.22em] sm:text-xs">
              Simple & Personal
            </span>
          </div>

          <h2 className="mt-3 text-2xl font-extrabold tracking-tight text-white sm:text-[28px] lg:text-[32px]">
            How It{" "}
            <span className="text-[#ffcc42]">
              Works
            </span>
          </h2>

          <p className="mt-3 text-[13px] leading-6 text-zinc-400 sm:text-sm">
            Connect with creators in three simple steps.
          </p>
        </div>

        {/* STEPS */}

        <div className="mt-9 grid gap-4 md:grid-cols-3 lg:mt-11">
          {steps.map((step) => (
            <div
              key={step.number}
              className={[
                "group relative",
                "rounded-2xl",
                "border border-white/10",
                "bg-[#18181d]",
                "p-5 sm:p-6",
                "transition-all duration-200",
                "hover:-translate-y-0.5",
                "hover:border-[#ffcc42]/30",
              ].join(" ")}
            >
              <div className="flex items-center justify-between">
                <span
                  className={[
                    "flex h-10 w-10",
                    "items-center justify-center",
                    "rounded-xl",
                    "border border-[#ffcc42]/20",
                    "bg-[#ffcc42]/10",
                    "text-sm font-extrabold",
                    "text-[#ffcc42]",
                  ].join(" ")}
                >
                  {step.number}
                </span>

                <ArrowRight
                  size={17}
                  className="text-zinc-600 transition-colors group-hover:text-[#ffcc42]"
                />
              </div>

              <h3 className="mt-5 text-[15px] font-bold text-white">
                {step.title}
              </h3>

              <p className="mt-2 text-[13px] leading-6 text-zinc-400">
                {step.description}
              </p>
            </div>
          ))}
        </div>

        {/* SECONDARY CTA */}

        <div className="mt-9 text-center">
          <Link
            to="/explore"
            className={[
              "inline-flex items-center gap-2",
              "text-[13px] font-semibold",
              "text-[#ffcc42]",
              "transition hover:text-[#ffe27a]",
            ].join(" ")}
          >
            Explore Creators
            <ArrowRight size={15} />
          </Link>
        </div>
      </div>
    </section>
  );
}

/**
 * ============================================================
 * FINAL CTA SECTION
 * ============================================================
 *
 * Monetization is not implemented yet.
 * Do not display invented pricing.
 */

function JoinSection({ isAuthenticated }) {
  return (
    <section
      id="pricing"
      className={[
        "border-t border-white/10",
        "bg-[#08080b]",
        "py-14 sm:py-16 lg:py-20",
      ].join(" ")}
    >
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8">
        <div
          className={[
            "relative overflow-hidden",
            "rounded-2xl",
            "border border-[#ffcc42]/15",
            "bg-gradient-to-br",
            "from-[#1d1a12]",
            "via-[#141316]",
            "to-[#101014]",
            "px-5 py-9",
            "text-center",
            "sm:px-8 sm:py-11",
            "lg:py-12",
          ].join(" ")}
        >
          {/* DECORATIVE GLOW */}

          <div
            aria-hidden="true"
            className={[
              "pointer-events-none",
              "absolute -right-20 -top-24",
              "h-64 w-64 rounded-full",
              "bg-[#ffcc42]/10 blur-3xl",
            ].join(" ")}
          />

          <div className="relative z-10 mx-auto max-w-xl">
            <div
              className={[
                "mx-auto flex h-11 w-11",
                "items-center justify-center",
                "rounded-xl",
                "border border-[#ffcc42]/20",
                "bg-[#ffcc42]/10",
                "text-[#ffcc42]",
              ].join(" ")}
            >
              <Crown size={22} />
            </div>

            <h2 className="mt-5 text-2xl font-extrabold tracking-tight text-white sm:text-[28px]">
              Your Next Great Conversation{" "}
              <span className="text-[#ffcc42]">
                Starts Here.
              </span>
            </h2>

            <p className="mx-auto mt-3 max-w-md text-[13px] leading-6 text-zinc-400 sm:text-sm">
              Discover creators, explore their profiles,
              and connect through private conversations.
            </p>

            <Link
              to={isAuthenticated ? "/explore" : "/register"}
              className={[
                "mt-6 inline-flex",
                "min-h-10 items-center",
                "justify-center gap-2",
                "rounded-full",
                "bg-gradient-to-r",
                "from-[#ffe27a] to-[#ffbd30]",
                "px-6",
                "text-[13px] font-bold",
                "text-black",
                "transition hover:brightness-110",
              ].join(" ")}
            >
              {isAuthenticated
                ? "Explore Creators"
                : "Join PremiumChat"}

              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * ============================================================
 * INTRODUCTION DIALOG
 * ============================================================
 */

function IntroductionDialog({ onClose }) {
  const closeButtonRef = useRef(null);

  useEffect(() => {
    const previousActiveElement = document.activeElement;
    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    closeButtonRef.current?.focus();

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose();
      }

      if (event.key === "Tab") {
        const dialog = document.getElementById(
          "premiumchat-introduction-dialog"
        );

        if (!dialog) {
          return;
        }

        const focusableElements = Array.from(
          dialog.querySelectorAll(
            'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        );

        if (focusableElements.length === 0) {
          return;
        }

        const firstElement = focusableElements[0];

        const lastElement =
          focusableElements[focusableElements.length - 1];

        if (
          event.shiftKey &&
          document.activeElement === firstElement
        ) {
          event.preventDefault();
          lastElement.focus();
        } else if (
          !event.shiftKey &&
          document.activeElement === lastElement
        ) {
          event.preventDefault();
          firstElement.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;

      document.removeEventListener(
        "keydown",
        handleKeyDown
      );

      if (previousActiveElement?.isConnected) {
        previousActiveElement.focus();
      }
    };
  }, [onClose]);

  return (
    <div
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      className={[
        "fixed inset-0 z-[100]",
        "flex items-center justify-center",
        "bg-black/85",
        "px-4 py-6",
        "backdrop-blur-md",
      ].join(" ")}
    >
      <div
        id="premiumchat-introduction-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="premiumchat-video-title"
        aria-describedby="premiumchat-video-description"
        className={[
          "w-full max-w-lg",
          "rounded-2xl",
          "border border-white/15",
          "bg-[#17171d]",
          "p-5 sm:p-6",
          "shadow-2xl",
        ].join(" ")}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[#ffcc42]">
              <Video size={19} />

              <h2
                id="premiumchat-video-title"
                className="text-lg font-bold text-white"
              >
                PremiumChat Introduction
              </h2>
            </div>

            <p
              id="premiumchat-video-description"
              className="mt-3 text-[13px] leading-6 text-zinc-300"
            >
              Our introduction video is being prepared.
              In the meantime, you can explore creators
              and learn how PremiumChat works.
            </p>
          </div>

          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close introduction dialog"
            className={[
              "shrink-0 rounded-lg",
              "p-2 text-zinc-400",
              "transition",
              "hover:bg-white/10",
              "hover:text-white",
            ].join(" ")}
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            to="/explore"
            onClick={onClose}
            className={[
              "inline-flex min-h-10",
              "items-center justify-center gap-2",
              "rounded-full",
              "bg-[#ffcc42]",
              "px-5",
              "text-[12px] font-bold text-black",
              "transition hover:brightness-110",
            ].join(" ")}
          >
            Explore Creators
            <ArrowRight size={15} />
          </Link>

          <button
            type="button"
            onClick={onClose}
            className={[
              "inline-flex min-h-10",
              "items-center justify-center",
              "rounded-full",
              "border border-white/20",
              "px-5",
              "text-[12px] font-medium",
              "text-white",
              "transition hover:border-white/40",
            ].join(" ")}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * ============================================================
 * HOMEPAGE
 * ============================================================
 */

export default function HomePage() {
  const navigate = useNavigate();

  const isAuthenticated = useAuthStore(
    (state) => state.isAuthenticated
  );

  const [videoOpen, setVideoOpen] = useState(false);

  /**
   * ==========================================================
   * AUTHENTICATION-AWARE NAVIGATION
   * ==========================================================
   */

  const handleGetStarted = () => {
    navigate(
      isAuthenticated ? "/explore" : "/register"
    );
  };

  const closeIntroduction = () => {
    setVideoOpen(false);
  };

  return (
    <div className="bg-[#08080b] text-white">
      {/* ================================================= */}
      {/* HERO                                              */}
      {/* ================================================= */}

      <section
        className={[
          "relative overflow-hidden",
          "bg-[#08080b]",
          "min-h-[520px]",
          "sm:min-h-[560px]",
          "lg:min-h-[570px]",
        ].join(" ")}
      >
        {/* HERO IMAGE */}

        <div className="absolute inset-0">
          <img
            src="/images/premium-hero.jpg"
            alt=""
            fetchPriority="high"
            decoding="async"
            className="
              h-full w-full
              object-cover
              object-[65%_center]
              sm:object-center
            "
          />

          {/* DARK OVERLAYS */}

          <div className="absolute inset-0 bg-black/45" />

          <div
            className={[
              "absolute inset-0",
              "bg-gradient-to-r",
              "from-[#08080b]",
              "via-[#08080b]/90",
              "to-[#08080b]/30",
            ].join(" ")}
          />

          <div
            className={[
              "absolute inset-0",
              "bg-gradient-to-t",
              "from-[#08080b]/90",
              "via-transparent",
              "to-black/20",
            ].join(" ")}
          />

          <div
            className={[
              "absolute inset-0",
              "bg-[radial-gradient(circle_at_75%_45%,rgba(255,204,66,0.08),transparent_55%)]",
            ].join(" ")}
          />
        </div>

        {/* HERO CONTENT */}

        <div
          className={[
            "relative z-10",
            "mx-auto flex",
            "min-h-[520px]",
            "max-w-[1280px]",
            "items-center",
            "px-4 py-14",
            "sm:min-h-[560px]",
            "sm:px-6 sm:py-16",
            "lg:min-h-[570px]",
            "lg:px-8",
          ].join(" ")}
        >
          <div className="w-full max-w-[600px]">
            {/* EYEBROW */}

            <div className="inline-flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-[#ffcc42]" />

              <p
                className={[
                  "text-[10px]",
                  "font-semibold uppercase",
                  "tracking-[0.22em]",
                  "text-zinc-300",
                  "sm:text-[11px]",
                ].join(" ")}
              >
                Real People. Real Connections.
              </p>
            </div>

            {/* HEADLINE */}
            <h1 className="mt-5 max-w-[650px] text-[clamp(2.7rem,5vw,4.5rem)] font-black leading-[1.08] tracking-[-0.045em] text-white">
              Connect With
              <br />
              Your Favourite
              <br />
              <span className="bg-gradient-to-r from-[#ffe78b] to-[#ffc334] bg-clip-text text-transparent">
                Creators.
              </span>
            </h1>

            {/* DESCRIPTION */}

            <p
              className={[
                "mt-5 max-w-[470px]",
                "text-[13px]",
                "leading-6",
                "text-zinc-300",
                "sm:text-sm sm:leading-7",
              ].join(" ")}
            >
              Discover creators, explore their profiles,
              and connect through private conversations
              on PremiumChat.
            </p>

            {/* CTA BUTTONS */}

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleGetStarted}
                className={[
                  "inline-flex min-h-11",
                  "items-center justify-center gap-2",
                  "rounded-full",
                  "bg-gradient-to-r",
                  "from-[#ffe27a]",
                  "to-[#ffbd30]",
                  "px-6",
                  "text-[13px] font-bold",
                  "text-black",
                  "shadow-lg shadow-amber-500/10",
                  "transition",
                  "hover:brightness-110",
                  "focus-visible:outline",
                  "focus-visible:outline-2",
                  "focus-visible:outline-offset-2",
                  "focus-visible:outline-[#ffcc42]",
                ].join(" ")}
              >
                {isAuthenticated
                  ? "Explore Creators"
                  : "Get Started"}

                <ArrowRight size={16} />
              </button>

              <button
                type="button"
                onClick={() => setVideoOpen(true)}
                className={[
                  "inline-flex min-h-11",
                  "items-center justify-center gap-2",
                  "rounded-full",
                  "border border-white/25",
                  "bg-black/30",
                  "px-5",
                  "text-[12px] font-semibold",
                  "text-white",
                  "backdrop-blur-sm",
                  "transition",
                  "hover:border-[#ffcc42]/60",
                  "hover:bg-white/5",
                ].join(" ")}
              >
                <span
                  className={[
                    "flex h-7 w-7",
                    "items-center justify-center",
                    "rounded-full",
                    "border border-white/40",
                  ].join(" ")}
                >
                  <Play
                    size={12}
                    fill="currentColor"
                  />
                </span>

                Watch Video
              </button>
            </div>

            {/* FEATURES */}

            <div className="mt-9 grid max-w-[650px] gap-3 sm:grid-cols-3 lg:mt-10">
              {features.map((feature) => (
                <FeatureItem
                  key={feature.title}
                  {...feature}
                />
              ))}
            </div>

            {/* AGE NOTICE */}

            <p className="mt-6 text-[11px] leading-5 text-zinc-400">
              For adults aged 18+. Verification is required
              for age-restricted features.
            </p>
          </div>
        </div>

        {/* DECORATIVE FLOATING MESSAGE */}

        <FloatingMessage />
      </section>

      {/* ================================================= */}
      {/* POPULAR CREATORS                                  */}
      {/* ================================================= */}

      <PopularCreators />

      {/* ================================================= */}
      {/* HOW IT WORKS                                      */}
      {/* ================================================= */}

      <HowItWorks />

      {/* ================================================= */}
      {/* FINAL CTA                                         */}
      {/* ================================================= */}

      <JoinSection isAuthenticated={isAuthenticated} />

      {/* ================================================= */}
      {/* INTRODUCTION DIALOG                               */}
      {/* ================================================= */}

      {videoOpen && (
        <IntroductionDialog
          onClose={closeIntroduction}
        />
      )}

      {/* ================================================= */}
      {/* DEVELOPMENT STATUS LINK                           */}
      {/* ================================================= */}

      {import.meta.env.DEV && (
        <div className="border-t border-white/10 bg-[#08080b] px-4 py-4 text-center">
          <Link
            to="/dev/status"
            className="text-[11px] text-zinc-500 transition hover:text-[#ffcc42]"
          >
            Development API Status
          </Link>
        </div>
      )}
    </div>
  );
}