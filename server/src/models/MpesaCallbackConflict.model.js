import mongoose from "mongoose";

const { Schema } = mongoose;

/**
 * ============================================================
 * PREMIUMCHAT — M-PESA CALLBACK CONFLICT
 * ============================================================
 *
 * MODULE 4.3.5.7.8.13.17.6.7
 *
 * Stores contradictory callback deliveries.
 *
 * SECURITY:
 *
 * - Callback data remains untrusted.
 * - Conflict records never verify payment.
 * - Conflict records never grant access.
 * - Conflict evidence must be retained for audit.
 */

/**
 * Supported callback conflict reasons.
 *
 * These must match the reasons returned
 * by detectConflict() in mpesaCallback.service.js.
 */

export const MPESA_CALLBACK_CONFLICT_REASONS =
  Object.freeze({
    PAYMENT_ID_MISMATCH:
      "PAYMENT_ID_MISMATCH",

    CHECKOUT_REQUEST_ID_MISMATCH:
      "CHECKOUT_REQUEST_ID_MISMATCH",

    MERCHANT_REQUEST_ID_MISMATCH:
      "MERCHANT_REQUEST_ID_MISMATCH",

    RESULT_CODE_MISMATCH:
      "RESULT_CODE_MISMATCH",

    AMOUNT_MISMATCH:
      "AMOUNT_MISMATCH",

    RECEIPT_MISMATCH:
      "RECEIPT_MISMATCH",
  });

const mpesaCallbackConflictSchema =
  new Schema(
    {
      callbackEventId: {
        type: Schema.Types.ObjectId,

        ref: "MpesaCallbackEvent",

        required: true,

        index: true,
      },

      checkoutRequestId: {
        type: String,

        required: true,

        trim: true,
      },

      merchantRequestId: {
        type: String,

        required: true,

        trim: true,
      },

      originalResultCode: {
        type: Number,

        required: true,
      },

      conflictingResultCode: {
        type: Number,

        required: true,
      },

      reason: {
        type: String,

        required: true,

        enum: Object.values(
          MPESA_CALLBACK_CONFLICT_REASONS
        ),
      },

      receivedAt: {
        type: Date,

        default: Date.now,

        required: true,
      },
    },
    {
      timestamps: true,

      versionKey: "__v",
    }
  );

/**
 * Callback conflict history.
 */

mpesaCallbackConflictSchema.index(
  {
    callbackEventId: 1,
    receivedAt: -1,
  },
  {
    name: "mpesa_callback_conflict_history",
  }
);

const MpesaCallbackConflict =
  mongoose.models.MpesaCallbackConflict ||
  mongoose.model(
    "MpesaCallbackConflict",
    mpesaCallbackConflictSchema
  );

export default MpesaCallbackConflict;