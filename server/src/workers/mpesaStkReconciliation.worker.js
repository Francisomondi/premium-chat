import mongoose from "mongoose";

import MpesaCallbackEvent, {
  MPESA_CALLBACK_EVENT_STATUSES,
} from "../models/MpesaCallbackEvent.model.js";

import {
  reconcileMpesaStkCallback,
} from "../services/mpesaStkReconciliation.service.js";

/**
 * ============================================================
 * PREMIUMCHAT — M-PESA STK RECONCILIATION WORKER
 * ============================================================
 *
 * STEP 19.8.15
 *
 * Responsibilities:
 *
 * - Discover callbacks requiring reconciliation.
 * - Process events using the reconciliation service.
 * - Retry temporary provider failures.
 * - Recover expired worker leases.
 * - Avoid overlapping worker cycles.
 * - Stop gracefully during server shutdown.
 *
 * SECURITY:
 *
 * - No direct payment verification writes.
 * - No subscription activation.
 * - No callback-based entitlement grants.
 * - All provider queries are server-side.
 *
 * DEPLOYMENT:
 *
 * Start exactly one scheduler per Node.js process.
 *
 * Multiple processes may run this worker because
 * the reconciliation service uses atomic leases.
 */

const {
  RECEIVED,
  RETRY_SCHEDULED,
  UNRESOLVED,
  PROCESSING,
} = MPESA_CALLBACK_EVENT_STATUSES;

/**
 * ============================================================
 * WORKER CONFIGURATION
 * ============================================================
 */

const DEFAULT_INTERVAL_MS = 30_000;

const DEFAULT_BATCH_SIZE = 10;

const MAX_BATCH_SIZE = 50;

const DEFAULT_MAX_ATTEMPTS = 12;

const MIN_INTERVAL_MS = 5_000;

const MAX_INTERVAL_MS = 300_000;

const parseInteger = (
  value,
  fallback,
  minimum,
  maximum
) => {
  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed)) {
    return fallback;
  }

  if (
    parsed < minimum ||
    parsed > maximum
  ) {
    return fallback;
  }

  return parsed;
};

const getWorkerConfig = () => ({
  enabled:
    process.env.MPESA_STK_RECONCILIATION_ENABLED ===
    "true",

  intervalMs: parseInteger(
    process.env.MPESA_STK_WORKER_INTERVAL_MS,
    DEFAULT_INTERVAL_MS,
    MIN_INTERVAL_MS,
    MAX_INTERVAL_MS
  ),

  batchSize: parseInteger(
    process.env.MPESA_STK_WORKER_BATCH_SIZE,
    DEFAULT_BATCH_SIZE,
    1,
    MAX_BATCH_SIZE
  ),

  maxAttempts: parseInteger(
    process.env.MPESA_STK_WORKER_MAX_ATTEMPTS,
    DEFAULT_MAX_ATTEMPTS,
    1,
    100
  ),
});

/**
 * ============================================================
 * WORKER STATE
 * ============================================================
 */

let workerTimer = null;

let workerRunning = false;

let workerStopping = false;

let currentCycle = null;

/**
 * ============================================================
 * DATABASE CONNECTION CHECK
 * ============================================================
 */

const databaseReady = () =>
  mongoose.connection.readyState === 1;

/**
 * ============================================================
 * FIND DUE CALLBACK EVENTS
 * ============================================================
 *
 * Read-only discovery.
 *
 * Atomic ownership is handled by
 * reconcileMpesaStkCallback().
 */

const findDueEvents = async ({
  batchSize,
  maxAttempts,
}) => {
  const now = new Date();

  return MpesaCallbackEvent.find({
    hasConflict: false,

    manualReviewRequiredAt: null,

    attemptCount: {
      $lt: maxAttempts,
    },

    $or: [
      {
        status: {
          $in: [
            RECEIVED,
            RETRY_SCHEDULED,
            UNRESOLVED,
          ],
        },

        $and: [
          {
            $or: [
              { nextAttemptAt: null },
              { nextAttemptAt: { $lte: now } },
            ],
          },
          {
            $or: [
              { leaseExpiresAt: null },
              { leaseExpiresAt: { $lte: now } },
            ],
          },
        ],
      },

      {
        status: PROCESSING,

        leaseExpiresAt: {
          $lte: now,
        },
      },
    ],
  })
    .select("_id")
    .sort({
      nextAttemptAt: 1,
      receivedAt: 1,
    })
    .limit(batchSize)
    .lean();
};

/**
 * ============================================================
 * ESCALATE EXHAUSTED ATTEMPTS
 * ============================================================
 *
 * A callback that repeatedly fails reconciliation
 * must not retry forever.
 *
 * Do not modify events with active leases.
 */

const escalateExhaustedEvents = async ({
  maxAttempts,
}) => {
  const now = new Date();

  const result =
    await MpesaCallbackEvent.updateMany(
      {
        attemptCount: {
          $gte: maxAttempts,
        },

        manualReviewRequiredAt: null,

        $or: [
          {
            status: {
              $in: [
                RECEIVED,
                RETRY_SCHEDULED,
                UNRESOLVED,
              ],
            },

            $or: [
              { leaseExpiresAt: null },
              { leaseExpiresAt: { $lte: now } },
            ],
          },

          {
            status: PROCESSING,

            leaseExpiresAt: {
              $lte: now,
            },
          },
        ],
      },
      {
        $set: {
          status:
            MPESA_CALLBACK_EVENT_STATUSES.MANUAL_REVIEW,

          manualReviewRequiredAt: now,

          manualReviewReason:
            "MAX_RECONCILIATION_ATTEMPTS_EXCEEDED",

          lastErrorCode:
            "MAX_RECONCILIATION_ATTEMPTS_EXCEEDED",

          nextAttemptAt: null,

          leaseOwner: null,

          leaseExpiresAt: null,
        },
      }
    );

  return result.modifiedCount || 0;
};

