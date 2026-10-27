/**
 * ============================================================
 * PREMIUMCHAT — MEDIA ACCESS CONSTANTS
 * ============================================================
 *
 * Defines the supported access policies for
 * creator-owned media.
 *
 * IMPORTANT:
 *
 * These policies describe authorization rules.
 *
 * They do not process payments or automatically
 * grant access to protected media.
 */

export const MEDIA_ACCESS_POLICIES =
  Object.freeze({
    PUBLIC: "PUBLIC",

    SUBSCRIBERS_ONLY:
      "SUBSCRIBERS_ONLY",

    PURCHASE_ONLY:
      "PURCHASE_ONLY",

    SUBSCRIPTION_OR_PURCHASE:
      "SUBSCRIPTION_OR_PURCHASE",
  });

export const MEDIA_ACCESS_REASONS =
  Object.freeze({
    ACCESS_GRANTED:
      "ACCESS_GRANTED",

    MEDIA_NOT_FOUND:
      "MEDIA_NOT_FOUND",

    INVALID_VIEWER:
      "INVALID_VIEWER",

    VIEWER_NOT_ELIGIBLE:
      "VIEWER_NOT_ELIGIBLE",

    SUBSCRIPTION_REQUIRED:
      "SUBSCRIPTION_REQUIRED",

    PURCHASE_REQUIRED:
      "PURCHASE_REQUIRED",

    ENTITLEMENT_REQUIRED:
      "ENTITLEMENT_REQUIRED",

    PAYMENT_VERIFICATION_REQUIRED:
      "PAYMENT_VERIFICATION_REQUIRED",

    UNSUPPORTED_ACCESS_POLICY:
      "UNSUPPORTED_ACCESS_POLICY",
  });