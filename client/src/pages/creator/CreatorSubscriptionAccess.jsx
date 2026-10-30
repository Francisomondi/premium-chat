import {
  ArrowRight,
  CheckCircle2,
  Crown,
  LockKeyhole,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";

const ACCESS_STATES = {
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
  UNKNOWN: "UNKNOWN",
};

export default function CreatorSubscriptionAccess({
  accessStatus = ACCESS_STATES.UNKNOWN,
  isLoading = false,
  onRefresh,
  onSubscribe,
  isOwnProfile = false,
}) {
  const isActive =
    accessStatus === ACCESS_STATES.ACTIVE;

  const isInactive =
    accessStatus === ACCESS_STATES.INACTIVE;

  return (
    <section
      aria-labelledby="creator-subscription-heading"
      className="mt-7 overflow-hidden rounded-2xl border border-[#ffcc42]/20 bg-[#15151a]"
    >
      <div className="border-b border-white/10 bg-gradient-to-r from-[#292216] to-[#15151a] px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#ffcc42]/10 text-[#ffcc42]">
            <Crown size={20} aria-hidden="true" />
          </div>

          <div>
            <h2
              id="creator-subscription-heading"
              className="text-base font-bold text-white"
            >
              Premium Access
            </h2>

            <p className="mt-1 text-xs text-zinc-400">
              Subscription status for this creator
            </p>
          </div>
        </div>
      </div>

      <div className="p-5">
        {isOwnProfile ? (
          <p className="text-sm text-zinc-300">
            This is your creator profile.
          </p>
        ) : isLoading ? (
          <div
            role="status"
            className="flex items-center gap-3 text-sm text-zinc-300"
          >
            <RefreshCw
              size={18}
              className="animate-spin text-[#ffcc42]"
              aria-hidden="true"
            />
            Checking subscription access...
          </div>
        ) : isActive ? (
          <div role="status" className="flex items-start gap-3">
            <CheckCircle2
              size={22}
              className="shrink-0 text-emerald-400"
              aria-hidden="true"
            />

            <div>
              <p className="font-semibold text-white">
                Subscription Active
              </p>

              <p className="mt-1 text-sm leading-6 text-zinc-400">
                Your subscription access has been
                confirmed by PremiumChat.
              </p>
            </div>
          </div>
        ) : isInactive ? (
          <div>
            <div className="flex items-start gap-3">
              <LockKeyhole
                size={22}
                className="shrink-0 text-[#ffcc42]"
                aria-hidden="true"
              />

              <div>
                <p className="font-semibold text-white">
                  Premium Access Required
                </p>

                <p className="mt-1 text-sm leading-6 text-zinc-400">
                  An active subscription is required
                  to access this creator's premium content.
                </p>
              </div>
            </div>

            {typeof onSubscribe === "function" && (
              <button
                type="button"
                onClick={onSubscribe}
                className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#ffcc42] px-5 text-xs font-bold text-black transition hover:brightness-110"
              >
                View Subscription Options
                <ArrowRight size={15} aria-hidden="true" />
              </button>
            )}
          </div>
        ) : (
          <div role="status" className="flex items-start gap-3">
            <ShieldAlert
              size={22}
              className="shrink-0 text-amber-400"
              aria-hidden="true"
            />

            <div>
              <p className="font-semibold text-white">
                Access Not Verified
              </p>

              <p className="mt-1 text-sm leading-6 text-zinc-400">
                We cannot confirm your subscription
                status right now. Premium content remains
                unavailable until access is verified.
              </p>
            </div>
          </div>
        )}

        {!isOwnProfile &&
          typeof onRefresh === "function" &&
          !isLoading && (
            <button
              type="button"
              onClick={onRefresh}
              className="mt-5 inline-flex items-center gap-2 text-xs font-semibold text-[#ffcc42] transition hover:text-[#ffe27a]"
            >
              <RefreshCw size={14} aria-hidden="true" />
              Refresh Access Status
            </button>
          )}
      </div>
    </section>
  );
}