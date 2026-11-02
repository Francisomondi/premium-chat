
import mongoose from "mongoose";

import {
  PAYMENT_PURPOSES,
} from "../constants/payment.constants.js";

/**
 * ============================================================
 * PREMIUMCHAT — M-PESA FINANCIAL VERIFICATION MODEL
 * ============================================================
 *
 * Module 4.3.5.7.8.13.17.1
 *
 * PURPOSE:
 * Store financial verification decisions separately from
 * payment initiation and callback ingestion.
 *
 * SECURITY:
 * - Provider acceptance is not financial verification.
 * - Callback success alone is not sufficient.
 * - Financial details require authoritative evidence.
 * - A receipt cannot verify multiple payments.
 * - Rejected or conflicting evidence must be retained.
 * - Subscription references are required only for
 *   subscription-related payment purposes.
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
    DARAJA_STK_QUERY:
      "DARAJA_STK_QUERY",
  });

const SUBSCRIPTION_PAYMENT_PURPOSES = new Set([
  PAYMENT_PURPOSES.SUBSCRIPTION_INITIAL,
  PAYMENT_PURPOSES.SUBSCRIPTION_RENEWAL,
]);

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
        default: null,
        index: true,
      },

      provider: {
        type: String,
        enum: ["MPESA"],
        default: "MPESA",
        immutable: true,
        required: true,
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
        trim: true,
      },

      mpesaReceiptNumber: {
        type: String,
        default: null,
        trim: true,
      },

      verifiedAmountMinor: {
        type: Number,
        default: null,
        min: 0,
      },

      verifiedCurrency: {
        type: String,
        enum: ["KES", "USD", null],
        default: null,
      },

      verifiedAt: {
        type: Date,
        default: null,
      },

      evidenceReference: {
        type: String,
        default: null,
        trim: true,
      },

      verificationErrorCode: {
        type: String,
        default: null,
        trim: true,
      },

      requiresManualReview: {
        type: Boolean,
        default: false,
      },

      manualReviewReason: {
        type: String,
        default: null,
        trim: true,
      },
    },
    {
      timestamps: true,
      versionKey: "__v",
    }
  );

/**
 * ============================================================
 * SUBSCRIPTION RELATIONSHIP VALIDATION
 * ============================================================
 *
 * Subscription payments must reference the same subscription
 * as their PaymentTransaction.
 *
 * Non-subscription payments must not carry a subscriptionId.
 *
 * The PaymentTransaction model is retrieved from Mongoose's
 * registered models to avoid a direct model import.
 */

financialVerificationSchema.pre(
  "validate",
  async function validatePaymentRelationship() {
    if (
      !this.isNew &&
      !this.isModified("paymentId") &&
      !this.isModified("subscriptionId")
    ) {
      return;
    }

    if (!this.paymentId) {
      this.invalidate(
        "paymentId",
        "A payment reference is required."
      );
      return;
    }

    const PaymentTransaction =
      mongoose.models.PaymentTransaction;

    if (!PaymentTransaction) {
      throw new Error(
        "PaymentTransaction model must be registered before validating M-Pesa financial verification."
      );
    }

    const payment =
      await PaymentTransaction.findById(
        this.paymentId
      )
        .select("_id purpose subscriptionId")
        .lean();

    if (!payment) {
      this.invalidate(
        "paymentId",
        "The referenced payment transaction does not exist."
      );
      return;
    }

    const isSubscriptionPayment =
      SUBSCRIPTION_PAYMENT_PURPOSES.has(
        payment.purpose
      );

    if (isSubscriptionPayment) {
      if (!payment.subscriptionId) {
        this.invalidate(
          "subscriptionId",
          "Subscription payments must reference a subscription on the payment transaction."
        );
        return;
      }

      if (
        !this.subscriptionId ||
        String(this.subscriptionId) !==
          String(payment.subscriptionId)
      ) {
        this.invalidate(
          "subscriptionId",
          "The financial verification subscription must match the payment transaction subscription."
        );
      }

      return;
    }

    if (
      this.subscriptionId ||
      payment.subscriptionId
    ) {
      this.invalidate(
        "subscriptionId",
        "Non-subscription payments must not reference a subscription."
      );
    }
  }
);

/**
 * ============================================================
 * PREVENT DUPLICATE RECEIPT VERIFICATION
 * ============================================================
 *
 * Only non-null receipt numbers participate in this index.
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
