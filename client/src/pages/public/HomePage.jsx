import { useState } from "react";

import {
  ArrowRight,
  CheckCircle2,
  Crown,
  Heart,
  LockKeyhole,
  MessageCircle,
  Play,
  ShieldCheck,
  Users,
  Video,
  X,
} from "lucide-react";

import {
  Link,
  useNavigate,
} from "react-router-dom";

import { useAuthStore } from "../../store/useAuthStore.js";
import PopularCreators from "../../components/creator/PopularCreators.jsx";

/**
 * ============================================================
 * PREMIUMCHAT — PREMIUM LANDING PAGE
 * ============================================================
 *
 * STEP 4.1
 *
 * Features:
 *
 * - Black and gold theme
 * - Cinematic hero section
 * - Floating chat notification
 * - Trust indicators
 * - Popular creators section
 * - How it works
 * - Pricing information
 * - Responsive layout
 *
 * IMPORTANT:
 *
 * Creator discovery is not connected yet.
 * Do not display fictional creator accounts.
 */

const features = [
  {
    icon: ShieldCheck,
    title: "Secure & Private",
    description: "Your privacy matters",
  },
  {
    icon: LockKeyhole,
    title: "Exclusive Content",
    description: "Premium creator experiences",
  },
  {
    icon: Users,
    title: "Real Creators",
    description: "Authentic connections",
  },
];

const steps = [
  {
    number: "01",
    title: "Create Your Account",
    description:
      "Sign up and set up your PremiumChat profile.",
  },
  {
    number: "02",
    title: "Discover Creators",
    description:
      "Explore creators and find people you'd like to connect with.",
  },
  {
    number: "03",
    title: "Start a Conversation",
    description:
      "Connect privately through our messaging experience.",
  },
];

