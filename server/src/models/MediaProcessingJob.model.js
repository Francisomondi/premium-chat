
import mongoose from "mongoose";

const MEDIA_JOB_STATUSES = Object.freeze({
  QUEUED: "QUEUED",
  PROCESSING: "PROCESSING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
});

const mediaProcessingJobSchema = new mongoose.Schema(
  {
    mediaId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Media",
      required: true,
      immutable: true,
    },

    status: {
      type: String,
      enum: Object.values(MEDIA_JOB_STATUSES),
      default: MEDIA_JOB_STATUSES.QUEUED,
      required: true,
    },

    attempts: {
      type: Number,
      default: 0,
      min: 0,
      required: true,
    },

    maxAttempts: {
      type: Number,
      default: 3,
      min: 1,
      required: true,
    },

    availableAt: {
      type: Date,
      default: Date.now,
      required: true,
    },

    lockedAt: {
      type: Date,
      default: null,
    },

    lockedBy: {
      type: String,
      default: null,
      maxlength: 120,
    },

    leaseExpiresAt: {
      type: Date,
      default: null,
    },

    completedAt: {
      type: Date,
      default: null,
    },

    failedAt: {
      type: Date,
      default: null,
    },

    lastErrorCode: {
      type: String,
      default: null,
      maxlength: 100,
    },

    lastErrorMessage: {
      type: String,
      default: null,
      maxlength: 500,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

/**
 * One processing job per media item.
 */
mediaProcessingJobSchema.index(
  { mediaId: 1 },
  {
    unique: true,
    name: "unique_media_processing_job",
  }
);

/**
 * Efficient discovery of queued jobs.
 */
mediaProcessingJobSchema.index(
  {
    status: 1,
    availableAt: 1,
    createdAt: 1,
  },
  {
    name: "queued_media_processing_jobs",
  }
);

/**
 * Efficient discovery of abandoned worker leases.
 */
mediaProcessingJobSchema.index(
  {
    status: 1,
    leaseExpiresAt: 1,
  },
  {
    name: "expired_media_processing_leases",
  }
);

const MediaProcessingJob =
  mongoose.models.MediaProcessingJob ||
  mongoose.model(
    "MediaProcessingJob",
    mediaProcessingJobSchema
  );

export {
  MEDIA_JOB_STATUSES,
};

export default MediaProcessingJob;
    