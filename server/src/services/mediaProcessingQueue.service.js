
import { randomUUID } from "node:crypto";

import mongoose from "mongoose";

import Media, {
  MEDIA_TYPES,
  MEDIA_STATUSES,
  MEDIA_MODERATION_STATUSES,
} from "../models/Media.model.js";

import MediaProcessingJob, {
  MEDIA_JOB_STATUSES,
} from "../models/MediaProcessingJob.model.js";

/**
 * ============================================================
 * PREMIUMCHAT — MEDIA PROCESSING QUEUE
 * ============================================================
 *
 * Responsibilities:
 *
 * - Recover orphaned image processing records.
 * - Atomically claim eligible image jobs.
 * - Enforce unique lease ownership.
 * - Recover expired processing leases.
 * - Schedule bounded retries.
 * - Finalize media and jobs transactionally.
 *
 * IMPORTANT:
 *
 * - Only images are claimed by this queue.
 * - Video jobs remain queued until video processing exists.
 * - Processing never approves media.
 * - READY does not mean publicly available.
 */

/**
 * ============================================================
 * POLICY
 * ============================================================
 */

const MEDIA_QUEUE_POLICY = Object.freeze({
  MAX_ATTEMPTS: 3,

  LEASE_DURATION_MS: 5 * 60 * 1000,

  INITIAL_RETRY_DELAY_MS: 30 * 1000,

  MAX_RETRY_DELAY_MS: 15 * 60 * 1000,

  ORPHAN_RECOVERY_BATCH_SIZE: 100,
});

/**
 * ============================================================
 * VALIDATION
 * ============================================================
 */

const validateWorkerId = (workerId) => {
  if (
    typeof workerId !== "string" ||
    workerId.trim().length < 1 ||
    workerId.length > 60
  ) {
    throw new Error(
      "Invalid media processing worker identifier."
    );
  }
};

const calculateNextAttemptAt = ({
  attempts,
  now = new Date(),
}) => {
  const exponent = Math.max(0, attempts - 1);

  const delay = Math.min(
    MEDIA_QUEUE_POLICY.INITIAL_RETRY_DELAY_MS *
      (2 ** exponent),
    MEDIA_QUEUE_POLICY.MAX_RETRY_DELAY_MS
  );

  return new Date(now.getTime() + delay);
};

const normalizeErrorValue = (value, maxLength) => {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();

  return normalized
    ? normalized.slice(0, maxLength)
    : null;
};

/**
 * ============================================================
 * RECOVER ORPHANED IMAGE JOBS
 * ============================================================
 *
 * Handles this failure scenario:
 *
 * 1. Media transitions to PROCESSING.
 * 2. Application crashes before queue insertion.
 * 3. Worker later discovers the media record.
 *
 * The unique mediaId index prevents duplicate jobs.
 *
 * Videos are deliberately excluded.
 */

export const recoverOrphanedMediaProcessingJobs =
  async ({
    limit =
      MEDIA_QUEUE_POLICY.ORPHAN_RECOVERY_BATCH_SIZE,
  } = {}) => {
    const safeLimit = Math.max(
      1,
      Math.min(
        Number.isInteger(limit) ? limit : 100,
        500
      )
    );


const orphanCandidates = await Media.aggregate([
  {
    $match: {
      mediaType: MEDIA_TYPES.IMAGE,

      status: MEDIA_STATUSES.PROCESSING,

      moderationStatus:
        MEDIA_MODERATION_STATUSES.PENDING,

      deletedAt: null,
    },
  },

  {
    $lookup: {
      from: MediaProcessingJob.collection.name,

      localField: "_id",

      foreignField: "mediaId",

      as: "processingJobs",
    },
  },

  {
    $match: {
      "processingJobs.0": {
        $exists: false,
      },
    },
  },

  {
    $sort: {
      createdAt: 1,
    },
  },

  {
    $limit: safeLimit,
  },

  {
    $project: {
      _id: 1,
    },
  },
]);


    let recovered = 0;

    for (const media of orphanCandidates) {
      try {
        const result =
          await MediaProcessingJob.updateOne(
            {
              mediaId: media._id,
            },
            {
              $setOnInsert: {
                mediaId: media._id,

                status:
                  MEDIA_JOB_STATUSES.QUEUED,

                attempts: 0,

                maxAttempts:
                  MEDIA_QUEUE_POLICY.MAX_ATTEMPTS,

                availableAt: new Date(),
              },
            },
            {
              upsert: true,
              setDefaultsOnInsert: true,
            }
          );

        if (result.upsertedCount > 0) {
          recovered++;
        }
      } catch (error) {
        // A concurrent worker may have inserted
        // the same job using the unique mediaId index.

        if (error?.code === 11000) {
          continue;
        }

        throw error;
      }
    }

    return {
      scanned: orphanCandidates.length,
      recovered,
    };
  };

/**
 * ============================================================
 * CLAIM NEXT IMAGE JOB
 * ============================================================
 *
 * First identifies an eligible IMAGE job.
 *
 * Then atomically claims that exact job.
 *
 * A video job cannot be claimed by this worker.
 */

