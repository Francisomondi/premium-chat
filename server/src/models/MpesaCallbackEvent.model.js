import mongoose from "mongoose";

const { Schema } = mongoose;
/**
 * ============================================================
 * AUTHENTICATED DAR AJA STK QUERY EVIDENCE
 * ============================================================
 *
 * Stores the result returned by the backend's authenticated
 * Daraja STK Query request.
 *
 * IMPORTANT:
 * - This is not callback receipt authentication.
 * - STK Query does not independently establish the amount
 *   or receipt reported in the callback.
 * - Only the backend reconciliation service should write it.
 */

const stkQueryEvidenceSchema = new Schema(
  {
    checkoutRequestId: {
      type: String,
      required: true,
      trim: true,
      maxlength: 255,
    },

    resultCode: {
      type: String,
      required: true,
      trim: true,
      maxlength: 30,
    },

    resultDescription: {
      type: String,
      default: null,
      maxlength: 500,
    },

    authenticatedQuery: {
      type: Boolean,
      required: true,
      default: false,
    },

    queriedAt: {
      type: Date,
      required: true,
    },

    evidenceReference: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300,
    },
  },
  {
    _id: false,
  }
);

/**
 * ============================================================
 * PREMIUMCHAT — M-PESA CALLBACK EVENT MODEL
 * ============================================================
 *
 * Module 4.3.5.7.8.13.11
 *
 * Responsibilities:
 *
 * - Persist received STK callback events.
 * - Match callbacks to payment attempts.
 * - Support duplicate callback delivery.
 * - Track reconciliation progress.
 *
 * SECURITY:
 *
 * - Callback data is untrusted.
 * - Callback events never grant access.
 * - Do not store M-Pesa PINs or credentials.
 * - Do not treat callback result codes as
 *   independently verified payment evidence.
 */



/**
 * ============================================================
 * MODULE 4.3.5.7.8.13.14
 * CALLBACK RECONCILIATION STATUSES
 * ============================================================
 */

export const MPESA_CALLBACK_EVENT_STATUSES =
  Object.freeze({
    RECEIVED: "RECEIVED",

    PROCESSING: "PROCESSING",

    RETRY_SCHEDULED: "RETRY_SCHEDULED",

    RECONCILED: "RECONCILED",

    UNRESOLVED: "UNRESOLVED",

    MANUAL_REVIEW: "MANUAL_REVIEW",
  });

  export const MPESA_CALLBACK_SETTLEMENT_STATUSES =
  Object.freeze({
    NOT_REQUIRED: "NOT_REQUIRED",

    PENDING: "PENDING",

    PROCESSING: "PROCESSING",

    RETRY_SCHEDULED: "RETRY_SCHEDULED",

    COMPLETED: "COMPLETED",

    MANUAL_REVIEW: "MANUAL_REVIEW",
  });

