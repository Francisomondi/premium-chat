import mongoose from "mongoose";

export const RECOVERY_JOB_TYPES = Object.freeze({
  MISSING_CALLBACK: "MISSING_CALLBACK",
  UNMATCHED_CALLBACK: "UNMATCHED_CALLBACK",
});

export const RECOVERY_JOB_STATUSES = Object.freeze({
  PENDING: "PENDING",
  PROCESSING: "PROCESSING",
  RETRY_SCHEDULED: "RETRY_SCHEDULED",
  COMPLETED: "COMPLETED",
  MANUAL_REVIEW: "MANUAL_REVIEW",
});

const schema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: Object.values(RECOVERY_JOB_TYPES),
      required: true,
    },

    resourceId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },

    status: {
      type: String,
      enum: Object.values(RECOVERY_JOB_STATUSES),
      default: RECOVERY_JOB_STATUSES.PENDING,
    },

    attemptCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    maxAttempts: {
      type: Number,
      default: 8,
      min: 1,
    },

    nextAttemptAt: {
      type: Date,
      default: Date.now,
    },

    leaseOwner: {
      type: String,
      default: null,
    },

    leaseExpiresAt: {
      type: Date,
      default: null,
    },

    lastErrorCode: {
      type: String,
      default: null,
    },

    completedAt: {
      type: Date,
      default: null,
    },

    manualReviewReason: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

schema.index(
  { type: 1, resourceId: 1 },
  { unique: true }
);

schema.index({
  status: 1,
  nextAttemptAt: 1,
  leaseExpiresAt: 1,
});

export default mongoose.models.PaymentRecoveryJob ||
  mongoose.model("PaymentRecoveryJob", schema);