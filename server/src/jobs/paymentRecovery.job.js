import {
  recoverOutstandingPayments,
} from "../services/paymentRecovery.service.js";

/**
 * ============================================================
 * PREMIUMCHAT — PAYMENT RECOVERY JOB
 * ============================================================
 *
 * Run from a controlled background worker.
 *
 * Do not invoke this from:
 * - Public payment endpoints
 * - M-Pesa callback handlers
 * - Frontend requests
 *
 * Database writes are performed only by the
 * existing trusted settlement/activation services.
 */

let running = false;

export const runPaymentRecoveryJob = async ({
  batchSize = 25,
  minAgeMinutes = 5,
} = {}) => {
  if (running) {
    return {
      skipped: true,
      reason: "RECOVERY_JOB_ALREADY_RUNNING",
    };
  }

  running = true;

  try {
    const result =
      await recoverOutstandingPayments({
        batchSize,
        minAgeMinutes,
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
  runPaymentRecoveryJob,
};