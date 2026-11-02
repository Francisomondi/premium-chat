
import mongoose from "mongoose";

import PaymentTransaction from "../models/PaymentTransaction.model.js";

import MpesaFinancialVerification, {
  FINANCIAL_VERIFICATION_STATUSES,
  FINANCIAL_EVIDENCE_SOURCES,
} from "../models/MpesaFinancialVerification.model.js";

import {
  PAYMENT_PROVIDERS,
  PAYMENT_STATUSES,
  PAYMENT_VERIFICATION_STATUSES,
  PAYMENT_PURPOSES,
} from "../constants/payment.constants.js";

/**
 * ============================================================
 * PREMIUMCHAT — PAYMENT VERIFICATION SERVICE
 * ============================================================
 *
 * STEP 19.8.9 / MEDIA PURCHASE VERIFICATION INTEGRATION
 *
 * Responsibilities:
 *
 * - Validate payment identifiers.
 * - Validate supported payment purposes.
 * - Inspect stored payment verification state.
 * - Inspect financial verification records.
 * - Require matching settlement evidence.
 * - Require provider-settlement evidence provenance.
 * - Return a verified payment only when all checks pass.
 *
 * SECURITY:
 *
 * - Does not initiate payments.
 * - Does not record settlements.
 * - Does not activate subscriptions.
 * - Does not trust client-supplied payment evidence.
 * - Does not grant media access from callbacks or STK responses.
 *
 * IMPORTANT:
 *
 * This service relies on the trusted settlement-recording
 * workflow being the exclusive writer of authoritative
 * verification records.
 */

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

const isValidPaymentId = (paymentId) =>
  typeof paymentId === "string" &&
  mongoose.isObjectIdOrHexString(paymentId);

const validDate = (value) =>
  value instanceof Date &&
  !Number.isNaN(value.getTime());

const sameId = (left, right) =>
  Boolean(left && right) &&
  left.toString() === right.toString();

const validString = (value) =>
  typeof value === "string" &&
  value.trim().length > 0;

const deny = (reason) => ({
  verified: false,
  reason,
  payment: null,
});

/**
 * ============================================================
 * SUPPORTED PAYMENT PURPOSES
 * ============================================================
 *
 * Only implemented payment workflows are accepted here.
 *
 * PAID_MESSAGE and CREATOR_TIP remain unsupported until
 * their respective trusted payment workflows are implemented.
 */

const SUPPORTED_PAYMENT_PURPOSES = Object.freeze([
  PAYMENT_PURPOSES.SUBSCRIPTION_INITIAL,
  PAYMENT_PURPOSES.SUBSCRIPTION_RENEWAL,
  PAYMENT_PURPOSES.MEDIA_PURCHASE,
]);

const SUBSCRIPTION_PAYMENT_PURPOSES = Object.freeze([
  PAYMENT_PURPOSES.SUBSCRIPTION_INITIAL,
  PAYMENT_PURPOSES.SUBSCRIPTION_RENEWAL,
]);

/**
 * ============================================================
 * CHECK STORED VERIFIED PAYMENT STATE
 * ============================================================
 */

export const hasStoredVerifiedPaymentState = (payment) => {
  if (!payment) {
    return false;
  }

  return (
    payment.status === PAYMENT_STATUSES.SUCCEEDED &&
    payment.verificationStatus ===
      PAYMENT_VERIFICATION_STATUSES.VERIFIED &&
    validDate(payment.verifiedAt) &&
    validDate(payment.paidAt)
  );
};

/**
 * ============================================================
 * INSPECT PAYMENT VERIFICATION CONSISTENCY
 * ============================================================
 */

