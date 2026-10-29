import mongoose from "mongoose";

/**
 * ============================================================
 * PREMIUMCHAT — PAYMENT RECOVERY JOB
 * ============================================================
 *
 * MODULE 4.3.5.7.8.13.17.6.13
 *
 * TERMINAL STATES:
 *
 * - COMPLETED
 * - MANUAL_REVIEW
 *
 * Neither state may be reclaimed automatically.
 */

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
      required: true,
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

    manualReviewRequiredAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: "__v",
  }
);

/**
 * One recovery job per resource and type.
 */
schema.index(
  {
    type: 1,
    resourceId: 1,
  },
  {
    unique: true,
    name: "unique_payment_recovery_resource",
  }
);

/**
 * Recovery scheduling index.
 */
schema.index(
  {
    status: 1,
    nextAttemptAt: 1,
    leaseExpiresAt: 1,
  },
  {
    name: "payment_recovery_schedule",
  }
);

const PaymentRecoveryJob =
  mongoose.models.PaymentRecoveryJob ||
  mongoose.model("PaymentRecoveryJob", schema);

export default PaymentRecoveryJob;