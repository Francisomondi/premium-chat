import { randomUUID } from "node:crypto";

import mongoose from "mongoose";

import PaymentRecoveryJob, {
  RECOVERY_JOB_TYPES,
  RECOVERY_JOB_STATUSES,
} from "../models/PaymentRecoveryJob.model.js";

/**
 * ============================================================
 * PREMIUMCHAT — PAYMENT RECOVERY SCHEDULER
 * ============================================================
 *
 * MODULE 4.3.5.7.8.13.17.6.13
 *
 * SECURITY:
 *
 * - Atomic job claiming.
 * - Attempt-count enforcement.
 * - Lease ownership validation.
 * - Terminal-state protection.
 * - Immediate review for non-retryable conflicts.
 * - No financial settlement verification.
 * - No subscription activation.
 */

const LEASE_MS = 120_000;

const BASE_RETRY_MS = 60_000;

const MAX_RETRY_MS = 3_600_000;

/**
 * Errors requiring human intervention.
 *
 * Do not automatically retry provider
 * evidence conflicts.
 */
const NON_RETRYABLE_ERRORS = new Set([
  "MPESA_EVIDENCE_CONFLICT",

  "RECONCILIATION_OPERATION_IDENTITY_CONFLICT",

  "RECONCILIATION_OPERATION_RESULT_CONFLICT",

  "RECONCILIATION_CONFLICT_ESCALATION_FAILED",

  "UNMATCHED_CALLBACK_IDENTITY_MISMATCH",

  "RECONCILIATION_PAYMENT_MISMATCH",

  "RECONCILIATION_OPERATION_ID_MISMATCH",
]);

const validString = (value) =>
  typeof value === "string" &&
  value.trim().length > 0;

const validObjectId = (value) =>
  mongoose.isObjectIdOrHexString(value);

const calculateRetryDelay = (attemptCount) => {
  if (
    !Number.isSafeInteger(attemptCount) ||
    attemptCount < 1
  ) {
    throw new Error("INVALID_RECOVERY_ATTEMPT_COUNT");
  }

  return Math.min(
    BASE_RETRY_MS *
      2 ** Math.min(attemptCount - 1, 20),
    MAX_RETRY_MS
  );
};

/**
 * ============================================================
 * ENQUEUE RECOVERY JOB
 * ============================================================
 */

export const enqueuePaymentRecovery = async ({
  type,
  resourceId,
} = {}) => {
  if (!Object.values(RECOVERY_JOB_TYPES).includes(type)) {
    throw new Error("INVALID_RECOVERY_JOB_TYPE");
  }

  if (!validObjectId(resourceId)) {
    throw new Error("INVALID_RECOVERY_RESOURCE_ID");
  }

  const now = new Date();

  return PaymentRecoveryJob.findOneAndUpdate(
    {
      type,
      resourceId,
    },
    {
      $setOnInsert: {
        type,
        resourceId,

        status: RECOVERY_JOB_STATUSES.PENDING,

        attemptCount: 0,

        maxAttempts: 8,

        nextAttemptAt: now,

        leaseOwner: null,

        leaseExpiresAt: null,

        completedAt: null,

        manualReviewReason: null,

        manualReviewRequiredAt: null,
      },
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    }
  );
};

/**
 * ============================================================
 * CLAIM RECOVERY JOB
 * ============================================================
 *
 * An atomic claim increments attemptCount.
 *
 * An expired final attempt is not reclaimed:
 * it must be escalated to manual review.
 */

export const claimPaymentRecoveryJob = async ({
  workerId = randomUUID(),
} = {}) => {
  if (!validString(workerId)) {
    throw new Error("INVALID_RECOVERY_WORKER_ID");
  }

  const now = new Date();

  const leaseExpiresAt =
    new Date(now.getTime() + LEASE_MS);

  return PaymentRecoveryJob.findOneAndUpdate(
    {
      $or: [
        {
          status: {
            $in: [
              RECOVERY_JOB_STATUSES.PENDING,
              RECOVERY_JOB_STATUSES.RETRY_SCHEDULED,
            ],
          },

          nextAttemptAt: {
            $lte: now,
          },
        },
        {
          status: RECOVERY_JOB_STATUSES.PROCESSING,

          leaseExpiresAt: {
            $lte: now,
          },
        },
      ],

      $expr: {
        $lt: [
          "$attemptCount",
          "$maxAttempts",
        ],
      },
    },
    {
      $set: {
        status: RECOVERY_JOB_STATUSES.PROCESSING,

        leaseOwner: workerId,

        leaseExpiresAt,

        completedAt: null,
      },

      $inc: {
        attemptCount: 1,

        __v: 1,
      },
    },
    {
      sort: {
        nextAttemptAt: 1,
        _id: 1,
      },

      new: true,
    }
  );
};