export const claimNextMediaProcessingJob =
  async ({
    workerId,
    now = new Date(),
  } = {}) => {
    validateWorkerId(workerId);

    const leaseOwner =
      `${workerId}:${randomUUID()}`;

    const leaseExpiresAt = new Date(
      now.getTime() +
        MEDIA_QUEUE_POLICY.LEASE_DURATION_MS
    );

    const candidates =
      await MediaProcessingJob.aggregate([
        {
          $match: {
            availableAt: {
              $lte: now,
            },

            $expr: {
              $lt: [
                "$attempts",
                "$maxAttempts",
              ],
            },

            $or: [
              {
                status:
                  MEDIA_JOB_STATUSES.QUEUED,
              },
              {
                status:
                  MEDIA_JOB_STATUSES.PROCESSING,

                leaseExpiresAt: {
                  $lte: now,
                },
              },
            ],
          },
        },

        {
          $lookup: {
            from: Media.collection.name,

            localField: "mediaId",

            foreignField: "_id",

            as: "media",
          },
        },

        {
          $unwind: "$media",
        },

        {
          $match: {
            "media.mediaType":
              MEDIA_TYPES.IMAGE,

            "media.status":
              MEDIA_STATUSES.PROCESSING,

            "media.moderationStatus":
              MEDIA_MODERATION_STATUSES.PENDING,

            "media.deletedAt": null,
          },
        },

        {
          $sort: {
            availableAt: 1,
            createdAt: 1,
          },
        },

        {
          $limit: 1,
        },

        {
          $project: {
            _id: 1,
          },
        },
      ]);

    if (!candidates.length) {
      return null;
    }

    const candidateId =
      candidates[0]._id;

    /**
     * Atomic claim.
     *
     * Another worker may have claimed the candidate
     * after aggregation. The update filter prevents
     * that worker's claim from being overwritten.
     */

    const claimedJob =
      await MediaProcessingJob.findOneAndUpdate(
        {
          _id: candidateId,

          availableAt: {
            $lte: now,
          },

          $expr: {
            $lt: [
              "$attempts",
              "$maxAttempts",
            ],
          },

          $or: [
            {
              status:
                MEDIA_JOB_STATUSES.QUEUED,
            },
            {
              status:
                MEDIA_JOB_STATUSES.PROCESSING,

              leaseExpiresAt: {
                $lte: now,
              },
            },
          ],

          $and: [
            {
              $or: [
                {
                  leaseExpiresAt: null,
                },
                {
                  leaseExpiresAt: {
                    $lte: now,
                  },
                },
              ],
            },
          ],
        },
        {
          $set: {
            status:
              MEDIA_JOB_STATUSES.PROCESSING,

            lockedAt: now,

            lockedBy: leaseOwner,

            leaseExpiresAt,
          },

          $inc: {
            attempts: 1,
          },
        },
        {
          new: true,
        }
      );

    return claimedJob;
  };

  
/**
 * ============================================================
 * RENEW PROCESSING LEASE
 * ============================================================
 *
 * Extends the current lease while a worker is
 * actively processing an image.
 *
 * A worker cannot renew:
 * - A lease owned by another worker.
 * - An expired lease.
 * - A job that is no longer PROCESSING.
 */

export const renewMediaProcessingLease =
  async ({
    job,
    now = new Date(),
  } = {}) => {
    if (
      !job?._id ||
      !job.lockedBy
    ) {
      throw new Error(
        "A valid claimed media processing job is required."
      );
    }

    const leaseExpiresAt = new Date(
      now.getTime() +
        MEDIA_QUEUE_POLICY.LEASE_DURATION_MS
    );

    const renewedJob =
      await MediaProcessingJob.findOneAndUpdate(
        {
          _id: job._id,

          status:
            MEDIA_JOB_STATUSES.PROCESSING,

          lockedBy: job.lockedBy,

          leaseExpiresAt: {
            $gt: now,
          },
        },
        {
          $set: {
            leaseExpiresAt,
          },
        },
        {
          new: true,
        }
      );

    if (!renewedJob) {
      return {
        renewed: false,
        reason: "LEASE_LOST",
      };
    }

    return {
      renewed: true,
      leaseExpiresAt:
        renewedJob.leaseExpiresAt,
    };
  };

/**
 * ============================================================
 * LEASE LOST ERROR
 * ============================================================
 */

class MediaProcessingLeaseLostError extends Error {
  constructor() {
    super("The media processing lease has been lost.");

    this.name =
      "MediaProcessingLeaseLostError";
  }
}

/**
 * ============================================================
 * FINALIZE MEDIA PROCESSING JOB
 * ============================================================
 *
 * Only the current lease owner can finalize.
 *
 * SUCCESS:
 * - Media becomes READY.
 * - Moderation becomes APPROVED automatically.
 * - Job becomes COMPLETED.
 *
 * RETRYABLE FAILURE:
 * - Job returns to QUEUED.
 * - Media remains PROCESSING.
 *
 * EXHAUSTED / NON-RETRYABLE FAILURE:
 * - Job becomes FAILED.
 * - Media becomes FAILED if still processing.
 *
 * Media and job updates run in one MongoDB transaction.
 */


