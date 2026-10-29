import mongoose from "mongoose";

import PaymentTransaction from "../models/PaymentTransaction.model.js";

import MpesaCallbackEvent from "../models/MpesaCallbackEvent.model.js";

import MpesaFinancialVerification, {
  FINANCIAL_VERIFICATION_STATUSES,
} from "../models/MpesaFinancialVerification.model.js";

import {
  PAYMENT_PROVIDERS,
  PAYMENT_STATUSES,
  PAYMENT_VERIFICATION_STATUSES,
} from "../constants/payment.constants.js";

/**
 * ============================================================
 * PREMIUMCHAT — M-PESA TRANSACTION STATUS RECONCILIATION
 * ============================================================
 *
 * Module 4.3.5.7.8.13.26
 *
 * Responsibilities:
 *
 * - Inspect original payment identity.
 * - Inspect successful STK callback evidence.
 * - Inspect Transaction Status enquiry.
 * - Detect conflicting or incomplete records.
 * - Inspect existing financial verification.
 * - Return a fail-closed reconciliation decision.
 *
 * SECURITY:
 *
 * This service does not authenticate Safaricom
 * notifications.
 *
 * It does not write financial verification records.
 *
 * It does not activate subscriptions.
 */

const validId = (value) =>
  typeof value === "string" &&
  mongoose.isObjectIdOrHexString(value);

const validReceipt = (value) =>
  typeof value === "string" &&
  /^[A-Za-z0-9]{8,30}$/.test(value);

const validString = (value) =>
  typeof value === "string" &&
  value.trim().length > 0;

const validDate = (value) =>
  value instanceof Date &&
  !Number.isNaN(value.getTime());

const decision = ({
  paymentId = null,
  subscriptionId = null,
  eligible = false,
  reason,
  enquiryStatus = null,
  requiresManualReview = false,
}) => ({
  paymentId,
  subscriptionId,
  eligible,
  reason,
  enquiryStatus,
  requiresManualReview,

  authoritativeEvidenceAvailable: false,
  financialDetailsVerified: false,
  paymentVerified: false,
  entitlementApplied: false,
  subscriptionActivated: false,
});

/**
 * ============================================================
 * RECONCILE TRANSACTION STATUS EVIDENCE
 * ============================================================
 */