/**
 * ============================================================
 * COMPLETE RECOVERY JOB
 * ============================================================
 *
 * Completion means evidence recovery finished.
 * It does NOT mean payment verification.
 */

export const completePaymentRecoveryJob = async ({
  jobId,
  workerId,
} = {}) => {
  if (!validObjectId(jobId) || !validString(workerId)) {
    throw new Error("INVALID_RECOVERY_COMPLETION_ARGUMENTS");
  }

  const now = new Date();

  return PaymentRecoveryJob.findOneAndUpdate(
    {
      _id: jobId,

      status: RECOVERY_JOB_STATUSES.PROCESSING,

      leaseOwner: workerId,

      leaseExpiresAt: {
        $gt: now,
      },
    },
    {
      $set: {
        status: RECOVERY_JOB_STATUSES.COMPLETED,

        completedAt: now,

        nextAttemptAt: null,

        leaseOwner: null,

        leaseExpiresAt: null,

        manualReviewReason: null,

        manualReviewRequiredAt: null,
      },

      $inc: {
        __v: 1,
      },
    },
    {
      new: true,
    }
  );
};

/**
 * ============================================================
 * FAIL RECOVERY JOB
 * ============================================================
 *
 * Non-retryable conflicts immediately
 * enter MANUAL_REVIEW.
 *
 * Other failures use bounded retries.
 */

export const failPaymentRecoveryJob = async ({
  job,
  workerId,
  errorCode = "RECOVERY_FAILED",
} = {}) => {
  if (
    !job?._id ||
    !validString(workerId)
  ) {
    throw new Error("INVALID_RECOVERY_FAILURE_ARGUMENTS");
  }

  const now = new Date();

  const normalizedErrorCode =
    validString(errorCode)
      ? errorCode.trim().slice(0, 180)
      : "RECOVERY_FAILED";

  const exhausted =
    job.attemptCount >= job.maxAttempts;

  const nonRetryable =
    NON_RETRYABLE_ERRORS.has(normalizedErrorCode);

  const manualReview =
    exhausted || nonRetryable;

  const nextAttemptAt =
    manualReview
      ? null
      : new Date(
          now.getTime() +
            calculateRetryDelay(job.attemptCount)
        );

  const manualReviewReason =
    nonRetryable
      ? normalizedErrorCode
      : exhausted
        ? "RECOVERY_ATTEMPTS_EXHAUSTED"
        : null;

  return PaymentRecoveryJob.findOneAndUpdate(
    {
      _id: job._id,

      status: RECOVERY_JOB_STATUSES.PROCESSING,

      leaseOwner: workerId,

      leaseExpiresAt: {
        $gt: now,
      },

      attemptCount: job.attemptCount,
    },
    {
      $set: {
        status: manualReview
          ? RECOVERY_JOB_STATUSES.MANUAL_REVIEW
          : RECOVERY_JOB_STATUSES.RETRY_SCHEDULED,

        nextAttemptAt,

        leaseOwner: null,

        leaseExpiresAt: null,

        lastErrorCode: normalizedErrorCode,

        manualReviewReason,

        manualReviewRequiredAt:
          manualReview ? now : null,
      },

      $inc: {
        __v: 1,
      },
    },
    {
      new: true,
    }
  );
};

/**
 * ============================================================
 * ESCALATE EXPIRED EXHAUSTED JOBS
 * ============================================================
 *
 * Handles a worker crash during its
 * final permitted attempt.
 *
 * Without this function, such jobs may
 * remain PROCESSING indefinitely.
 */

export const escalateExpiredRecoveryJobs = async ({
  now = new Date(),
} = {}) => {
  if (
    !(now instanceof Date) ||
    Number.isNaN(now.getTime())
  ) {
    throw new Error("INVALID_RECOVERY_ESCALATION_TIME");
  }

  return PaymentRecoveryJob.updateMany(
    {
      status: RECOVERY_JOB_STATUSES.PROCESSING,

      leaseExpiresAt: {
        $lte: now,
      },

      $expr: {
        $gte: [
          "$attemptCount",
          "$maxAttempts",
        ],
      },
    },
    {
      $set: {
        status: RECOVERY_JOB_STATUSES.MANUAL_REVIEW,

        nextAttemptAt: null,

        leaseOwner: null,

        leaseExpiresAt: null,

        lastErrorCode:
          "RECOVERY_FINAL_ATTEMPT_LEASE_EXPIRED",

        manualReviewReason:
          "RECOVERY_FINAL_ATTEMPT_LEASE_EXPIRED",

        manualReviewRequiredAt: now,
      },

      $inc: {
        __v: 1,
      },
    }
  );
};