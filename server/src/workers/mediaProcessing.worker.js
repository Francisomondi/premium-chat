
import mongoose from "mongoose";
import { randomUUID } from "node:crypto";

import MediaProcessingJob, {
  MEDIA_JOB_STATUSES,
} from "../models/MediaProcessingJob.model.js";

import {
  claimNextMediaProcessingJob,
  finalizeMediaProcessingJob,
  recoverOrphanedMediaProcessingJobs,
  renewMediaProcessingLease,
} from "../services/mediaProcessingQueue.service.js";

import {
  processCreatorImage,
} from "../services/mediaProcessing.service.js";

/**
 * ============================================================
 * PREMIUMCHAT — IMAGE PROCESSING WORKER
 * ============================================================
 *
 * Responsibilities:
 *
 * - Recover orphaned image jobs.
 * - Claim eligible image jobs.
 * - Process images and generate blurred previews.
 * - Maintain processing leases.
 * - Retry transient failures.
 * - Finalize completed or failed jobs.
 *
 * SECURITY:
 *
  * - Delegates successful media approval to
 *   transactional queue finalization.
 * - Does not publish media.
 * - Does not expose storage keys.
 * - Does not process videos.
 * - Does not initiate payments.
 */

const MAX_JOBS_PER_RUN = 25;

const MAX_RUNTIME_MS = 10 * 60 * 1000;

const HEARTBEAT_INTERVAL_MS = 60 * 1000;

const workerId = `media-${randomUUID()}`;

const isWorkerEnabled = () =>
  process.env.MEDIA_PROCESSING_WORKER_ENABLED === "true";

/**
 * ============================================================
 * RETRY CLASSIFICATION
 * ============================================================
 *
 * Only known temporary failures are retryable.
 * Unknown errors fail closed.
 */

const RETRYABLE_ERROR_CODES = new Set([
  "MEDIA_ORIGINAL_DOWNLOAD_FAILED",
  "MEDIA_PREVIEW_STORAGE_FAILED",
  "MEDIA_STREAM_UNAVAILABLE",
  "MEDIA_STORAGE_UNAVAILABLE",
]);

const classifyProcessingError = (error) => {
  const errorCode =
    typeof error?.code === "string"
      ? error.code
      : "MEDIA_PROCESSING_FAILED";

  const retryable =
    RETRYABLE_ERROR_CODES.has(errorCode);

  return {
    success: false,
    retryable,
    errorCode,
    errorMessage:
      error?.message ||
      "Image processing failed.",
  };
};

/**
 * ============================================================
 * PROCESS ONE JOB
 * ============================================================
 */

const processOneJob = async (job) => {
  let heartbeatTimer = null;

  let heartbeatRunning = false;

  let leaseLost = false;

  let heartbeatError = null;


  const heartbeat = async () => {
    if (heartbeatRunning || leaseLost) {
      return;
    }

    heartbeatRunning = true;

    try {
      const result =
        await renewMediaProcessingLease({
          job,
        });

      if (!result.renewed) {
        leaseLost = true;

        console.error(
          JSON.stringify({
            event: "MEDIA_PROCESSING_LEASE_LOST",
            jobId: job._id.toString(),
          })
        );
      } else {
        // A successful renewal clears a previous
        // temporary heartbeat error.
        heartbeatError = null;
      }
    } catch (error) {
      heartbeatError = error;

      console.error(
        JSON.stringify({
          event: "MEDIA_PROCESSING_HEARTBEAT_ERROR",
          jobId: job._id.toString(),
          error:
            error?.message ||
            "UNKNOWN_ERROR",
        })
      );
    } finally {
      heartbeatRunning = false;
    }
  };


  heartbeatTimer = setInterval(
    heartbeat,
    HEARTBEAT_INTERVAL_MS
  );

  heartbeatTimer.unref?.();

  let outcome;

  try {
    /**
     * Process original image and create
     * its private blurred preview.
     */

    await processCreatorImage({
      mediaId: job.mediaId.toString(),
    });

    if (leaseLost || heartbeatError) {
      return {
        finalized: false,
        reason: leaseLost
          ? "LEASE_LOST"
          : "HEARTBEAT_ERROR",
      };
    }

    outcome = {
      success: true,
    };
  } catch (error) {
    outcome = classifyProcessingError(error);

    console.error(
      JSON.stringify({
        event: "MEDIA_PROCESSING_JOB_ERROR",
        jobId: job._id.toString(),
        mediaId: job.mediaId.toString(),
        errorCode: outcome.errorCode,
        retryable: outcome.retryable,
        error: outcome.errorMessage,
      })
    );
  } finally {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
    }

    // Do not finalize until an in-flight heartbeat
    // has finished. Otherwise renewal and finalization
    // could race with each other.
    while (heartbeatRunning) {
      await new Promise((resolve) =>
        setTimeout(resolve, 50)
      );
    }
  }

  if (leaseLost || heartbeatError) {
    return {
      finalized: false,
      reason: leaseLost
        ? "LEASE_LOST"
        : "HEARTBEAT_ERROR",
    };
  }

  return finalizeMediaProcessingJob({
    job,
    outcome,
  });
};

