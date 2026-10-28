import { randomUUID } from "node:crypto";

import PaymentTransaction from "../models/PaymentTransaction.model.js";

import MpesaUnmatchedCallback from "../models/MpesaUnmatchedCallback.model.js";

import {
  reconcileMpesaPayment,
} from "../services/mpesaReconciliation.service.js";

import {
  recoverUnmatchedMpesaCallbacks,
} from "../services/mpesaUnmatchedCallbackRecovery.service.js";

import {
  claimPaymentRecoveryJob,
  completePaymentRecoveryJob,
  failPaymentRecoveryJob,
} from "../services/paymentRecoveryScheduler.service.js";

import {
  RECOVERY_JOB_TYPES,
} from "../models/PaymentRecoveryJob.model.js";

const WORKER_ID = randomUUID();

const POLL_INTERVAL_MS = 15_000;

let running = false;
let timer = null;

const processRecoveryJob = async (job) => {
  if (job.type === RECOVERY_JOB_TYPES.MISSING_CALLBACK) {
    const payment =
      await PaymentTransaction.findById(job.resourceId);

    if (!payment) {
      throw new Error("PAYMENT_NOT_FOUND");
    }

    if (!payment.providerTransactionId) {
      throw new Error("CHECKOUT_REQUEST_ID_MISSING");
    }

    /*
     * Provider query evidence does not independently
     * verify financial settlement.
     */
    await reconcileMpesaPayment({
      paymentId: payment._id.toString(),
    });

    return;
  }

  if (job.type === RECOVERY_JOB_TYPES.UNMATCHED_CALLBACK) {
    const callback =
      await MpesaUnmatchedCallback.findById(job.resourceId);

    if (!callback) {
      throw new Error("UNMATCHED_CALLBACK_NOT_FOUND");
    }

    /*
     * Existing recovery service handles exact
     * callback-to-payment matching.
     *
     * This call currently processes a batch rather
     * than one specific callback.
     */
    await recoverUnmatchedMpesaCallbacks({
      limit: 1,
    });

    return;
  }

  throw new Error("UNSUPPORTED_RECOVERY_JOB_TYPE");
};

const tick = async () => {
  if (running) return;

  running = true;

  try {
    const job = await claimPaymentRecoveryJob({
      workerId: WORKER_ID,
    });

    if (!job) return;

    try {
      await processRecoveryJob(job);

      const completed =
        await completePaymentRecoveryJob({
          jobId: job._id,
          workerId: WORKER_ID,
        });

      if (!completed) {
        console.error(
          "[PaymentRecovery] Completion lease expired:",
          job._id.toString()
        );
      }
    } catch (error) {
      console.error(
        "[PaymentRecovery] Job failed:",
        job._id.toString(),
        error?.message
      );

      await failPaymentRecoveryJob({
        job,
        workerId: WORKER_ID,
        errorCode:
          error?.message || "RECOVERY_FAILED",
      });
    }
  } finally {
    running = false;
  }
};

export const startPaymentRecoveryWorker = () => {
  if (timer) return;

  timer = setInterval(() => {
    tick().catch((error) => {
      console.error(
        "[PaymentRecovery] Worker error:",
        error
      );
    });
  }, POLL_INTERVAL_MS);

  timer.unref?.();
};

export const stopPaymentRecoveryWorker = () => {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
};