import { randomUUID } from "node:crypto";

import PaymentRecoveryJob, {
  RECOVERY_JOB_TYPES,
  RECOVERY_JOB_STATUSES,
} from "../models/PaymentRecoveryJob.model.js";

const LEASE_MS = 120_000;
const BASE_RETRY_MS = 60_000;
const MAX_RETRY_MS = 3_600_000;

export const enqueuePaymentRecovery = async ({
  type,
  resourceId,
}) => {
  if (!Object.values(RECOVERY_JOB_TYPES).includes(type)) {
    throw new Error("Invalid payment recovery job type.");
  }

  return PaymentRecoveryJob.findOneAndUpdate(
    { type, resourceId },
    {
      $setOnInsert: {
        type,
        resourceId,
        status: RECOVERY_JOB_STATUSES.PENDING,
        nextAttemptAt: new Date(),
      },
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    }
  );
};

export const claimPaymentRecoveryJob = async ({
  workerId = randomUUID(),
} = {}) => {
  const now = new Date();

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
          nextAttemptAt: { $lte: now },
        },
        {
          status: RECOVERY_JOB_STATUSES.PROCESSING,
          leaseExpiresAt: { $lte: now },
        },
      ],
      $expr: {
        $lt: ["$attemptCount", "$maxAttempts"],
      },
    },
    {
      $set: {
        status: RECOVERY_JOB_STATUSES.PROCESSING,
        leaseOwner: workerId,
        leaseExpiresAt: new Date(
          now.getTime() + LEASE_MS
        ),
      },
      $inc: {
        attemptCount: 1,
      },
    },
    {
      sort: { nextAttemptAt: 1 },
      new: true,
    }
  );
};

export const completePaymentRecoveryJob = async ({
  jobId,
  workerId,
}) => {
  return PaymentRecoveryJob.findOneAndUpdate(
    {
      _id: jobId,
      status: RECOVERY_JOB_STATUSES.PROCESSING,
      leaseOwner: workerId,
      leaseExpiresAt: { $gt: new Date() },
    },
    {
      $set: {
        status: RECOVERY_JOB_STATUSES.COMPLETED,
        completedAt: new Date(),
      },
      $unset: {
        leaseOwner: "",
        leaseExpiresAt: "",
      },
    },
    { new: true }
  );
};

export const failPaymentRecoveryJob = async ({
  job,
  workerId,
  errorCode = "RECOVERY_FAILED",
}) => {
  const exhausted =
    job.attemptCount >= job.maxAttempts;

  const delay = Math.min(
    BASE_RETRY_MS *
      2 ** Math.max(0, job.attemptCount - 1),
    MAX_RETRY_MS
  );

  return PaymentRecoveryJob.findOneAndUpdate(
    {
      _id: job._id,
      status: RECOVERY_JOB_STATUSES.PROCESSING,
      leaseOwner: workerId,
      leaseExpiresAt: { $gt: new Date() },
    },
    {
      $set: {
        status: exhausted
          ? RECOVERY_JOB_STATUSES.MANUAL_REVIEW
          : RECOVERY_JOB_STATUSES.RETRY_SCHEDULED,

        nextAttemptAt: new Date(
          Date.now() + delay
        ),

        lastErrorCode: errorCode,

        manualReviewReason: exhausted
          ? "RECOVERY_ATTEMPTS_EXHAUSTED"
          : null,
      },
      $unset: {
        leaseOwner: "",
        leaseExpiresAt: "",
      },
    },
    { new: true }
  );
};