const mpesaCallbackEventSchema = new Schema(
  {
    paymentId: {
      type: Schema.Types.ObjectId,

      ref: "PaymentTransaction",

      default: null,

      index: true,
    },
    /**
     * ============================================================
     * RECONCILIATION RETRY MANAGEMENT
     * ============================================================
     */

    attemptCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    nextAttemptAt: {
      type: Date,
      default: Date.now,
    },

    /**
     * Worker lease.
     *
     * Only the worker holding the current
     * lease token may finalize an attempt.
     */

    leaseOwner: {
      type: String,
      default: null,
      maxlength: 100,
    },

    leaseExpiresAt: {
      type: Date,
      default: null,
    },

    /**
     * Conflict tracking.
     */

    hasConflict: {
      type: Boolean,
      default: false,
    },

    conflictCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    lastConflictAt: {
      type: Date,
      default: null,
    },

    lastConflictReason: {
      type: String,
      default: null,
      maxlength: 100,
    },

    /**
     * Manual-review tracking.
     */

    manualReviewRequiredAt: {
      type: Date,
      default: null,
    },

    manualReviewReason: {
      type: String,
      default: null,
      maxlength: 100,
    },

    checkoutRequestId: {
      type: String,

      required: true,

      trim: true,

      maxlength: 255,
    },

    merchantRequestId: {
      type: String,

      required: true,

      trim: true,

      maxlength: 255,
    },

    resultCode: {
      type: Number,

      required: true,
    },

    /**
     * These are callback claims, not verified facts.
     */

    reportedAmountMinor: {
      type: Number,

      default: null,
    },

    reportedReceipt: {
      type: String,

      default: null,

      trim: true,

      maxlength: 255,
    },

    /**
 * Authenticated STK Query response evidence.
 */

stkQueryEvidence: {
  type: stkQueryEvidenceSchema,
  default: null,
},

    /**
     * ============================================================
     * DURABLE MEDIA PURCHASE SETTLEMENT TRACKING
     * ============================================================
     *
     * Settlement is independent of callback reconciliation.
     * Only eligible MEDIA_PURCHASE events enter this queue.
     */

    settlementStatus: {
      type: String,

      enum: Object.values(
        MPESA_CALLBACK_SETTLEMENT_STATUSES
      ),

      default:
        MPESA_CALLBACK_SETTLEMENT_STATUSES.NOT_REQUIRED,

      required: true,
    },

    settlementAttemptCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    nextSettlementAttemptAt: {
      type: Date,
      default: null,
    },

    settlementLeaseOwner: {
      type: String,
      default: null,
      maxlength: 100,
    },

    settlementLeaseExpiresAt: {
      type: Date,
      default: null,
    },

    settledAt: {
      type: Date,
      default: null,
    },

    settlementLastErrorCode: {
      type: String,
      default: null,
      maxlength: 100,
    },

    /**
     * Callback event state.
     */

    status: {
      type: String,

      enum: Object.values(
        MPESA_CALLBACK_EVENT_STATUSES
      ),

      default:
        MPESA_CALLBACK_EVENT_STATUSES.RECEIVED,

      required: true,
    },

    receivedAt: {
      type: Date,

      default: Date.now,

      required: true,
    },

    reconciliationAttemptedAt: {
      type: Date,

      default: null,
    },

    reconciledAt: {
      type: Date,

      default: null,
    },

    lastErrorCode: {
      type: String,

      default: null,

      maxlength: 100,
    },
  },
  {
    timestamps: true,

    versionKey: "__v",
  }
);

/**
 * One stored event per provider checkout reference.
 *
 * Duplicate callbacks are acknowledged without
 * creating additional events.
 */

mpesaCallbackEventSchema.index(
  {
    checkoutRequestId: 1,
  },
  {
    unique: true,

    name: "unique_mpesa_callback_checkout",
  }
);

/**
 * Worker lookup.
 */

mpesaCallbackEventSchema.index(
  {
    status: 1,

    receivedAt: 1,
  },
  {
    name: "mpesa_callback_worker_lookup",
  }
);

/**
 * ============================================================
 * DURABLE RECONCILIATION QUEUE INDEX
 * ============================================================
 */

mpesaCallbackEventSchema.index(
  {
    status: 1,
    nextAttemptAt: 1,
    leaseExpiresAt: 1,
  },
  {
    name: "mpesa_reconciliation_due_lookup",
  }
);

/**
 * Durable media settlement queue lookup.
 */

mpesaCallbackEventSchema.index(
  {
    settlementStatus: 1,
    nextSettlementAttemptAt: 1,
    settlementLeaseExpiresAt: 1,
  },
  {
    name: "mpesa_media_settlement_due_lookup",
  }
);

const MpesaCallbackEvent =
  mongoose.models.MpesaCallbackEvent ||
  mongoose.model(
    "MpesaCallbackEvent",
    mpesaCallbackEventSchema
  );

export default MpesaCallbackEvent;