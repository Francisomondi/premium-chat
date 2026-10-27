/**
 * ============================================================
 * PREMIUMCHAT — PAYMENT CONSTANTS
 * ============================================================
 *
 * Module 4.3.5.7.7
 *
 * Provider-independent payment definitions.
 *
 * These constants do not confirm payments
 * or grant subscription access.
 */

/**
 * PAYMENT PURPOSES
 */

export const PAYMENT_PURPOSES = Object.freeze({
  SUBSCRIPTION_INITIAL: "SUBSCRIPTION_INITIAL",

  SUBSCRIPTION_RENEWAL: "SUBSCRIPTION_RENEWAL",

  MEDIA_PURCHASE: "MEDIA_PURCHASE",

  PAID_MESSAGE: "PAID_MESSAGE",

  CREATOR_TIP: "CREATOR_TIP",
});

/**
 * PAYMENT STATUSES
 */

export const PAYMENT_STATUSES = Object.freeze({
  PENDING: "PENDING",

  PROCESSING: "PROCESSING",

  SUCCEEDED: "SUCCEEDED",

  FAILED: "FAILED",

  CANCELED: "CANCELED",

  REFUNDED: "REFUNDED",

  PARTIALLY_REFUNDED: "PARTIALLY_REFUNDED",

  DISPUTED: "DISPUTED",
});

/**
 * PAYMENT PROVIDERS
 *
 * A provider must be explicitly supported
 * before it can initiate real transactions.
 */

export const PAYMENT_PROVIDERS = Object.freeze({
  MPESA: "MPESA",

  STRIPE: "STRIPE",
});

/**
 * PAYMENT VERIFICATION STATUSES
 */

export const PAYMENT_VERIFICATION_STATUSES =
  Object.freeze({
    UNVERIFIED: "UNVERIFIED",

    VERIFIED: "VERIFIED",

    REJECTED: "REJECTED",
  });

/**
 * PAYMENT CURRENCIES
 */

export const PAYMENT_CURRENCIES = Object.freeze({
  KES: "KES",

  USD: "USD",
});

/**
 * PAYMENT FAILURE REASONS
 */

export const PAYMENT_FAILURE_REASONS = Object.freeze({
  PROVIDER_REJECTED: "PROVIDER_REJECTED",

  PAYMENT_CANCELED: "PAYMENT_CANCELED",

  PAYMENT_TIMEOUT: "PAYMENT_TIMEOUT",

  INSUFFICIENT_FUNDS: "INSUFFICIENT_FUNDS",

  PAYMENT_VERIFICATION_FAILED:
    "PAYMENT_VERIFICATION_FAILED",

  AMOUNT_MISMATCH: "AMOUNT_MISMATCH",

  CURRENCY_MISMATCH: "CURRENCY_MISMATCH",

  DUPLICATE_PROVIDER_TRANSACTION:
    "DUPLICATE_PROVIDER_TRANSACTION",

  UNKNOWN: "UNKNOWN",
});

/**
 * ============================================================
 * M-PESA PAYMENT INITIATION STATES
 * ============================================================
 */

export const PAYMENT_INITIATION_STATUSES = Object.freeze({
  RESERVED: "RESERVED",

  DISPATCHING: "DISPATCHING",

  ACCEPTED: "ACCEPTED",

  UNKNOWN: "UNKNOWN",

  REJECTED: "REJECTED",
});