import mongoose from "mongoose";

const { Schema } = mongoose;

export const MPESA_EVIDENCE_STATUSES = Object.freeze({
  QUERY_PENDING: "QUERY_PENDING",
  QUERY_SUCCESS: "QUERY_SUCCESS",
  QUERY_FAILURE: "QUERY_FAILURE",
  QUERY_INCONCLUSIVE: "QUERY_INCONCLUSIVE",
  CONFLICT: "CONFLICT",
});

const mpesaPaymentEvidenceSchema = new Schema(
  {
    paymentId: {
      type: Schema.Types.ObjectId,
      ref: "PaymentTransaction",
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

    source: {
      type: String,
      enum: ["DARAJA_STK_QUERY"],
      required: true,
      default: "DARAJA_STK_QUERY",
    },

    status: {
      type: String,
      enum: Object.values(MPESA_EVIDENCE_STATUSES),
      required: true,
    },

    responseCode: {
      type: String,
      default: null,
    },

    resultCode: {
      type: String,
      default: null,
    },

    queriedAt: {
      type: Date,
      required: true,
    },

    /**
     * A successful STK query does not
     * independently establish the amount
     * and receipt.
     */
    financialDetailsVerified: {
      type: Boolean,
      default: false,
      immutable: true,
    },

    /**
     * This evidence record cannot authorize
     * paid access.
     */
    entitlementAuthorized: {
      type: Boolean,
      default: false,
      immutable: true,
    },
  },
  {
    timestamps: true,
    versionKey: "__v",
  }
);

mpesaPaymentEvidenceSchema.index(
  {
    paymentId: 1,
    queriedAt: -1,
  },
  {
    name: "mpesa_evidence_history",
  }
);

mpesaPaymentEvidenceSchema.index(
  {
    checkoutRequestId: 1,
    queriedAt: -1,
  },
  {
    name: "mpesa_checkout_evidence_history",
  }
);

const MpesaPaymentEvidence =
  mongoose.models.MpesaPaymentEvidence ||
  mongoose.model(
    "MpesaPaymentEvidence",
    mpesaPaymentEvidenceSchema
  );

export default MpesaPaymentEvidence;