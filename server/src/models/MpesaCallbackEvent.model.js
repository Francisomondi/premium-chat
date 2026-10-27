import mongoose from "mongoose";

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

const { Schema } = mongoose;

export const MPESA_CALLBACK_EVENT_STATUSES =
  Object.freeze({
    RECEIVED: "RECEIVED",

    PROCESSING: "PROCESSING",

    RECONCILED: "RECONCILED",

    UNRESOLVED: "UNRESOLVED",
  });

const mpesaCallbackEventSchema = new Schema(
  {
    paymentId: {
      type: Schema.Types.ObjectId,

      ref: "PaymentTransaction",

      default: null,

      index: true,
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

const MpesaCallbackEvent =
  mongoose.models.MpesaCallbackEvent ||
  mongoose.model(
    "MpesaCallbackEvent",
    mpesaCallbackEventSchema
  );

export default MpesaCallbackEvent;