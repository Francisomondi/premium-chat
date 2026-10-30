import {
  Crown,
  CheckCircle2,
  LockKeyhole,
  RefreshCw,
  Loader2,
  ShieldCheck,
  AlertCircle,
  ArrowRight,
} from "lucide-react";

const ACCESS_STATUS = {
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
  UNKNOWN: "UNKNOWN",
};

const formatDate = (value) => {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("en-KE", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
};

export default function CreatorSubscriptionAccess({
  accessStatus = ACCESS_STATUS.UNKNOWN,
  currentPeriodEnd = null,
  isLoading = false,
  onRefresh,
  onSubscribe,
  isOwnProfile = false,
}) {
  if (isOwnProfile) {
    return null;
  }

  const status =
    typeof accessStatus === "string"
      ? accessStatus
      : accessStatus?.hasAccess === true
        ? ACCESS_STATUS.ACTIVE
        : accessStatus?.hasAccess === false
          ? ACCESS_STATUS.INACTIVE
          : ACCESS_STATUS.UNKNOWN;

  const expirationDate = formatDate(
    currentPeriodEnd ??
      (typeof accessStatus === "object"
        ? accessStatus?.currentPeriodEnd
        : null)
  );

  if (isLoading) {
    return (
      <section className="mt-6 rounded-2xl border border-white/10 bg-[#15151a] p-6">
        <div className="flex items-center gap-3">
          <Loader2
            size={22}
            className="animate-spin text-[#ffcc42]"
          />

          <div>
            <h3 className="font-semibold text-white">
              Checking Subscription Access
            </h3>

            <p className="mt-1 text-sm text-zinc-400">
              Verifying your subscription...
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (status === ACCESS_STATUS.ACTIVE) {
    return (
      <section className="mt-6 rounded-2xl border border-emerald-500/20 bg-[#15151a] p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10">
            <CheckCircle2
              size={24}
              className="text-emerald-400"
            />
          </div>

          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-bold text-white">
              Premium Access Active
            </h3>

            <p className="mt-2 text-sm text-zinc-400">
              Your subscription is active.
              You can access this creator's
              subscriber-only content.
            </p>

            {expirationDate && (
              <p className="mt-3 text-sm text-emerald-300">
                Access valid until {expirationDate}
              </p>
            )}

            <div className="mt-4 flex items-center gap-2 text-xs text-zinc-500">
              <ShieldCheck
                size={15}
                className="text-emerald-400"
              />

              Access confirmed by PremiumChat
            </div>
          </div>

          {typeof onRefresh === "function" && (
            <button
              type="button"
              onClick={onRefresh}
              aria-label="Refresh subscription access"
              className="rounded-lg border border-white/10 p-2 text-zinc-400 hover:text-white"
            >
              <RefreshCw size={17} />
            </button>
          )}
        </div>
      </section>
    );
  }

  if (status === ACCESS_STATUS.UNKNOWN) {
    return (
      <section className="mt-6 rounded-2xl border border-white/10 bg-[#15151a] p-6">
        <div className="flex items-start gap-4">
          <AlertCircle
            size={24}
            className="shrink-0 text-[#ffcc42]"
          />

          <div className="flex-1">
            <h3 className="font-semibold text-white">
              Subscription Access Unavailable
            </h3>

            <p className="mt-2 text-sm text-zinc-400">
              We couldn't confirm your subscription
              status. Sign in if necessary or
              refresh your access.
            </p>

            <div className="mt-4 flex flex-wrap gap-3">
              {typeof onSubscribe === "function" && (
                <button
                  type="button"
                  onClick={onSubscribe}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#ffcc42] px-4 py-2 text-sm font-semibold text-black hover:bg-[#ffd966]"
                >
                  <Crown size={16} />
                  View Subscription Options
                </button>
              )}

              {typeof onRefresh === "function" && (
                <button
                  type="button"
                  onClick={onRefresh}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm text-zinc-300 hover:bg-white/5"
                >
                  <RefreshCw size={16} />
                  Refresh Access
                </button>
              )}
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="mt-6 overflow-hidden rounded-2xl border border-[#ffcc42]/20 bg-[#15151a]">
      <div className="border-b border-white/10 bg-gradient-to-r from-[#ffcc42]/10 to-transparent p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#ffcc42]/10">
            <Crown
              size={25}
              className="text-[#ffcc42]"
            />
          </div>

          <div>
            <h3 className="text-xl font-bold text-white">
              Unlock Exclusive Content
            </h3>

            <p className="mt-2 text-sm text-zinc-400">
              Subscribe to unlock premium content
              and exclusive creator benefits.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-5 p-6">
        <div className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.03] p-4">
          <LockKeyhole
            size={21}
            className="shrink-0 text-[#ffcc42]"
          />

          <div>
            <p className="text-sm font-medium text-white">
              Subscriber-Only Access
            </p>

            <p className="mt-1 text-xs text-zinc-400">
              Exclusive content requires an
              active, verified subscription.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          {typeof onSubscribe === "function" && (
            <button
              type="button"
              onClick={onSubscribe}
              className="inline-flex items-center gap-2 rounded-xl bg-[#ffcc42] px-5 py-3 text-sm font-semibold text-black hover:bg-[#ffd966]"
            >
              <Crown size={17} />

              View Subscription Options

              <ArrowRight size={17} />
            </button>
          )}

          {typeof onRefresh === "function" && (
            <button
              type="button"
              onClick={onRefresh}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm text-zinc-300 hover:bg-white/5"
            >
              <RefreshCw size={16} />
              Refresh Access
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <ShieldCheck
            size={15}
            className="text-[#ffcc42]"
          />

          Premium access requires verified payment
          and backend authorization.
        </div>
      </div>
    </section>
  );
}