/**
 * ============================================================
 * PROCESS QUEUE
 * ============================================================
 */

const runMediaProcessing = async () => {
  const startedAt = Date.now();

  let processed = 0;

  let completed = 0;

  let retryScheduled = 0;

  let failed = 0;

  let leaseLost = 0;

  const recovery =
    await recoverOrphanedMediaProcessingJobs();

  console.log(
    JSON.stringify({
      event: "MEDIA_PROCESSING_ORPHANS_RECOVERED",
      ...recovery,
    })
  );

  while (
    processed < MAX_JOBS_PER_RUN &&
    Date.now() - startedAt < MAX_RUNTIME_MS
  ) {
    const job =
      await claimNextMediaProcessingJob({
        workerId,
      });

    if (!job) {
      break;
    }

    processed++;

    let result;

    try {
      result = await processOneJob(job);
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "MEDIA_PROCESSING_FINALIZATION_ERROR",
          jobId: job._id.toString(),
          error:
            error?.message ||
            "UNKNOWN_ERROR",
        })
      );

      // Do not overwrite a job after a finalization
      // error. Lease expiry permits safe recovery.
      continue;
    }

    if (!result?.finalized) {
      leaseLost++;

      console.warn(
        JSON.stringify({
          event: "MEDIA_PROCESSING_JOB_NOT_FINALIZED",
          jobId: job._id.toString(),
          reason: result?.reason || "UNKNOWN",
        })
      );

      continue;
    }

    switch (result.status) {
      case MEDIA_JOB_STATUSES.COMPLETED:
        completed++;
        break;

      case MEDIA_JOB_STATUSES.QUEUED:
        retryScheduled++;
        break;

      case MEDIA_JOB_STATUSES.FAILED:
        failed++;
        break;

      default:
        break;
    }
  }

  return {
    processed,
    completed,
    retryScheduled,
    failed,
    leaseLost,
  };
};

/**
 * ============================================================
 * MAIN
 * ============================================================
 */

const main = async () => {
  let connected = false;

  try {
    if (!isWorkerEnabled()) {
      console.log(
        JSON.stringify({
          event: "MEDIA_PROCESSING_WORKER_DISABLED",
          reason:
            "MEDIA_PROCESSING_WORKER_ENABLED_FALSE",
        })
      );

      return;
    }

    if (!process.env.MONGODB_URI) {
      throw new Error(
        "MONGODB_URI is required."
      );
    }

    await mongoose.connect(
      process.env.MONGODB_URI
    );

    connected = true;

    const result =
      await runMediaProcessing();

    console.log(
      JSON.stringify({
        event: "MEDIA_PROCESSING_WORKER_COMPLETED",
        ...result,
      })
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "MEDIA_PROCESSING_WORKER_FAILED",
        error:
          error?.message ||
          "UNKNOWN_ERROR",
      })
    );

    process.exitCode = 1;
  } finally {
    if (
      connected &&
      mongoose.connection.readyState !== 0
    ) {
      await mongoose.disconnect();
    }
  }
};

main();
