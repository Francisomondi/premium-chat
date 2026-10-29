import mongoose from "mongoose";

import {
  randomUUID,
} from "node:crypto";

import MpesaCallbackEvent, {
  MPESA_CALLBACK_EVENT_STATUSES,
} from "../models/MpesaCallbackEvent.model.js";

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
 * MODULE 4.3.5.7.8.13.17.6.9
 *
 * RESPONSIBILITIES:
 *
 * - Claim callback reconciliation events.
 * - Query provider through reconciliation service.
 * - Finalize events using their existing lease.
 * - Respect concurrent conflict escalation.
 * - Track unresolved and manual-review outcomes.
 * - Stop after bounded work.
 *
 * SECURITY:
 *
 * - No STK Push initiation.
 * - No payment success assignment.
 * - No financial verification.
 * - No subscription activation.
 * - No premium content authorization.
 *
 * CONCURRENCY:
 *
 * - Finalization requires the original lease.
 * - Conflicting callbacks invalidate that lease.
 * - Lost leases are never forcefully reclaimed.
 */

const MAX_EVENTS_PER_RUN = 100;

const MAX_RUNTIME_MS =
  4 * 60 * 1000;

const workerId =
  `mpesa-${randomUUID()}`;

/**
 * ============================================================
 * FEATURE FLAG
 * ============================================================
 *
 * Default: disabled.
 *
 * The worker must be explicitly enabled
 * before processing reconciliation jobs.
 */

const isWorkerEnabled = () =>
  process.env.PAYMENT_RECOVERY_WORKER_ENABLED ===
  "true";

/**
 * ============================================================
 * INSPECT LOST LEASE
 * ============================================================
 *
 * A lease may be lost because:
 *
 * 1. Another worker reclaimed it.
 * 2. The lease expired.
 * 3. A provider conflict escalated the callback.
 * 4. A duplicate callback conflict escalated it.
 *
 * Never overwrite the current state.
 */

const inspectLostLease = async ({
  callbackEventId,
}) => {
  const current =
    await MpesaCallbackEvent.findById(
      callbackEventId
    ).select(
      "status hasConflict manualReviewReason"
    );

  if (!current) {
    return {
      manualReview: false,
      reason: "CALLBACK_EVENT_NOT_FOUND",
    };
  }

  if (
    current.status ===
    MPESA_CALLBACK_EVENT_STATUSES.MANUAL_REVIEW
  ) {
    return {
      manualReview: true,
      reason:
        current.manualReviewReason ||
        "CALLBACK_MANUAL_REVIEW",
    };
  }

  return {
    manualReview: false,
    reason: "LEASE_LOST",
  };
};

/**
 * ============================================================
 * RUN RECONCILIATION
 * ============================================================
 */

const runReconciliation = async () => {
  const startedAt = Date.now();

  let processed = 0;

  let failed = 0;

  let manualReview = 0;

  let leaseLost = 0;

  let reconciled = 0;

  let retryScheduled = 0;

  while (
    processed < MAX_EVENTS_PER_RUN &&
    Date.now() - startedAt <
      MAX_RUNTIME_MS
  ) {
    /**
     * STEP 1:
     * Claim next eligible callback.
     */

    const event =
      await claimNextMpesaReconciliationEvent({
        workerId,
      });

    if (!event) {
      break;
    }

    processed++;

    let result;

    /**
     * STEP 2:
     * Perform reconciliation.
     */

    try {
      if (!event.paymentId) {
        result = {
          checked: false,
          reason: "PAYMENT_ID_MISSING",
        };
      } else {
      const reconciliationOperationId =
        `CALLBACK:${event._id.toString()}:${event.attemptCount}`;

      result =
        await reconcileMpesaPayment({
          paymentId:
            event.paymentId.toString(),

          reconciliationOperationId,
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
            error?.message ||
            "UNKNOWN_ERROR",
        })
      );
    }

    /**
     * STEP 3:
     * Finalize using the original lease.
     */

    let finalization;

    try {
      finalization =
        await finalizeMpesaReconciliationEvent({
          event,
          result,
        });
    } catch (error) {
      failed++;

      console.error(
        JSON.stringify({
          event:
            "MPESA_RECONCILIATION_FINALIZATION_ERROR",

          callbackEventId:
            event._id.toString(),

          error:
            error?.message ||
            "UNKNOWN_ERROR",
        })
      );

      /**
       * Do not forcefully update the event.
       *
       * Its lease will eventually expire,
       * allowing the queue to recover it.
       */

      continue;
    }

    /**
     * STEP 4:
     * Handle lost lease.
     */

    if (!finalization?.finalized) {
      leaseLost++;

      const inspection =
        await inspectLostLease({
          callbackEventId:
            event._id.toString(),
        });

      if (inspection.manualReview) {
        manualReview++;

        console.warn(
          JSON.stringify({
            event:
              "MPESA_RECONCILIATION_MANUAL_REVIEW",

            callbackEventId:
              event._id.toString(),

            reason:
              inspection.reason,
          })
        );

        continue;
      }

      console.warn(
        JSON.stringify({
          event:
            "MPESA_RECONCILIATION_LEASE_LOST",

          callbackEventId:
            event._id.toString(),

          reason:
            inspection.reason,
        })
      );

      continue;
    }

    /**
     * STEP 5:
     * Count finalized outcomes.
     */

    switch (finalization.status) {
      case MPESA_CALLBACK_EVENT_STATUSES.RECONCILED:
        reconciled++;
        break;

      case MPESA_CALLBACK_EVENT_STATUSES.RETRY_SCHEDULED:
        retryScheduled++;
        break;

      case MPESA_CALLBACK_EVENT_STATUSES.MANUAL_REVIEW:
        manualReview++;
        break;

      default:
        break;
    }
  }

  return {
    processed,

    failed,

    reconciled,

    retryScheduled,

    manualReview,

    leaseLost,
  };
};

/**
 * ============================================================
 * MAIN
 * ============================================================
 */

const main = async () => {
  try {
    /**
     * STEP 1:
     * Enforce feature flag.
     */

    if (!isWorkerEnabled()) {
      console.log(
        JSON.stringify({
          event:
            "MPESA_RECONCILIATION_WORKER_DISABLED",

          reason:
            "PAYMENT_RECOVERY_WORKER_ENABLED_FALSE",
        })
      );

      return;
    }

    /**
     * STEP 2:
     * Require MongoDB connection string.
     */

    if (!process.env.MONGODB_URI) {
      throw new Error(
        "MONGODB_URI is required."
      );
    }

    /**
     * STEP 3:
     * Connect to MongoDB.
     */

    await mongoose.connect(
      process.env.MONGODB_URI
    );

    /**
     * STEP 4:
     * Process reconciliation queue.
     */

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
          error?.message ||
          "UNKNOWN_ERROR",
      })
    );

    process.exitCode = 1;
  } finally {
    /**
     * Disconnect safely.
     */

    if (
      mongoose.connection.readyState !== 0
    ) {
      await mongoose.disconnect();
    }
  }
};

main();