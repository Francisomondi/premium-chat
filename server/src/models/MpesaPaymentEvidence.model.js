import mongoose from "mongoose";

const { Schema } = mongoose;

/**
 * ============================================================
 * PREMIUMCHAT — M-PESA PAYMENT EVIDENCE
 * ============================================================
 *
 * MODULE 4.3.5.7.8.13.17.6.12
 *
 * Records bounded provider-query evidence.
 *
 * SECURITY:
 *
 * - Evidence is not financial settlement.
 * - Query success does not verify a payment.
 * - Evidence cannot activate subscriptions.
 * - Evidence cannot authorize premium content.
 */

export const MPESA_EVIDENCE_STATUSES =
  Object.freeze({
    QUERY_PENDING: "QUERY_PENDING",

    QUERY_SUCCESS: "QUERY_SUCCESS",

    QUERY_FAILURE: "QUERY_FAILURE",

    QUERY_INCONCLUSIVE: "QUERY_INCONCLUSIVE",

    CONFLICT: "CONFLICT",
  });

const mpesaPaymentEvidenceSchema =
  new Schema(
    {
      paymentId: {
        type: Schema.Types.ObjectId,

        ref: "PaymentTransaction",

        required: true,

        index: true,
      },

      /**
       * Stable identity for one logical
       * provider-query operation.
       *
       * The caller must supply this value.
       */

      reconciliationOperationId: {
        type: String,

        required: true,

        trim: true,

        minlength: 1,

        maxlength: 180,
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

        enum: [
          "DARAJA_STK_QUERY",
        ],

        required: true,

        default: "DARAJA_STK_QUERY",
      },

      status: {
        type: String,

        enum: Object.values(
          MPESA_EVIDENCE_STATUSES
        ),

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
       * independently verify financial details.
       */

      financialDetailsVerified: {
        type: Boolean,

        default: false,

        immutable: true,
      },

      /**
       * Provider-query evidence cannot
       * authorize paid access.
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

/**
 * ============================================================
 * UNIQUE OPERATION IDENTITY
 * ============================================================
 */

mpesaPaymentEvidenceSchema.index(
  {
    reconciliationOperationId: 1,
  },
  {
    unique: true,

    name:
      "unique_mpesa_reconciliation_operation",
  }
);

/**
 * ============================================================
 * PAYMENT EVIDENCE HISTORY
 * ============================================================
 */

mpesaPaymentEvidenceSchema.index(
  {
    paymentId: 1,

    queriedAt: -1,
  },
  {
    name: "mpesa_evidence_history",
  }
);

/**
 * ============================================================
 * CHECKOUT EVIDENCE HISTORY
 * ============================================================
 */

mpesaPaymentEvidenceSchema.index(
  {
    checkoutRequestId: 1,

    queriedAt: -1,
  },
  {
    name:
      "mpesa_checkout_evidence_history",
  }
);

const MpesaPaymentEvidence =
  mongoose.models.MpesaPaymentEvidence ||
  mongoose.model(
    "MpesaPaymentEvidence",
    mpesaPaymentEvidenceSchema
  );

export default MpesaPaymentEvidence;