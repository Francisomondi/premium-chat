import mongoose from "mongoose";

const { Schema } = mongoose;

/**
 * ============================================================
 * PREMIUMCHAT — M-PESA CALLBACK CONFLICT
 * ============================================================
 *
 * Stores bounded evidence of contradictory
 * callback deliveries.
 *
 * Callback data remains untrusted.
 */

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

        enum: [
          "RESULT_CODE_MISMATCH",
          "AMOUNT_MISMATCH",
          "RECEIPT_MISMATCH",
        ],
      },

      receivedAt: {
        type: Date,

        default: Date.now,
      },
    },
    {
      timestamps: true,
    }
  );

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