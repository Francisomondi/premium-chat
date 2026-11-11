import { randomUUID } from "node:crypto";
import mongoose from "mongoose";


import MpesaCallbackEvent, {
  MPESA_CALLBACK_EVENT_STATUSES,
  MPESA_CALLBACK_SETTLEMENT_STATUSES,
} from "../models/MpesaCallbackEvent.model.js";

import {
  reconcileMpesaStkCallback,
} from "../services/mpesaStkReconciliation.service.js";

import {
  recordMediaPurchaseStkQuerySettlement,
} from "../services/mediaPurchaseSettlement.service.js";

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

const DEFAULT_SETTLEMENT_MAX_ATTEMPTS = 12;

const DEFAULT_SETTLEMENT_LEASE_MS = 120_000;

const DEFAULT_SETTLEMENT_RETRY_BASE_MS = 30_000;

const MAX_SETTLEMENT_RETRY_MS = 30 * 60 * 1000;

const MAX_SETTLEMENT_LEASE_MS = 600_000;

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

    settlementMaxAttempts: parseInteger(
    process.env.MPESA_STK_SETTLEMENT_MAX_ATTEMPTS,
    DEFAULT_SETTLEMENT_MAX_ATTEMPTS,
    1,
    100
  ),

  settlementLeaseMs: parseInteger(
    process.env.MPESA_STK_SETTLEMENT_LEASE_MS,
    DEFAULT_SETTLEMENT_LEASE_MS,
    30_000,
    MAX_SETTLEMENT_LEASE_MS
  ),

  settlementRetryBaseMs: parseInteger(
  process.env.MPESA_STK_SETTLEMENT_RETRY_BASE_MS,
  DEFAULT_SETTLEMENT_RETRY_BASE_MS,
  5_000,
  MAX_SETTLEMENT_RETRY_MS
),  
});

/**
 * ============================================================
 * SETTLEMENT RETRY BACKOFF
 * ============================================================
 */

const getSettlementRetryDelay = ({
  attemptCount,
  retryBaseMs,
}) => {
  const exponent = Math.min(
    Math.max(attemptCount - 1, 0),
    10
  );

  return Math.min(
    retryBaseMs * (2 ** exponent),
    MAX_SETTLEMENT_RETRY_MS
  );
};
/**
 * ============================================================
 * SETTLEMENT ERROR CLASSIFICATION
 * ============================================================
 */

const isPermanentSettlementError = (error) => {
  if (
    Number.isInteger(error?.statusCode)
  ) {
    return (
      error.statusCode >= 400 &&
      error.statusCode < 500
    );
  }

  return false;
};

const getSettlementErrorCode = (error) => {
  if (
    typeof error?.code === "string" &&
    error.code.trim()
  ) {
    return error.code;
  }

  if (
    typeof error?.message === "string" &&
    error.message.trim()
  ) {
    return error.message.slice(0, 120);
  }

  return "MEDIA_SETTLEMENT_PROCESSING_ERROR";
};

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
 * FIND DUE MEDIA SETTLEMENT EVENTS
 * ============================================================
 *
 * Read-only discovery.
 *
 * Settlement ownership is acquired atomically
 * in the settlement processing step.
 */