export const inspectPaymentVerificationConsistency =
  async ({ paymentId } = {}) => {
    if (!isValidPaymentId(paymentId)) {
      return {
        consistent: false,
        reason: "INVALID_PAYMENT_ID",
      };
    }

    const payment =
      await PaymentTransaction.findById(paymentId);

    if (!payment) {
      return {
        consistent: false,
        reason: "PAYMENT_NOT_FOUND",
      };
    }

    if (
      payment.provider !== PAYMENT_PROVIDERS.MPESA
    ) {
      return {
        consistent: false,
        reason: "UNSUPPORTED_PROVIDER",
      };
    }

    /**
     * Reject unsupported or unknown payment purposes.
     */

    if (
      !SUPPORTED_PAYMENT_PURPOSES.includes(payment.purpose)
    ) {
      return {
        consistent: false,
        reason: "UNSUPPORTED_PAYMENT_PURPOSE",
      };
    }

    /**
     * Retrieve the authoritative financial verification record.
     */

    const financialVerification =
      await MpesaFinancialVerification.findOne({
        paymentId: payment._id,
      });

    if (!financialVerification) {
      return {
        consistent: false,
        reason: "FINANCIAL_VERIFICATION_RECORD_MISSING",
      };
    }

    if (
      financialVerification.status !==
      FINANCIAL_VERIFICATION_STATUSES.VERIFIED
    ) {
      return {
        consistent: false,
        reason: "FINANCIAL_VERIFICATION_NOT_VERIFIED",
      };
    }

    if (
      financialVerification.requiresManualReview
    ) {
      return {
        consistent: false,
        reason: "FINANCIAL_VERIFICATION_REQUIRES_REVIEW",
      };
    }

    /**
     * Require evidence recorded through the
     * authenticated provider settlement workflow.
     */

    if (
      financialVerification.evidenceSource !==
      FINANCIAL_EVIDENCE_SOURCES.PROVIDER_SETTLEMENT
    ) {
      return {
        consistent: false,
        reason: "AUTHORITATIVE_SETTLEMENT_SOURCE_REQUIRED",
      };
    }

    if (
      !validString(
        financialVerification.evidenceReference
      )
    ) {
      return {
        consistent: false,
        reason: "SETTLEMENT_EVIDENCE_REFERENCE_MISSING",
      };
    }

    /**
     * Financial evidence must reference this exact payment.
     */

    if (
      !sameId(
        financialVerification.paymentId,
        payment._id
      )
    ) {
      return {
        consistent: false,
        reason: "FINANCIAL_PAYMENT_MISMATCH",
      };
    }

    /**
     * Subscription payments must have matching subscription IDs.
     *
     * Non-subscription payments, including MEDIA_PURCHASE,
     * must not carry subscription references.
     */

    const isSubscriptionPayment =
      SUBSCRIPTION_PAYMENT_PURPOSES.includes(
        payment.purpose
      );

    if (isSubscriptionPayment) {
      if (
        !sameId(
          financialVerification.subscriptionId,
          payment.subscriptionId
        )
      ) {
        return {
          consistent: false,
          reason: "FINANCIAL_SUBSCRIPTION_MISMATCH",
        };
      }
    } else if (
      financialVerification.subscriptionId ||
      payment.subscriptionId
    ) {
      return {
        consistent: false,
        reason: "UNEXPECTED_SUBSCRIPTION_REFERENCE",
      };
    }

    /**
     * Require matching provider transaction identifiers.
     */

    if (
      !validString(payment.providerTransactionId) ||
      financialVerification.providerTransactionId !==
        payment.providerTransactionId
    ) {
      return {
        consistent: false,
        reason: "FINANCIAL_TRANSACTION_MISMATCH",
      };
    }

    /**
     * Require matching settlement receipt numbers.
     */

    if (
      !validString(payment.providerReceipt) ||
      financialVerification.mpesaReceiptNumber !==
        payment.providerReceipt
    ) {
      return {
        consistent: false,
        reason: "FINANCIAL_RECEIPT_MISMATCH",
      };
    }

    /**
     * Require exact amount matching.
     */

    if (
      financialVerification.verifiedAmountMinor !==
      payment.amountMinor
    ) {
      return {
        consistent: false,
        reason: "FINANCIAL_AMOUNT_MISMATCH",
      };
    }

    /**
     * Require exact currency matching.
     */

    if (
      financialVerification.verifiedCurrency !==
      payment.currency
    ) {
      return {
        consistent: false,
        reason: "FINANCIAL_CURRENCY_MISMATCH",
      };
    }

    if (
      !validDate(financialVerification.verifiedAt)
    ) {
      return {
        consistent: false,
        reason: "FINANCIAL_VERIFICATION_DATE_INVALID",
      };
    }

    /**
     * The payment itself must be stored as verified.
     */

    if (!hasStoredVerifiedPaymentState(payment)) {
      return {
        consistent: false,
        reason: "PAYMENT_VERIFICATION_STATE_INVALID",
      };
    }

    /**
     * The recorded transaction enquiry receipt
     * must match the settled payment receipt.
     */

    const enquiryReceipt =
      payment.transactionStatusEnquiry?.receiptNumber;

    if (
      !validString(enquiryReceipt) ||
      enquiryReceipt !== payment.providerReceipt
    ) {
      return {
        consistent: false,
        reason: "SETTLEMENT_ENQUIRY_RECEIPT_MISMATCH",
      };
    }

    return {
      consistent: true,
      paymentId: payment._id.toString(),
      financialVerificationId:
        financialVerification._id.toString(),
      reason: null,
      payment,
    };
  };

/**
 * ============================================================
 * VERIFY PAYMENT TRANSACTION
 * ============================================================
 *
 * Read-only verification gate.
 *
 * IMPORTANT:
 *
 * This function verifies stored evidence consistency.
 *
 * It does not independently authenticate a settlement
 * with Safaricom.
 *
 * It does not activate subscriptions.
 *
 * It does not activate media purchases.
 *
 * It does not grant access to restricted media.
 *
 * Only trusted settlement-recording workflows may
 * create authoritative financial evidence.
 */

export const verifyPaymentTransaction = async ({
  paymentId,
} = {}) => {
  if (!isValidPaymentId(paymentId)) {
    return deny("INVALID_PAYMENT_ID");
  }

  const consistency =
    await inspectPaymentVerificationConsistency({
      paymentId,
    });

  if (!consistency.consistent) {
    return deny(consistency.reason);
  }

  const payment = consistency.payment;

  if (!payment) {
    return deny("VERIFIED_PAYMENT_RECORD_MISSING");
  }

  if (!hasStoredVerifiedPaymentState(payment)) {
    return deny("PAYMENT_VERIFICATION_STATE_INVALID");
  }

  return {
    verified: true,
    reason: "AUTHORITATIVE_SETTLEMENT_RECORD_VERIFIED",
    payment,
  };
};

export default {
  verifyPaymentTransaction,
  hasStoredVerifiedPaymentState,
  inspectPaymentVerificationConsistency,
};
