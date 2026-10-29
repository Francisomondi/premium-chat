import {
  expireSubscriptions,
} from "../services/subscriberSubscription.service.js";

/**
 * ============================================================
 * PREMIUMCHAT — SUBSCRIPTION EXPIRATION JOB
 * ============================================================
 *
 * STEP 18.32
 *
 * Responsibilities:
 *
 * - Expire completed paid periods.
 * - Preserve existing expiration logic.
 * - Prevent overlapping runs within one process.
 *
 * IMPORTANT:
 *
 * Authorization checks enforce period expiration
 * independently of this job.
 */

let running = false;

export const runSubscriptionExpirationJob =
  async ({
    batchSize = 100,
  } = {}) => {
    if (running) {
      return {
        skipped: true,
        reason:
          "SUBSCRIPTION_EXPIRATION_ALREADY_RUNNING",
      };
    }

    running = true;

    try {
      const result =
        await expireSubscriptions({
          batchSize,
        });

      return {
        skipped: false,
        ...result,
      };
    } finally {
      running = false;
    }
  };

export default {
  runSubscriptionExpirationJob,
};