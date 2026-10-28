import mongoose from "mongoose";

/**
 * ============================================================
 * PREMIUMCHAT — M-PESA FINANCIAL VERIFICATION MODEL
 * ============================================================
 *
 * Module 4.3.5.7.8.13.17.1
 *
 * PURPOSE:
 *
 * Store financial verification decisions separately
 * from payment initiation and callback ingestion.
 *
 * SECURITY:
 *
 * - Provider acceptance is not financial verification.
 * - Callback success alone is not sufficient.
 * - Financial details require authoritative evidence.
 * - A receipt cannot verify multiple payments.
 * - Rejected or conflicting evidence must be retained.
 */

export const FINANCIAL_VERIFICATION_STATUSES =
  Object.freeze({
    PENDING: "PENDING",
    VERIFIED: "VERIFIED",
    REJECTED: "REJECTED",
    MANUAL_REVIEW: "MANUAL_REVIEW",
  });

export const FINANCIAL_EVIDENCE_SOURCES =
  Object.freeze({
    PROVIDER_SETTLEMENT: "PROVIDER_SETTLEMENT",
    PROVIDER_TRANSACTION_STATUS:
      "PROVIDER_TRANSACTION_STATUS",
    RECONCILIATION_REPORT:
      "RECONCILIATION_REPORT",
    MANUAL_VERIFICATION:
      "MANUAL_VERIFICATION",
  });

const financialVerificationSchema =
  new mongoose.Schema(
    {
      paymentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "PaymentTransaction",
        required: true,
        unique: true,
      },

      subscriptionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SubscriberSubscription",
        required: true,
        index: true,
      },

      provider: {
        type: String,
        default: "MPESA",
        immutable: true,
      },

      status: {
        type: String,
        enum: Object.values(
          FINANCIAL_VERIFICATION_STATUSES
        ),
        default:
          FINANCIAL_VERIFICATION_STATUSES.PENDING,
        required: true,
      },

      evidenceSource: {
        type: String,
        enum: Object.values(
          FINANCIAL_EVIDENCE_SOURCES
        ),
        default: null,
      },

      providerTransactionId: {
        type: String,
        default: null,
      },

      mpesaReceiptNumber: {
        type: String,
        default: null,
      },

      verifiedAmountMinor: {
        type: Number,
        default: null,
        min: 0,
      },

      verifiedCurrency: {
        type: String,
        default: null,
      },

      verifiedAt: {
        type: Date,
        default: null,
      },

      evidenceReference: {
        type: String,
        default: null,
      },

      verificationErrorCode: {
        type: String,
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
    {
      timestamps: true,
      versionKey: "__v",
    }
  );

/**
 * ============================================================
 * PREVENT DUPLICATE RECEIPT VERIFICATION
 * ============================================================
 *
 * Only non-null receipt numbers participate
 * in this unique index.
 */

financialVerificationSchema.index(
  {
    provider: 1,
    mpesaReceiptNumber: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      mpesaReceiptNumber: {
        $type: "string",
      },
    },
  }
);

/**
 * ============================================================
 * VERIFICATION QUEUE INDEX
 * ============================================================
 */

financialVerificationSchema.index({
  status: 1,
  createdAt: 1,
});

financialVerificationSchema.index({
  subscriptionId: 1,
  status: 1,
});

/**
 * ============================================================
 * MODEL EXPORT
 * ============================================================
 */

const MpesaFinancialVerification =
  mongoose.models.MpesaFinancialVerification ||
  mongoose.model(
    "MpesaFinancialVerification",
    financialVerificationSchema
  );

export default MpesaFinancialVerification;