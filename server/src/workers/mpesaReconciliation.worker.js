import mongoose from "mongoose";

import {
  randomUUID,
} from "node:crypto";

import {
  claimNextMpesaReconciliationEvent,
  finalizeMpesaReconciliationEvent,
} from "../services/mpesaReconciliationQueue.service.js";

import {
  reconcileMpesaPayment,
} from "../services/mpesaReconciliation.service.js";

/**
 * ============================================================
 * PREMIUMCHAT — DURABLE M-PESA RECONCILIATION WORKER
 * ============================================================
 *
 * Module 4.3.5.7.8.13.14
 *
 * - Atomic event claims.
 * - Expiring leases.
 * - Exponential retry backoff.
 * - Manual-review escalation.
 *
 * Does not:
 *
 * - Initiate STK Push.
 * - Mark payments successful.
 * - Activate subscriptions.
 */

const MAX_EVENTS_PER_RUN = 100;

const MAX_RUNTIME_MS =
  4 * 60 * 1000;

const workerId =
  `mpesa-${randomUUID()}`;

const runReconciliation = async () => {
  const startedAt =
    Date.now();

  let processed = 0;

  let failed = 0;

  let manualReview = 0;

  while (
    processed < MAX_EVENTS_PER_RUN &&
    Date.now() - startedAt <
      MAX_RUNTIME_MS
  ) {
    const event =
      await claimNextMpesaReconciliationEvent({
        workerId,
      });

    if (!event) {
      break;
    }

    let result;

    try {
      if (!event.paymentId) {
        result = {
          checked: false,
          reason: "PAYMENT_ID_MISSING",
        };
      } else {
        result =
          await reconcileMpesaPayment({
            paymentId:
              event.paymentId.toString(),
          });
      }
    } catch (error) {
      failed++;

      result = {
        checked: false,
        reason:
          "RECONCILIATION_EXECUTION_FAILED",
      };

      console.error(
        JSON.stringify({
          event:
            "MPESA_RECONCILIATION_ERROR",

          callbackEventId:
            event._id.toString(),

          error:
            error.message,
        })
      );
    }

    const finalization =
      await finalizeMpesaReconciliationEvent({
        event,
        result,
      });

    if (
      finalization.status ===
      "MANUAL_REVIEW"
    ) {
      manualReview++;
    }

    processed++;
  }

  return {
    processed,
    failed,
    manualReview,
  };
};

const main = async () => {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error(
        "MONGODB_URI is required."
      );
    }

    await mongoose.connect(
      process.env.MONGODB_URI
    );

    const result =
      await runReconciliation();

    console.log(
      JSON.stringify({
        event:
          "MPESA_RECONCILIATION_COMPLETED",

        ...result,
      })
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        event:
          "MPESA_RECONCILIATION_WORKER_FAILED",

        error:
          error.message,
      })
    );

    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

main();