export const reconcileMpesaTransactionStatusEvidence =
  async ({ paymentId } = {}) => {
    if (!validId(paymentId)) {
      return decision({
        reason: "INVALID_PAYMENT_ID",
      });
    }

    const payment =
      await PaymentTransaction.findById(paymentId)
        .lean();

    if (!payment) {
      return decision({
        paymentId,
        reason: "PAYMENT_NOT_FOUND",
      });
    }

    const context = {
      paymentId: payment._id.toString(),

      subscriptionId:
        payment.subscriptionId?.toString() || null,
    };

    if (payment.provider !== PAYMENT_PROVIDERS.MPESA) {
      return decision({
        ...context,
        reason: "UNSUPPORTED_PAYMENT_PROVIDER",
      });
    }

    /**
     * Do not reconcile a payment already
     * completed or rejected by another path.
     */

    if (
      ![
        PAYMENT_STATUSES.PENDING,
        PAYMENT_STATUSES.PROCESSING,
      ].includes(payment.status) ||
      payment.verificationStatus !==
        PAYMENT_VERIFICATION_STATUSES.UNVERIFIED
    ) {
      return decision({
        ...context,
        reason: "PAYMENT_NOT_PENDING",
      });
    }

    if (
      !payment.subscriptionId ||
      !validString(payment.providerTransactionId) ||
      !validString(payment.merchantRequestId)
    ) {
      return decision({
        ...context,
        reason: "PAYMENT_REFERENCES_MISSING",
      });
    }

    /**
     * STEP 1:
     * Inspect existing financial verification.
     */

    const verification =
      await MpesaFinancialVerification.findOne({
        paymentId: payment._id,
      }).lean();

    if (
      verification?.requiresManualReview ||
      verification?.status ===
        FINANCIAL_VERIFICATION_STATUSES.MANUAL_REVIEW ||
      verification?.status ===
        FINANCIAL_VERIFICATION_STATUSES.REJECTED
    ) {
      return decision({
        ...context,
        reason: "FINANCIAL_REVIEW_REQUIRED",
        requiresManualReview: true,
      });
    }

    if (
      verification?.status ===
      FINANCIAL_VERIFICATION_STATUSES.VERIFIED
    ) {
      return decision({
        ...context,
        reason: "FINANCIAL_VERIFICATION_ALREADY_EXISTS",
      });
    }

    /**
     * STEP 2:
     * Inspect Transaction Status enquiry.
     */

    const enquiry = payment.transactionStatusEnquiry;

    if (!enquiry?.requestedAt) {
      return decision({
        ...context,
        reason: "TRANSACTION_STATUS_NOT_REQUESTED",
      });
    }

    if (
      !validReceipt(enquiry.receiptNumber)
    ) {
      return decision({
        ...context,
        reason: "ENQUIRY_RECEIPT_INVALID",
      });
    }

    if (
      !validString(enquiry.conversationId) ||
      !validString(enquiry.originatorConversationId)
    ) {
      return decision({
        ...context,
        reason: "ENQUIRY_IDENTIFIERS_MISSING",
        enquiryStatus: enquiry.status,
      });
    }

    if (
      !validDate(enquiry.acceptedAt)
    ) {
      return decision({
        ...context,
        reason: "ENQUIRY_ACCEPTANCE_NOT_RECORDED",
        enquiryStatus: enquiry.status,
      });
    }

    if (
      enquiry.status === "MANUAL_REVIEW"
    ) {
      return decision({
        ...context,
        reason: "TRANSACTION_STATUS_REQUIRES_REVIEW",
        enquiryStatus: enquiry.status,
        requiresManualReview: true,
      });
    }

    if (
      enquiry.status !== "ACCEPTED"
    ) {
      return decision({
        ...context,
        reason: "TRANSACTION_STATUS_NOT_ACCEPTED",
        enquiryStatus: enquiry.status,
      });
    }

    /**
     * STEP 3:
     * Inspect original successful STK callback.
     *
     * This callback is only a candidate source
     * for the receipt and reported amount.
     */

    const callbacks =
      await MpesaCallbackEvent.find({
        paymentId: payment._id,

        checkoutRequestId:
          payment.providerTransactionId,

        merchantRequestId:
          payment.merchantRequestId,
      })
        .limit(2)
        .lean();

    if (callbacks.length !== 1) {
      return decision({
        ...context,
        reason:
          callbacks.length === 0
            ? "CALLBACK_NOT_FOUND"
            : "MULTIPLE_CALLBACK_RECORDS",
        requiresManualReview:
          callbacks.length > 1,
      });
    }

    const callback = callbacks[0];

    if (callback.resultCode !== 0) {
      return decision({
        ...context,
        reason: "CALLBACK_NOT_SUCCESSFUL",
      });
    }

    if (
      !validReceipt(callback.reportedReceipt) ||
      callback.reportedReceipt !==
        enquiry.receiptNumber
    ) {
      return decision({
        ...context,
        reason: "CALLBACK_RECEIPT_MISMATCH",
        requiresManualReview: true,
      });
    }

    if (
      !Number.isSafeInteger(
        callback.reportedAmountMinor
      ) ||
      callback.reportedAmountMinor !==
        payment.amountMinor
    ) {
      return decision({
        ...context,
        reason: "CALLBACK_AMOUNT_MISMATCH",
        requiresManualReview: true,
      });
    }

    /**
     * STEP 4:
     * Inspect whether a notification was recorded.
     */

    if (!enquiry.notificationDigest) {
      return decision({
        ...context,
        eligible: true,
        reason: "AWAITING_TRANSACTION_STATUS_RESULT",
        enquiryStatus: enquiry.status,
      });
    }

    /**
     * A notification digest proves only that
     * an HTTP payload was recorded.
     *
     * It does not authenticate the sender.
     */

    return decision({
      ...context,
      reason:
        "INDEPENDENT_PROVIDER_AUTHENTICATION_REQUIRED",
      enquiryStatus: enquiry.status,
      requiresManualReview: true,
    });
  };

export default {
  reconcileMpesaTransactionStatusEvidence,
};