/**
 * ============================================================
 * PREMIUMCHAT — MESSAGING CONSTANTS
 * ============================================================
 */

export const MESSAGING_ACCESS_POLICIES =
  Object.freeze({
    STANDARD: "STANDARD",

    SUBSCRIBERS_ONLY:
      "SUBSCRIBERS_ONLY",

    PAID_PER_MESSAGE:
      "PAID_PER_MESSAGE",
  });

export const MESSAGING_ACCESS_REASONS =
  Object.freeze({
    STANDARD_ACCESS:
      "STANDARD_ACCESS",

    SUBSCRIPTION_REQUIRED:
      "SUBSCRIPTION_REQUIRED",

    PAYMENT_REQUIRED:
      "PAYMENT_REQUIRED",

    POLICY_NOT_CONFIGURED:
      "POLICY_NOT_CONFIGURED",
  });