function FeatureItem({
  icon: Icon,
  title,
  description,
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex shrink-0 items-center justify-center text-[#ffcc42]">
        <Icon size={29} strokeWidth={2.2} />
      </div>

      <div>
        <h3 className="text-sm font-semibold text-white">
          {title}
        </h3>

        <p className="mt-0.5 text-xs text-zinc-400">
          {description}
        </p>
      </div>
    </div>
  );
}

function FloatingMessage() {
  return (
    <div
      aria-hidden="true"
      className={[
        "absolute right-[5%] top-[24%]",
        "hidden items-center gap-3",
        "rounded-2xl border border-pink-500/70",
        "bg-black/75 px-4 py-3",
        "shadow-[0_15px_50px_rgba(0,0,0,0.45)]",
        "backdrop-blur-xl",
        "lg:flex",
      ].join(" ")}
    >
      <div
        className={[
          "flex h-12 w-12 items-center",
          "justify-center rounded-full",
          "bg-gradient-to-br",
          "from-amber-400 to-pink-600",
          "text-white",
        ].join(" ")}
      >
        <MessageCircle size={23} />
      </div>

      <div>
        <p className="text-sm font-medium text-white">
          Hey 💛
        </p>

        <p className="mt-1 text-sm text-zinc-200">
          Let's chat...
        </p>
      </div>

      <span className="ml-3 self-end text-xs text-zinc-400">
        10:24
      </span>

      <span
        className={[
          "absolute -bottom-2 left-9",
          "h-4 w-4 rotate-45",
          "border-b border-r border-pink-500/70",
          "bg-[#130b13]",
        ].join(" ")}
      />
    </div>
  );
}



function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="border-t border-white/10 bg-[#101014] py-20"
    >
      <div className="mx-auto max-w-[1440px] px-5 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-xs font-bold uppercase tracking-[0.25em] text-[#ffcc42]">
            Simple & Personal
          </span>

          <h2 className="mt-4 text-3xl font-extrabold text-white sm:text-4xl">
            How It{" "}
            <span className="text-[#ffcc42]">
              Works
            </span>
          </h2>

          <p className="mt-4 text-zinc-400">
            Connecting with creators is simple.
          </p>
        </div>

        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {steps.map((step) => (
            <div
              key={step.number}
              className="rounded-2xl border border-white/10 bg-[#18181d] p-7"
            >
              <span className="text-4xl font-black text-[#ffcc42]">
                {step.number}
              </span>

              <h3 className="mt-6 text-lg font-bold text-white">
                {step.title}
              </h3>

              <p className="mt-3 text-sm leading-7 text-zinc-400">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function PricingSection() {
  return (
    <section
      id="pricing"
      className="border-t border-white/10 bg-[#08080b] py-20"
    >
      <div className="mx-auto max-w-[1440px] px-5 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-xs font-bold uppercase tracking-[0.25em] text-[#ffcc42]">
            Premium Experiences
          </span>

          <h2 className="mt-4 text-3xl font-extrabold text-white sm:text-4xl">
            Your Connection.{" "}
            <span className="text-[#ffcc42]">
              Your Choice.
            </span>
          </h2>

          <p className="mt-4 text-sm leading-7 text-zinc-400">
            Discover creators and explore exclusive
            experiences. Paid features and their prices
            will be shown when available.
          </p>

          <Link
            to="/register"
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#ffe27a] to-[#ffbd30] px-8 py-3 font-bold text-black transition hover:brightness-110"
          >
            Get Started
            <ArrowRight size={18} />
          </Link>
        </div>
      </div>
    </section>
  );
}

export default function HomePage() {
  const navigate = useNavigate();

  const isAuthenticated = useAuthStore(
    (state) => state.isAuthenticated
  );

  const [videoOpen, setVideoOpen] = useState(false);

  const handleGetStarted = () => {
    navigate(
      isAuthenticated ? "/explore" : "/register"
    );
  };

  return (
    <div className="bg-[#08080b] text-white">
      {/* ================================================= */}
      {/* HERO                                              */}
      {/* ================================================= */}

      <section className="relative min-h-[570px] overflow-hidden bg-[#08080b] sm:min-h-[620px] lg:min-h-[570px]">
        {/* HERO PHOTOGRAPH */}

        <div className="absolute inset-0">
          <img
            src="/images/premium-hero.jpg"
            alt=""
            className="h-full w-full object-cover object-center"
          />

          {/* DARK OVERLAYS */}

          <div className="absolute inset-0 bg-black/40" />

          <div className="absolute inset-0 bg-gradient-to-r from-[#08080b] via-[#08080b]/90 to-transparent" />

          <div className="absolute inset-0 bg-gradient-to-t from-[#08080b]/80 via-transparent to-black/20" />

          <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_45%,rgba(179,18,74,0.15),transparent_55%)]" />
        </div>

        {/* HERO CONTENT */}

        <div className="relative z-10 mx-auto flex min-h-[570px] max-w-[1440px] items-center px-5 py-16 sm:min-h-[620px] sm:px-8 lg:min-h-[570px] lg:px-12">
          <div className="max-w-[650px]">
            <p className="text-[11px] font-medium uppercase tracking-[0.38em] text-zinc-300 sm:text-sm">
              Real People. Exclusive Connections.
            </p>

            <h1 className="mt-5 text-[clamp(3.4rem,6vw,6rem)] font-black leading-[0.97] tracking-[-0.055em] text-white">
              Chat with
              <br />
              Your Favourite
              <br />
              <span className="bg-gradient-to-b from-[#ffe78b] to-[#ffc334] bg-clip-text text-transparent">
                Creators
              </span>
            </h1>

            <p className="mt-6 max-w-[560px] text-lg leading-8 text-zinc-300 sm:text-xl">
              Have real conversations, get exclusive
              photos and videos, and support the
              creators you love.
            </p>

            {/* CTA BUTTONS */}

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={handleGetStarted}
                className={[
                  "inline-flex min-h-14",
                  "items-center justify-center gap-3",
                  "rounded-full",
                  "bg-gradient-to-r",
                  "from-[#ffe27a] to-[#ffbd30]",
                  "px-10 text-base font-bold",
                  "text-black shadow-lg",
                  "shadow-amber-500/15",
                  "transition hover:brightness-110",
                ].join(" ")}
              >
                Get Started
                <ArrowRight size={19} />
              </button>

              <button
                type="button"
                onClick={() => setVideoOpen(true)}
                className={[
                  "inline-flex min-h-14",
                  "items-center gap-3",
                  "rounded-full border",
                  "border-white/35",
                  "bg-black/30",
                  "px-6 text-sm font-semibold",
                  "text-white backdrop-blur",
                  "transition hover:border-[#ffcc42]",
                ].join(" ")}
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full border border-white/70">
                  <Play
                    size={17}
                    fill="currentColor"
                  />
                </span>

                Watch Video
              </button>
            </div>

            {/* TRUST INDICATORS */}

            <div className="mt-10 flex flex-wrap gap-x-8 gap-y-5">
              {features.map((feature) => (
                <FeatureItem
                  key={feature.title}
                  {...feature}
                />
              ))}
            </div>

            <p className="mt-7 text-xs text-zinc-400">
              Adults 18+ only. Verification is required
              for restricted features.
            </p>
          </div>
        </div>

        {/* FLOATING CHAT */}

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
      {/* PRICING                                           */}
      {/* ================================================= */}

      <PricingSection />

      {/* ================================================= */}
      {/* VIDEO MODAL                                       */}
      {/* ================================================= */}

      {videoOpen && (
        <div
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setVideoOpen(false);
            }
          }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 px-4 backdrop-blur-md"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="premiumchat-video-title"
            className="w-full max-w-xl rounded-2xl border border-white/15 bg-[#17171d] p-7 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-[#ffcc42]">
                  <Video size={22} />

                  <h2
                    id="premiumchat-video-title"
                    className="text-xl font-bold"
                  >
                    PremiumChat Introduction
                  </h2>
                </div>

                <p className="mt-4 text-sm leading-7 text-zinc-300">
                  Our introduction video is being prepared.
                  In the meantime, discover how PremiumChat
                  works and explore the platform.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setVideoOpen(false)}
                aria-label="Close video dialog"
                className="rounded-lg p-2 text-zinc-400 hover:bg-white/10 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                to="/explore"
                onClick={() => setVideoOpen(false)}
                className="inline-flex items-center gap-2 rounded-full bg-[#ffcc42] px-6 py-3 text-sm font-bold text-black"
              >
                Explore Creators
                <ArrowRight size={17} />
              </Link>

              <button
                type="button"
                onClick={() => setVideoOpen(false)}
                className="rounded-full border border-white/20 px-6 py-3 text-sm font-medium text-white"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DEVELOPMENT LINK */}

      {import.meta.env.DEV && (
        <div className="border-t border-white/10 bg-[#08080b] px-6 py-5 text-center">
          <Link
            to="/dev/status"
            className="text-xs text-zinc-500 hover:text-[#ffcc42]"
          >
            Development API Status
          </Link>
        </div>
      )}
    </div>
  );
}