/**
 * ============================================================
 * PROCESS ONE CALLBACK
 * ============================================================
 */

const processEvent = async (event) => {
  const callbackEventId =
    event._id.toString();

  try {
    const result =
      await reconcileMpesaStkCallback({
        callbackEventId,
      });

    return {
      callbackEventId,

      reconciled:
        result?.reconciled === true,

      requiresManualReview:
        result?.requiresManualReview === true,

      reason:
        result?.reason ||
        "UNKNOWN_RECONCILIATION_RESULT",
    };
  } catch (error) {
    console.error(
      "[M-Pesa Worker] Event processing failed:",
      {
        callbackEventId,

        message:
          error instanceof Error
            ? error.message
            : "Unknown error",
      }
    );

    return {
      callbackEventId,

      reconciled: false,

      requiresManualReview: false,

      reason:
        "RECONCILIATION_PROCESSING_ERROR",
    };
  }
};

/**
 * ============================================================
 * RUN ONE RECONCILIATION CYCLE
 * ============================================================
 */

export const runMpesaStkReconciliationCycle =
  async () => {
    if (workerRunning || workerStopping) {
      return {
        skipped: true,
        reason: "WORKER_ALREADY_RUNNING_OR_STOPPING",
      };
    }

    if (!databaseReady()) {
      return {
        skipped: true,
        reason: "DATABASE_NOT_CONNECTED",
      };
    }

    workerRunning = true;

    const config = getWorkerConfig();

    try {
      const escalated =
        await escalateExhaustedEvents({
          maxAttempts: config.maxAttempts,
        });

      const events =
        await findDueEvents({
          batchSize: config.batchSize,
          maxAttempts: config.maxAttempts,
        });

      const results = [];

      /**
       * Sequential processing prevents this
       * process from overwhelming Daraja.
       *
       * Multiple processes remain protected
       * by database leases.
       */

      for (const event of events) {
        if (workerStopping) {
          break;
        }

        const result =
          await processEvent(event);

        results.push(result);
      }

      const reconciled =
        results.filter(
          (item) => item.reconciled
        ).length;

      const manualReview =
        results.filter(
          (item) => item.requiresManualReview
        ).length;

      return {
        skipped: false,

        processed: results.length,

        reconciled,

        manualReview,

        escalated,

        results,
      };
    } catch (error) {
      console.error(
        "[M-Pesa Worker] Cycle failed:",
        error instanceof Error
          ? error.message
          : "Unknown error"
      );

      return {
        skipped: false,

        failed: true,

        reason: "WORKER_CYCLE_FAILED",
      };
    } finally {
      workerRunning = false;
    }
  };

/**
 * ============================================================
 * SCHEDULE NEXT RECONCILIATION CYCLE
 * ============================================================
 *
 * - Prevent overlapping scheduled cycles.
 * - Handle unexpected asynchronous errors.
 * - Continue scheduling after recoverable failures.
 * - Respect graceful shutdown.
 */

const scheduleNextCycle = () => {
  if (workerStopping) {
    return;
  }

  const config = getWorkerConfig();

  workerTimer = setTimeout(async () => {
    workerTimer = null;

    if (workerStopping) {
      return;
    }

    try {
      currentCycle =
        runMpesaStkReconciliationCycle();

      const result = await currentCycle;

      if (
        result &&
        !result.skipped &&
        !result.failed &&
        result.processed > 0
      ) {
        console.info(
          "[M-Pesa Worker] Cycle completed:",
          {
            processed: result.processed,
            reconciled: result.reconciled,
            manualReview: result.manualReview,
            escalated: result.escalated,
          }
        );
      }

      if (result?.failed) {
        console.warn(
          "[M-Pesa Worker] Cycle reported failure:",
          result.reason
        );
      }
    } catch (error) {
      console.error(
        "[M-Pesa Worker] Unexpected scheduler error:",
        error instanceof Error
          ? error.message
          : "Unknown error"
      );
    } finally {
      currentCycle = null;

      if (!workerStopping) {
        scheduleNextCycle();
      }
    }
  }, config.intervalMs);

  workerTimer.unref?.();
};

/**
 * ============================================================
 * START WORKER
 * ============================================================
 */

export const startMpesaStkReconciliationWorker =
  () => {
    const config = getWorkerConfig();

    if (!config.enabled) {
      console.info(
        "[M-Pesa Worker] Reconciliation disabled."
      );

      return false;
    }

    if (workerTimer || workerRunning) {
      return false;
    }

    if (!databaseReady()) {
      console.warn(
        "[M-Pesa Worker] Database not ready."
      );

      return false;
    }

    workerStopping = false;

    console.info(
      "[M-Pesa Worker] Starting STK reconciliation.",
      {
        intervalMs: config.intervalMs,
        batchSize: config.batchSize,
        maxAttempts: config.maxAttempts,
      }
    );

    scheduleNextCycle();

    return true;
  };

/**
 * ============================================================
 * STOP WORKER
 * ============================================================
 */

export const stopMpesaStkReconciliationWorker =
  async () => {
    workerStopping = true;

    if (workerTimer) {
      clearTimeout(workerTimer);
      workerTimer = null;
    }

    if (currentCycle) {
      await currentCycle;
    }

    console.info(
      "[M-Pesa Worker] Reconciliation stopped."
    );
  };

export default {
  startMpesaStkReconciliationWorker,
  stopMpesaStkReconciliationWorker,
  runMpesaStkReconciliationCycle,
};