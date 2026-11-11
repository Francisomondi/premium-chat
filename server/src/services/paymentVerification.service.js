
import mongoose from "mongoose";

import PaymentTransaction from "../models/PaymentTransaction.model.js";

import MpesaFinancialVerification, {
  FINANCIAL_VERIFICATION_STATUSES,
  FINANCIAL_EVIDENCE_SOURCES,
} from "../models/MpesaFinancialVerification.model.js";

import MpesaCallbackEvent, {
  MPESA_CALLBACK_EVENT_STATUSES,
  MPESA_CALLBACK_SETTLEMENT_STATUSES,
} from "../models/MpesaCallbackEvent.model.js";

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
 * Responsibilities:
 *
 * - Validate payment identifiers.
 * - Validate supported payment purposes.
 * - Inspect stored payment verification state.
 * - Inspect financial verification records.
 * - Require matching settlement evidence.
 * - Verify authenticated Daraja STK Query evidence
 *   for media purchases.
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
 * This service relies on trusted settlement-recording
 * workflows being the exclusive writers of authoritative
 * financial verification records.
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

    const isMediaPurchase =
      payment.purpose === PAYMENT_PURPOSES.MEDIA_PURCHASE;

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

    const isStkQueryMediaPurchase =
      isMediaPurchase &&
      financialVerification.evidenceSource ===
        FINANCIAL_EVIDENCE_SOURCES.DARAJA_STK_QUERY;

    /**
     * Require verified financial evidence.
     */

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
     * Accept only:
     *
     * - Trusted provider settlement evidence.
     * - Daraja STK Query evidence for media purchases.
     *
     * Subscription payments remain restricted to
     * provider settlement evidence.
     */

    if (
      financialVerification.evidenceSource !==
        FINANCIAL_EVIDENCE_SOURCES.PROVIDER_SETTLEMENT &&
      !isStkQueryMediaPurchase
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
     * Require the exact M-Pesa CheckoutRequestID.
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
     * Verify completed authenticated Daraja STK Query evidence.
     *
     * This path is exclusively for media purchases.
     *
     * Callback claims alone are never treated as proof
     * of payment.
     */

    if (isStkQueryMediaPurchase) {
      const callbackEvent =
        await MpesaCallbackEvent.findOne({
          status: MPESA_CALLBACK_EVENT_STATUSES.RECONCILED,

          settlementStatus:
            MPESA_CALLBACK_SETTLEMENT_STATUSES.COMPLETED,

          paymentId: payment._id,

          checkoutRequestId:
            payment.providerTransactionId,

          "stkQueryEvidence.authenticatedQuery": true,

          "stkQueryEvidence.checkoutRequestId":
            payment.providerTransactionId,

          "stkQueryEvidence.resultCode": "0",

          hasConflict: false,

          manualReviewRequiredAt: null,
        });

      if (!callbackEvent) {
        return {
          consistent: false,
          reason: "STK_QUERY_CALLBACK_EVIDENCE_MISSING",
        };
      }

      if (
        !validString(
          callbackEvent.stkQueryEvidence?.evidenceReference
        ) ||
        callbackEvent.stkQueryEvidence.evidenceReference !==
          financialVerification.evidenceReference
      ) {
        return {
          consistent: false,
          reason: "STK_QUERY_EVIDENCE_REFERENCE_MISMATCH",
        };
      }
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
     * Require matching settlement receipt numbers.
     *
     * Daraja STK Query does not independently provide
     * an M-Pesa receipt number.
     *
     * Never substitute an untrusted callback receipt.
     */

    if (isStkQueryMediaPurchase) {
      if (
        payment.providerReceipt !== null ||
        financialVerification.mpesaReceiptNumber !== null
      ) {
        return {
          consistent: false,
          reason: "STK_QUERY_RECEIPT_MUST_BE_NULL",
        };
      }
    } else if (
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
     *
     * The expected amount comes from the server-stored
     * payment transaction, not callback claims.
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

    /**
     * Require a valid financial verification timestamp.
     */

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
     * Merchant-settled payments and subscriptions must
     * retain the existing transaction enquiry receipt check.
     *
     * STK Query media purchases do not require an enquiry receipt.
     */

    if (!isStkQueryMediaPurchase) {
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
