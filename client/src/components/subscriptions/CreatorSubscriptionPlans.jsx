import { useEffect, useState } from "react";

import {
  CheckCircle2,
  Crown,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

import {
  getPublicCreatorSubscriptionPlans,
} from "../../api/services/creatorSubscriptionPlanService.js";

import {
  formatSubscriptionPrice,
  supportsMpesaCheckout,
} from "../../utils/subscriptionPricing.js";

/**
 * ============================================================
 * PREMIUMCHAT — CREATOR SUBSCRIPTION PLANS
 * ============================================================
 *
 * STEP 19.8.25
 *
 * Responsibilities:
 *
 * - Retrieve public creator plans.
 * - Display available subscription options.
 * - Allow subscribers to select a plan.
 *
 * SECURITY:
 *
 * - Does not initiate payments.
 * - Does not create subscriptions.
 * - Does not activate premium access.
 * - Does not calculate payable amounts.
 *
 * All prices are displayed from backend data.
 */

export default function CreatorSubscriptionPlans({
  creatorId,
  onSelectPlan,
  disabled = false,
}) {
  const [plans, setPlans] = useState([]);

  const [selectedPlanId, setSelectedPlanId] =
    useState(null);

  const [isLoading, setIsLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [refreshKey, setRefreshKey] =
    useState(0);

  /**
   * ==========================================================
   * LOAD PUBLIC SUBSCRIPTION PLANS
   * ==========================================================
   */

  useEffect(() => {
    const controller = new AbortController();

    let active = true;

    const loadPlans = async () => {
      setIsLoading(true);
      setError("");
      setPlans([]);
      setSelectedPlanId(null);

      try {
        const response =
          await getPublicCreatorSubscriptionPlans(
            creatorId,
            {
              signal: controller.signal,
            }
          );

        if (!active) {
          return;
        }

        const availablePlans =
          response.data.plans.filter(
            (plan) =>
              plan?.status === undefined ||
              plan.status === "ACTIVE"
          );

        setPlans(availablePlans);
      } catch (requestError) {
        if (!active) {
          return;
        }

        if (
          requestError?.code ===
          "ERR_CANCELED"
        ) {
          return;
        }

        setError(
          "Unable to load subscription plans. Please try again."
        );
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    if (creatorId) {
      loadPlans();
    } else {
      setIsLoading(false);
      setError(
        "Creator information is unavailable."
      );
    }

    return () => {
      active = false;
      controller.abort();
    };
  }, [creatorId, refreshKey]);

  /**
   * ==========================================================
   * SELECT PLAN
   * ==========================================================
   */

  const handleSelectPlan = (plan) => {
    if (disabled) {
      return;
    }

    if (!supportsMpesaCheckout({
      ...plan,
      status: plan.status || "ACTIVE",
    })) {
      return;
    }

    setSelectedPlanId(plan._id);

    if (typeof onSelectPlan === "function") {
      onSelectPlan(plan);
    }
  };

  /**
   * ==========================================================
   * LOADING
   * ==========================================================
   */

  if (isLoading) {
    return (
      <section className="rounded-2xl border border-white/10 bg-zinc-950 p-8 text-center">
        <Loader2 className="mx-auto mb-4 h-7 w-7 animate-spin text-amber-400" />

        <p className="text-sm text-zinc-400">
          Loading subscription plans...
        </p>
      </section>
    );
  }

  /**
   * ==========================================================
   * ERROR
   * ==========================================================
   */

  if (error) {
    return (
      <section className="rounded-2xl border border-red-500/20 bg-zinc-950 p-8 text-center">
        <p className="mb-5 text-sm text-red-400">
          {error}
        </p>

        <button
          type="button"
          onClick={() =>
            setRefreshKey((value) => value + 1)
          }
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm text-white hover:bg-white/5"
        >
          <RefreshCw size={16} />
          Try Again
        </button>
      </section>
    );
  }

  /**
   * ==========================================================
   * EMPTY STATE
   * ==========================================================
   */

  if (plans.length === 0) {
    return (
      <section className="rounded-2xl border border-white/10 bg-zinc-950 p-8 text-center">
        <Crown className="mx-auto mb-4 h-8 w-8 text-amber-400" />

        <h3 className="text-lg font-semibold text-white">
          No Subscription Plans Available
        </h3>

        <p className="mt-2 text-sm text-zinc-400">
          This creator has not published any
          subscription plans yet.
        </p>
      </section>
    );
  }

  /**
   * ==========================================================
   * PLAN CARDS
   * ==========================================================
   */

  return (
    <section className="space-y-6">
      <div>
        <div className="mb-2 flex items-center gap-2">
          <Crown
            size={21}
            className="text-amber-400"
          />

          <h2 className="text-xl font-bold text-white">
            Choose Your Subscription
          </h2>
        </div>

        <p className="text-sm text-zinc-400">
          Select a monthly subscription plan
          to access exclusive creator content.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {plans.map((plan) => {
          const planId =
            plan._id || plan.id;

          const selected =
            selectedPlanId === planId;

          const mpesaSupported =
            supportsMpesaCheckout({
              ...plan,
              status: plan.status || "ACTIVE",
            });

          return (
            <article
              key={planId}
              className={`rounded-2xl border p-6 transition ${
                selected
                  ? "border-amber-400 bg-amber-400/5"
                  : "border-white/10 bg-zinc-950"
              }`}
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold text-white">
                    {plan.name}
                  </h3>

                  {plan.description && (
                    <p className="mt-2 text-sm text-zinc-400">
                      {plan.description}
                    </p>
                  )}
                </div>

                <Crown
                  size={22}
                  className="shrink-0 text-amber-400"
                />
              </div>

              <div className="mb-5">
                <p className="text-2xl font-bold text-amber-400">
                  {formatSubscriptionPrice(
                    plan.monthlyPriceMinor,
                    plan.currency
                  )}
                </p>

                <p className="mt-1 text-xs text-zinc-500">
                  Billed monthly
                </p>
              </div>

              {Array.isArray(plan.benefits) &&
                plan.benefits.length > 0 && (
                  <ul className="mb-6 space-y-3">
                    {plan.benefits.map(
                      (benefit, index) => (
                        <li
                          key={`${planId}-${index}`}
                          className="flex items-start gap-2 text-sm text-zinc-300"
                        >
                          <CheckCircle2
                            size={17}
                            className="mt-0.5 shrink-0 text-amber-400"
                          />

                          <span>
                            {benefit}
                          </span>
                        </li>
                      )
                    )}
                  </ul>
                )}

              {!mpesaSupported && (
                <p className="mb-4 text-xs text-amber-300">
                  M-Pesa checkout is unavailable
                  for this plan.
                </p>
              )}

              <button
                type="button"
                disabled={
                  disabled ||
                  !mpesaSupported
                }
                onClick={() =>
                  handleSelectPlan(plan)
                }
                className={`w-full rounded-xl px-4 py-3 text-sm font-semibold transition ${
                  selected
                    ? "bg-amber-300 text-black"
                    : "bg-amber-400 text-black hover:bg-amber-300"
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {selected
                  ? "Selected"
                  : "Select Plan"}
              </button>
            </article>
          );
        })}
      </div>

      <div className="flex items-center gap-2 text-xs text-zinc-500">
        <ShieldCheck
          size={16}
          className="text-amber-400"
        />

        <span>
          Subscription access is activated only
          after payment verification.
        </span>
      </div>
    </section>
  );
}