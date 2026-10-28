import mongoose from "mongoose";

const { Schema } = mongoose;

export const MPESA_QUARANTINE_STATUSES = Object.freeze({
  QUARANTINED: "QUARANTINED",
  MATCHED: "MATCHED",
  MANUAL_REVIEW: "MANUAL_REVIEW",
});

const mpesaUnmatchedCallbackSchema = new Schema(
  {
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

    reportedAmountMinor: {
      type: Number,
      default: null,
    },

    reportedReceipt: {
      type: String,
      trim: true,
      maxlength: 255,
      default: null,
    },

    status: {
      type: String,
      enum: Object.values(MPESA_QUARANTINE_STATUSES),
      default: MPESA_QUARANTINE_STATUSES.QUARANTINED,
      required: true,
    },

    matchedPaymentId: {
      type: Schema.Types.ObjectId,
      ref: "PaymentTransaction",
      default: null,
    },

    firstReceivedAt: {
      type: Date,
      default: Date.now,
    },

    lastReceivedAt: {
      type: Date,
      default: Date.now,
    },

    deliveryCount: {
      type: Number,
      default: 1,
      min: 1,
    },

    conflictDetected: {
      type: Boolean,
      default: false,
    },

    matchedAt: {
      type: Date,
      default: null,
    },

    manualReviewReason: {
      type: String,
      maxlength: 100,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

mpesaUnmatchedCallbackSchema.index(
  { checkoutRequestId: 1 },
  {
    unique: true,
    name: "unique_quarantined_mpesa_checkout",
  }
);

mpesaUnmatchedCallbackSchema.index(
  {
    status: 1,
    firstReceivedAt: 1,
  },
  {
    name: "mpesa_quarantine_recovery_lookup",
  }
);

const MpesaUnmatchedCallback =
  mongoose.models.MpesaUnmatchedCallback ||
  mongoose.model(
    "MpesaUnmatchedCallback",
    mpesaUnmatchedCallbackSchema
  );

export default MpesaUnmatchedCallback;
