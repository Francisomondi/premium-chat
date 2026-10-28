import mongoose from "mongoose";

export const DISPATCH_STATES = Object.freeze({
  RESERVED: "RESERVED",
  AUTHORIZED: "AUTHORIZED",
  DISPATCHING: "DISPATCHING",
  ACCEPTED: "ACCEPTED",
  UNKNOWN: "UNKNOWN",
  REJECTED: "REJECTED",
  BLOCKED: "BLOCKED",
});

const schema = new mongoose.Schema(
  {
    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SubscriberSubscription",
      required: true,
      index: true,
    },

    paymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PaymentTransaction",
      required: true,
      unique: true,
    },

    state: {
      type: String,
      enum: Object.values(DISPATCH_STATES),
      default: DISPATCH_STATES.RESERVED,
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

    cancellationRequestedAt: {
      type: Date,
      default: null,
    },

    requiresManualReview: {
      type: Boolean,
      default: false,
    },

    manualReviewReason: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

schema.index({ subscriptionId: 1, state: 1 });

export default mongoose.models.PaymentDispatchCoordination ||
  mongoose.model("PaymentDispatchCoordination", schema);