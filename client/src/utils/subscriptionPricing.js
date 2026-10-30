/**
 * ============================================================
 * PREMIUMCHAT — SUBSCRIPTION PRICING UTILITIES
 * ============================================================
 *
 * STEP 19.8.21
 *
 * Prices are received from the backend
 * in minor currency units.
 *
 * These utilities are for display only.
 *
 * They must never determine the amount
 * charged by the payment provider.
 */

/**
 * ============================================================
 * FORMAT SUBSCRIPTION PRICE
 * ============================================================
 */

export const formatSubscriptionPrice = (
  monthlyPriceMinor,
  currency = "KES"
) => {
  if (
    !Number.isSafeInteger(monthlyPriceMinor) ||
    monthlyPriceMinor < 1
  ) {
    return "Price unavailable";
  }

  if (!["KES", "USD"].includes(currency)) {
    return "Currency unavailable";
  }

  const amount = monthlyPriceMinor / 100;

  try {
    return new Intl.NumberFormat("en-KE", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return "Price unavailable";
  }
};

/**
 * ============================================================
 * CHECK PLAN AVAILABILITY
 * ============================================================
 */

export const isSubscriptionPlanAvailable = (
  plan
) => {
  return (
    Boolean(plan) &&
    typeof plan === "object" &&
    Boolean(plan._id || plan.id) &&
    plan.status === "ACTIVE" &&
    ["KES", "USD"].includes(plan.currency) &&
    Number.isSafeInteger(
      plan.monthlyPriceMinor
    ) &&
    plan.monthlyPriceMinor > 0
  );
};

/**
 * ============================================================
 * CHECK M-PESA COMPATIBILITY
 * ============================================================
 *
 * Current M-Pesa integration supports
 * KES-denominated subscriptions.
 *
 * This is a frontend eligibility check,
 * not a replacement for backend validation.
 */

export const supportsMpesaCheckout = (plan) => {
  return (
    isSubscriptionPlanAvailable(plan) &&
    plan.currency === "KES"
  );
};