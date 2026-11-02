
import mongoose from "mongoose";

export const MEDIA_DISPATCH_STATES = Object.freeze({
  RESERVED: "RESERVED",
  AUTHORIZED: "AUTHORIZED",
  DISPATCHING: "DISPATCHING",
  ACCEPTED: "ACCEPTED",
  UNKNOWN: "UNKNOWN",
  REJECTED: "REJECTED",
  BLOCKED: "BLOCKED",
});

const mediaPaymentDispatchSchema = new mongoose.Schema(
  {
    mediaPurchaseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MediaPurchase",
      required: true,
      immutable: true,
    },

    paymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PaymentTransaction",
      required: true,
      immutable: true,
    },

    buyerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },

    state: {
      type: String,
      enum: Object.values(MEDIA_DISPATCH_STATES),
      default: MEDIA_DISPATCH_STATES.RESERVED,
      required: true,
    },

    authorizedAt: {
      type: Date,
      default: null,
    },

    dispatchStartedAt: {
      type: Date,
      default: null,
    },

    dispatchCompletedAt: {
      type: Date,
      default: null,
    },

    requiresManualReview: {
      type: Boolean,
      default: false,
    },

    manualReviewReason: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null,
    },
  },
  {
    timestamps: true,
    optimisticConcurrency: true,
  }
);

/**
 * One dispatch record per media purchase.
 */
mediaPaymentDispatchSchema.index(
  { mediaPurchaseId: 1 },
  {
    unique: true,
    name: "unique_media_purchase_dispatch",
  }
);

/**
 * One dispatch record per payment.
 */
mediaPaymentDispatchSchema.index(
  { paymentId: 1 },
  {
    unique: true,
    name: "unique_media_payment_dispatch",
  }
);

/**
 * Buyer dispatch history.
 */
mediaPaymentDispatchSchema.index(
  { buyerId: 1, createdAt: -1 },
  {
    name: "buyer_media_dispatch_history",
  }
);

const MediaPaymentDispatch =
  mongoose.models.MediaPaymentDispatch ||
  mongoose.model(
    "MediaPaymentDispatch",
    mediaPaymentDispatchSchema
  );

export default MediaPaymentDispatch;
