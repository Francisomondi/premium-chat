import mongoose from "mongoose";

import PaymentTransaction from "../models/PaymentTransaction.model.js";

import MpesaFinancialVerification, {
  FINANCIAL_VERIFICATION_STATUSES,
} from "../models/MpesaFinancialVerification.model.js";

import {
  PAYMENT_PROVIDERS,
  PAYMENT_STATUSES,
  PAYMENT_VERIFICATION_STATUSES,
} from "../constants/payment.constants.js";

import {
  inspectMpesaFinancialVerification,
} from "./mpesaFinancialVerification.service.js";

/**
 * ============================================================
 * PREMIUMCHAT — PAYMENT VERIFICATION SERVICE
 * ============================================================
 *
 * Module 4.3.5.7.8.13.17.3
 *
 * Responsibilities:
 *
 * - Validate payment identifiers.
 * - Inspect stored payment verification state.
 * - Inspect M-Pesa financial verification records.
 * - Detect inconsistent verification records.
 * - Preserve the trusted provider verification gate.
 *
 * SECURITY:
 *
 * - Database records alone are not authoritative
 *   proof of provider settlement.
 *
 * - Callback success is not payment verification.
 *
 * - STK Push acceptance is not payment verification.
 *
 * - A stored VERIFIED status must not automatically
 *   authorize subscription activation.
 *
 * - No subscription activation occurs here.
 *
 * IMPORTANT:
 *
 * This service remains fail-closed until an
 * authenticated financial settlement integration
 * is implemented.
 */

/**
 * ============================================================
 * VALIDATION HELPERS
 * ============================================================
 */

const isValidPaymentId = (paymentId) =>
  typeof paymentId === "string" &&
  mongoose.isObjectIdOrHexString(paymentId);

const validDate = (value) =>
  value instanceof Date &&
  !Number.isNaN(value.getTime());

/**
 * ============================================================
 * CHECK VERIFIED PAYMENT RECORD
 * ============================================================
 *
 * This helper only checks database state.
 *
 * It does not establish independent provider
 * verification.
 */

export const hasStoredVerifiedPaymentState =
  (payment) => {
    if (!payment) {
      return false;
    }

    return (
      payment.status ===
        PAYMENT_STATUSES.SUCCEEDED &&
      payment.verificationStatus ===
        PAYMENT_VERIFICATION_STATUSES.VERIFIED &&
      validDate(payment.verifiedAt) &&
      validDate(payment.paidAt)
    );
  };

/**
 * ============================================================
 * INSPECT FINANCIAL VERIFICATION CONSISTENCY
 * ============================================================
 *
 * This function detects mismatches between:
 *
 * - PaymentTransaction
 * - MpesaFinancialVerification
 *
 * It does not independently authenticate
 * financial settlement evidence.
 */

export const inspectPaymentVerificationConsistency =
  async ({
    paymentId,
  } = {}) => {
    if (!isValidPaymentId(paymentId)) {
      return {
        consistent: false,
        reason: "INVALID_PAYMENT_ID",
      };
    }

    const payment =
      await PaymentTransaction.findById(
        paymentId
      );

    if (!payment) {
      return {
        consistent: false,
        reason: "PAYMENT_NOT_FOUND",
      };
    }

    if (
      payment.provider !==
      PAYMENT_PROVIDERS.MPESA
    ) {
      return {
        consistent: false,
        reason: "UNSUPPORTED_PROVIDER",
      };
    }

    const financialVerification =
      await MpesaFinancialVerification.findOne({
        paymentId: payment._id,
      });

    if (!financialVerification) {
      return {
        consistent: false,
        reason:
          "FINANCIAL_VERIFICATION_RECORD_MISSING",
      };
    }

    if (
      financialVerification.status !==
      FINANCIAL_VERIFICATION_STATUSES.VERIFIED
    ) {
      return {
        consistent: false,
        reason:
          "FINANCIAL_VERIFICATION_NOT_VERIFIED",
      };
    }

    if (
      financialVerification.requiresManualReview
    ) {
      return {
        consistent: false,
        reason:
          "FINANCIAL_VERIFICATION_REQUIRES_REVIEW",
      };
    }

    if (
      financialVerification.subscriptionId.toString() !==
      payment.subscriptionId?.toString()
    ) {
      return {
        consistent: false,
        reason:
          "FINANCIAL_SUBSCRIPTION_MISMATCH",
      };
    }

    if (
      financialVerification.providerTransactionId !==
      payment.providerTransactionId
    ) {
      return {
        consistent: false,
        reason:
          "FINANCIAL_TRANSACTION_MISMATCH",
      };
    }

    if (
      financialVerification.mpesaReceiptNumber !==
      payment.providerReceipt
    ) {
      return {
        consistent: false,
        reason:
          "FINANCIAL_RECEIPT_MISMATCH",
      };
    }

    if (
      financialVerification.verifiedAmountMinor !==
      payment.amountMinor
    ) {
      return {
        consistent: false,
        reason:
          "FINANCIAL_AMOUNT_MISMATCH",
      };
    }

    if (
      financialVerification.verifiedCurrency !==
      payment.currency
    ) {
      return {
        consistent: false,
        reason:
          "FINANCIAL_CURRENCY_MISMATCH",
      };
    }

    if (
      !validDate(
        financialVerification.verifiedAt
      )
    ) {
      return {
        consistent: false,
        reason:
          "FINANCIAL_VERIFICATION_DATE_INVALID",
      };
    }

    if (
      !hasStoredVerifiedPaymentState(payment)
    ) {
      return {
        consistent: false,
        reason:
          "PAYMENT_VERIFICATION_STATE_INVALID",
      };
    }

    return {
      consistent: true,

      paymentId:
        payment._id.toString(),

      financialVerificationId:
        financialVerification._id.toString(),

      reason: null,
    };
  };

/**
 * ============================================================
 * VERIFY PAYMENT TRANSACTION
 * ============================================================
 *
 * This function is called by the subscription
 * payment application service.
 *
 * A consistency check is NOT equivalent to
 * an authenticated provider settlement check.
 *
 * Therefore, it must not return verified:true
 * until a trusted settlement adapter is
 * implemented and integrated.
 */

export const verifyPaymentTransaction = async ({
  paymentId,
} = {}) => {
  if (!isValidPaymentId(paymentId)) {
    return {
      verified: false,
      reason: "INVALID_PAYMENT_ID",
      payment: null,
    };
  }

  const payment =
    await PaymentTransaction.findById(
      paymentId
    );

  if (!payment) {
    return {
      verified: false,
      reason: "PAYMENT_NOT_FOUND",
      payment: null,
    };
  }

  if (
    payment.provider !==
    PAYMENT_PROVIDERS.MPESA
  ) {
    return {
      verified: false,
      reason: "PROVIDER_NOT_SUPPORTED",
      payment: null,
    };
  }

  /**
   * Check stored financial verification
   * information for diagnostic purposes.
   */

  const consistency =
    await inspectPaymentVerificationConsistency({
      paymentId:
        payment._id.toString(),
    });

  if (!consistency.consistent) {
    return {
      verified: false,
      reason: consistency.reason,
      payment: null,
    };
  }

  /**
   * Even internally consistent database
   * records do not independently prove
   * settlement with Safaricom.
   *
   * Do not return verified:true here.
   */

  return {
    verified: false,

    reason:
      "AUTHORITATIVE_PROVIDER_VERIFICATION_NOT_CONFIGURED",

    payment: null,
  };
};

export default {
  verifyPaymentTransaction,
  hasStoredVerifiedPaymentState,
  inspectPaymentVerificationConsistency,
};