const findDueSettlementEvents = async ({
  batchSize,
  maxAttempts,
}) => {
  const now = new Date();

  return MpesaCallbackEvent.find({
    status: MPESA_CALLBACK_EVENT_STATUSES.RECONCILED,

    hasConflict: false,

    manualReviewRequiredAt: null,

    settlementAttemptCount: {
      $lt: maxAttempts,
    },

    $or: [
      {
        settlementStatus: {
          $in: [
            MPESA_CALLBACK_SETTLEMENT_STATUSES.PENDING,
            MPESA_CALLBACK_SETTLEMENT_STATUSES.RETRY_SCHEDULED,
          ],
        },

        $and: [
          {
            $or: [
              { nextSettlementAttemptAt: null },
              { nextSettlementAttemptAt: { $lte: now } },
            ],
          },
          {
            $or: [
              { settlementLeaseExpiresAt: null },
              { settlementLeaseExpiresAt: { $lte: now } },
            ],
          },
        ],
      },

      {
        settlementStatus:
          MPESA_CALLBACK_SETTLEMENT_STATUSES.PROCESSING,

        settlementLeaseExpiresAt: {
          $lte: now,
        },
      },
    ],
  })
    .select("_id")
    .sort({
      nextSettlementAttemptAt: 1,
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
 * ESCALATE EXHAUSTED SETTLEMENT ATTEMPTS
 * ============================================================
 */

const escalateExhaustedSettlementEvents = async ({
  maxAttempts,
}) => {
  const now = new Date();

  const result =
    await MpesaCallbackEvent.updateMany(
      {
        status:
          MPESA_CALLBACK_EVENT_STATUSES.RECONCILED,

        settlementAttemptCount: {
          $gte: maxAttempts,
        },

        settlementStatus: {
          $in: [
            MPESA_CALLBACK_SETTLEMENT_STATUSES.PENDING,
            MPESA_CALLBACK_SETTLEMENT_STATUSES.RETRY_SCHEDULED,
            MPESA_CALLBACK_SETTLEMENT_STATUSES.PROCESSING,
          ],
        },

        manualReviewRequiredAt: null,

        $or: [
          {
            settlementStatus: {
              $in: [
                MPESA_CALLBACK_SETTLEMENT_STATUSES.PENDING,
                MPESA_CALLBACK_SETTLEMENT_STATUSES.RETRY_SCHEDULED,
              ],
            },

            $or: [
              { settlementLeaseExpiresAt: null },
              { settlementLeaseExpiresAt: { $lte: now } },
            ],
          },

          {
            settlementStatus:
              MPESA_CALLBACK_SETTLEMENT_STATUSES.PROCESSING,

            settlementLeaseExpiresAt: {
              $lte: now,
            },
          },
        ],
      },
      {
        $set: {
          settlementStatus:
            MPESA_CALLBACK_SETTLEMENT_STATUSES.MANUAL_REVIEW,

          manualReviewRequiredAt: now,

          manualReviewReason:
            "MAX_MEDIA_SETTLEMENT_ATTEMPTS_EXCEEDED",

          settlementLastErrorCode:
            "MAX_MEDIA_SETTLEMENT_ATTEMPTS_EXCEEDED",

          nextSettlementAttemptAt: null,

          settlementLeaseOwner: null,

          settlementLeaseExpiresAt: null,
        },
      }
    );

  return result.modifiedCount || 0;
};

/**
 * ============================================================
 * CLAIM ONE MEDIA SETTLEMENT EVENT
 * ============================================================
 */

const claimSettlementEvent = async ({
  callbackEventId,
  leaseOwner,
  leaseMs,
  maxAttempts,
}) => {
  const now = new Date();

  const leaseExpiresAt =
    new Date(now.getTime() + leaseMs);

  return MpesaCallbackEvent.findOneAndUpdate(
    {
      _id: callbackEventId,

      status:
        MPESA_CALLBACK_EVENT_STATUSES.RECONCILED,

      hasConflict: false,

      manualReviewRequiredAt: null,

      settlementAttemptCount: {
        $lt: maxAttempts,
      },

      $or: [
        {
          settlementStatus: {
            $in: [
              MPESA_CALLBACK_SETTLEMENT_STATUSES.PENDING,
              MPESA_CALLBACK_SETTLEMENT_STATUSES.RETRY_SCHEDULED,
            ],
          },

          $and: [
            {
              $or: [
                { nextSettlementAttemptAt: null },
                { nextSettlementAttemptAt: { $lte: now } },
              ],
            },
            {
              $or: [
                { settlementLeaseExpiresAt: null },
                { settlementLeaseExpiresAt: { $lte: now } },
              ],
            },
          ],
        },

        {
          settlementStatus:
            MPESA_CALLBACK_SETTLEMENT_STATUSES.PROCESSING,

          settlementLeaseExpiresAt: {
            $lte: now,
          },
        },
      ],
    },
    {
      $set: {
        settlementStatus:
          MPESA_CALLBACK_SETTLEMENT_STATUSES.PROCESSING,

        settlementLeaseOwner: leaseOwner,

        settlementLeaseExpiresAt: leaseExpiresAt,

        nextSettlementAttemptAt: null,
      },

      $inc: {
        settlementAttemptCount: 1,
      },
    },
    {
      new: true,
      runValidators: true,
    }
  );
};

/**
 * ============================================================
 * HANDLE MEDIA SETTLEMENT FAILURE
 * ============================================================
 */

const handleSettlementFailure = async ({
  callbackEventId,
  leaseOwner,
  attemptCount,
  maxAttempts,
  retryBaseMs,
  error,
}) => {
  const permanent =
    isPermanentSettlementError(error);

  const exhausted =
    attemptCount >= maxAttempts;

  const requiresManualReview =
    permanent || exhausted;

  const now = new Date();

  const errorCode =
    getSettlementErrorCode(error);

  const updateFields = {
    settlementLeaseOwner: null,
    settlementLeaseExpiresAt: null,
    settlementLastErrorCode: errorCode,
  };

  if (requiresManualReview) {
    updateFields.settlementStatus =
      MPESA_CALLBACK_SETTLEMENT_STATUSES.MANUAL_REVIEW;

    updateFields.manualReviewRequiredAt = now;

    updateFields.manualReviewReason =
      exhausted
        ? "MAX_MEDIA_SETTLEMENT_ATTEMPTS_EXCEEDED"
        : errorCode;

    updateFields.nextSettlementAttemptAt = null;
  } else {
    updateFields.settlementStatus =
      MPESA_CALLBACK_SETTLEMENT_STATUSES.RETRY_SCHEDULED;

    updateFields.nextSettlementAttemptAt =
      new Date(
        now.getTime() +
        getSettlementRetryDelay({
          attemptCount,
          retryBaseMs,
        })
      );
  }

  const result = await MpesaCallbackEvent.updateOne(
    {
      _id: callbackEventId,

      status:
        MPESA_CALLBACK_EVENT_STATUSES.RECONCILED,

      settlementStatus:
        MPESA_CALLBACK_SETTLEMENT_STATUSES.PROCESSING,

      settlementLeaseOwner: leaseOwner,
    },
    {
      $set: updateFields,
    }
  );

  return {
    updated: result.modifiedCount === 1,
    requiresManualReview,
  };
};

/**
 * ============================================================
 * PROCESS ONE MEDIA SETTLEMENT
 * ============================================================
 */

const processSettlementEvent = async ({
  event,
  config,
}) => {
  const callbackEventId = event._id;

  const leaseOwner = randomUUID();

  let claimedEvent = null;

  try {
    claimedEvent = await claimSettlementEvent({
      callbackEventId,
      leaseOwner,
      leaseMs: config.settlementLeaseMs,
      maxAttempts: config.settlementMaxAttempts,
    });

    if (!claimedEvent) {
      return {
        callbackEventId: callbackEventId.toString(),
        settled: false,
        skipped: true,
        reason: "SETTLEMENT_LEASE_NOT_ACQUIRED",
      };
    }

    if (!claimedEvent.paymentId) {
      throw new Error("SETTLEMENT_PAYMENT_ID_MISSING");
    }

    await recordMediaPurchaseStkQuerySettlement({
      paymentId: claimedEvent.paymentId,
      callbackEventId: claimedEvent._id,
      settlementLeaseOwner: leaseOwner,
    });

    const completedAt = new Date();

    const completion =
      await MpesaCallbackEvent.updateOne(
        {
          _id: claimedEvent._id,

          settlementStatus:
            MPESA_CALLBACK_SETTLEMENT_STATUSES.PROCESSING,

          settlementLeaseOwner: leaseOwner,

          settlementLeaseExpiresAt: {
            $gt: completedAt,
          },
        },
        {
          $set: {
            settlementStatus:
              MPESA_CALLBACK_SETTLEMENT_STATUSES.COMPLETED,

            settledAt: completedAt,

            nextSettlementAttemptAt: null,

            settlementLeaseOwner: null,

            settlementLeaseExpiresAt: null,

            settlementLastErrorCode: null,
          },
        }
      );

    if (completion.modifiedCount !== 1) {
      throw new Error("SETTLEMENT_COMPLETION_LEASE_LOST");
    }

    return {
      callbackEventId: callbackEventId.toString(),
      settled: true,
      skipped: false,
      reason: "MEDIA_PURCHASE_SETTLED",
    };
  } catch (error) {
    console.error(
      "[M-Pesa Worker] Media settlement failed:",
      {
        callbackEventId: callbackEventId.toString(),
        errorCode: getSettlementErrorCode(error),
      }
    );

    if (claimedEvent) {
      try {
        const failure = await handleSettlementFailure({
          callbackEventId: claimedEvent._id,
          leaseOwner,
          attemptCount: claimedEvent.settlementAttemptCount,
          maxAttempts: config.settlementMaxAttempts,
          retryBaseMs: config.settlementRetryBaseMs,
          error,
        });

        return {
          callbackEventId: callbackEventId.toString(),
          settled: false,
          skipped: false,
          requiresManualReview:
            failure.requiresManualReview,
          retryScheduled:
            !failure.requiresManualReview && failure.updated,
          reason: getSettlementErrorCode(error),
        };
      } catch (failureError) {
        console.error(
          "[M-Pesa Worker] Settlement failure handling failed:",
          {
            callbackEventId: callbackEventId.toString(),
            errorCode: getSettlementErrorCode(failureError),
          }
        );
      }
    }

    return {
      callbackEventId: callbackEventId.toString(),
      settled: false,
      skipped: false,
      requiresManualReview: false,
      reason: "SETTLEMENT_PROCESSING_ERROR",
    };
  }
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

            /**
       * ======================================================
       * PROCESS MEDIA PURCHASE SETTLEMENT QUEUE
       * ======================================================
       */

      const settlementEscalated =
        await escalateExhaustedSettlementEvents({
          maxAttempts: config.settlementMaxAttempts,
        });

      const settlementEvents =
        await findDueSettlementEvents({
          batchSize: config.batchSize,
          maxAttempts: config.settlementMaxAttempts,
        });

      const settlementResults = [];

      for (const event of settlementEvents) {
        if (workerStopping) {
          break;
        }

        const result =
          await processSettlementEvent({
            event,
            config,
          });

        settlementResults.push(result);
      }

      const reconciled =
        results.filter(
          (item) => item.reconciled
        ).length;

      const manualReview =
        results.filter(
          (item) => item.requiresManualReview
        ).length;

              const settled =
        settlementResults.filter(
          (item) => item.settled
        ).length;

      const settlementManualReview =
        settlementResults.filter(
          (item) => item.requiresManualReview
        ).length;

      const settlementRetries =
        settlementResults.filter(
          (item) => item.retryScheduled
        ).length;

          return {
        skipped: false,

        processed: results.length,

        reconciled,

        manualReview,

        escalated,

        settlementsProcessed: settlementResults.length,

        settled,

        settlementManualReview,

        settlementRetries,

        settlementEscalated,

        results,

        settlementResults,
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
        (
          result.processed > 0 ||
          result.settlementsProcessed > 0 ||
          result.settlementEscalated > 0
        )
      ) {
        console.info(
          "[M-Pesa Worker] Cycle completed:",
          {
            processed: result.processed,
            reconciled: result.reconciled,
            manualReview: result.manualReview,
            escalated: result.escalated,

            settlementsProcessed:
              result.settlementsProcessed,

            settled: result.settled,

            settlementManualReview:
              result.settlementManualReview,

            settlementRetries:
              result.settlementRetries,

            settlementEscalated:
              result.settlementEscalated,
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