export const finalizeMediaProcessingJob =
  async ({
    job,
    outcome,
  } = {}) => {
    if (
      !job?._id ||
      !job.lockedBy ||
      !job.leaseExpiresAt
    ) {
      throw new Error(
        "A valid claimed media processing job is required."
      );
    }

    if (
      !outcome ||
      typeof outcome.success !== "boolean"
    ) {
      throw new Error(
        "A valid media processing outcome is required."
      );
    }

    const attempts = Number(job.attempts);
    const maxAttempts = Number(job.maxAttempts);

    const retryable =
      outcome.success === false &&
      outcome.retryable === true &&
      attempts < maxAttempts;

    const exhausted =
      outcome.success === false &&
      !retryable;

    const errorCode = normalizeErrorValue(
      outcome.errorCode,
      100
    );

    const errorMessage = normalizeErrorValue(
      outcome.errorMessage,
      500
    );

    const session = await mongoose.startSession();

    let finalization = null;

    try {
      await session.withTransaction(
        async () => {
          /**
           * STEP 1:
           * Verify that the lease is still valid.
           *
           * Use the current time, not the time
           * captured when finalization was called.
           */

          const currentJob =
            await MediaProcessingJob.findOne({
              _id: job._id,

              status:
                MEDIA_JOB_STATUSES.PROCESSING,

              lockedBy: job.lockedBy,

              leaseExpiresAt: {
                $gt: new Date(),
              },
            }).session(session);

          if (!currentJob) {
            throw new MediaProcessingLeaseLostError();
          }

      /**
       * STEP 2:
       * SUCCESS
       *
       * Media becomes READY and automatically APPROVED
       * only after successful image processing.
       */

          if (outcome.success) {
            const updatedMedia =
              await Media.findOneAndUpdate(
                {
                  _id: currentJob.mediaId,

                  status:
                    MEDIA_STATUSES.PROCESSING,

                  moderationStatus:
                    MEDIA_MODERATION_STATUSES.PENDING,

                  deletedAt: null,
                },
                {
                  $set: {
                    status: MEDIA_STATUSES.READY,

                    moderationStatus:
                      MEDIA_MODERATION_STATUSES.APPROVED,
                  },
                },
                {
                  new: true,
                  session,
                }
              );

            if (!updatedMedia) {
              throw new Error(
                "The media record is no longer eligible for processing finalization."
              );
            }
          }

          /**
           * STEP 3:
           * EXHAUSTED / PERMANENT FAILURE
           */

          if (exhausted) {
            await Media.updateOne(
              {
                _id: currentJob.mediaId,

                status:
                  MEDIA_STATUSES.PROCESSING,

                moderationStatus:
                  MEDIA_MODERATION_STATUSES.PENDING,

                deletedAt: null,
              },
              {
                $set: {
                  status:
                    MEDIA_STATUSES.FAILED,
                },
              },
              {
                session,
              }
            );
          }

          /**
           * STEP 4:
           * Determine final queue state.
           */

          const finalizedAt = new Date();

          let nextStatus;

          let availableAt = null;

          let completedAt = null;

          let failedAt = null;

          if (outcome.success) {
            nextStatus =
              MEDIA_JOB_STATUSES.COMPLETED;

            completedAt = finalizedAt;
          } else if (retryable) {
            nextStatus =
              MEDIA_JOB_STATUSES.QUEUED;

            availableAt =
              calculateNextAttemptAt({
                attempts,
                now: finalizedAt,
              });
          } else {
            nextStatus =
              MEDIA_JOB_STATUSES.FAILED;

            failedAt = finalizedAt;
          }

          /**
           * STEP 5:
           * Finalize only while the original lease
           * is still valid.
           *
           * Check the clock again immediately before
           * the atomic job update.
           */

          const updatedJob =
            await MediaProcessingJob.findOneAndUpdate(
              {
                _id: currentJob._id,

                status:
                  MEDIA_JOB_STATUSES.PROCESSING,

                lockedBy: job.lockedBy,

                leaseExpiresAt: {
                  $gt: new Date(),
                },
              },
              {
                $set: {
                  status: nextStatus,

                  availableAt:
                    availableAt || finalizedAt,

                  lockedAt: null,

                  lockedBy: null,

                  leaseExpiresAt: null,

                  completedAt,

                  failedAt,

                  lastErrorCode:
                    outcome.success
                      ? null
                      : errorCode,

                  lastErrorMessage:
                    outcome.success
                      ? null
                      : errorMessage,
                },
              },
              {
                new: true,
                session,
              }
            );

          if (!updatedJob) {
            throw new MediaProcessingLeaseLostError();
          }

          finalization = {
            finalized: true,

            status: updatedJob.status,

            attempts: updatedJob.attempts,

            availableAt:
              updatedJob.availableAt,
          };
        }
      );

      return finalization;
    } catch (error) {
      if (
        error instanceof
        MediaProcessingLeaseLostError
      ) {
        return {
          finalized: false,
          reason: "LEASE_LOST",
        };
      }

      throw error;
    } finally {
      await session.endSession();
    }
  };


export {
  MEDIA_QUEUE_POLICY,
};
