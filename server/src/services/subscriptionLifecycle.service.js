import {
  expireSubscriptions,
} from "./subscriberSubscription.service.js";

/**
 * ============================================================
 * PREMIUMCHAT — SUBSCRIPTION LIFECYCLE SERVICE
 * ============================================================
 *
 * Responsibilities:
 *
 * 1. Coordinate subscription expiration.
 * 2. Provide a trusted expiration entry point.
 * 3. Preserve separation from payment processing.
 * 4. Prevent unauthorized subscription renewal.
 *
 * SECURITY:
 *
 * - Never activate subscriptions without payment.
 * - Never extend billing periods without payment.
 * - Never trust client-supplied payment statuses.
 * - Never expose lifecycle jobs through public APIs.
 */

/**
 * ============================================================
 * PROCESS EXPIRED SUBSCRIPTIONS
 * ============================================================
 */

export const processExpiredSubscriptions =
  async ({
    now = new Date(),
    batchSize = 500,
  } = {}) => {
    return expireSubscriptions({
      now,
      batchSize,
    });
  };

/**
 * ============================================================
 * REQUEST SUBSCRIPTION RENEWAL
 * ============================================================
 *
 * Placeholder until payment integration.
 */

export const requestSubscriptionRenewal =
  async () => {
    return {
      success: false,

      code:
        "RENEWAL_PAYMENT_INTEGRATION_REQUIRED",

      message:
        "Subscription renewal requires payment integration.",
    };
  };

/**
 * ============================================================
 * PROCESS VERIFIED RENEWAL
 * ============================================================
 *
 * Never activate renewal without trusted
 * payment verification.
 */

export const processVerifiedRenewal =
  async () => {
    return {
      success: false,

      code:
        "PAYMENT_VERIFICATION_REQUIRED",

      message:
        "Subscription renewal cannot be activated without verified payment.",
    };
  };

export default {
  processExpiredSubscriptions,
  requestSubscriptionRenewal,
  processVerifiedRenewal,
};