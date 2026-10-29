import mongoose from "mongoose";

import PaymentTransaction from "../models/PaymentTransaction.model.js";

import {
  PAYMENT_PROVIDERS,
  PAYMENT_STATUSES,
  PAYMENT_VERIFICATION_STATUSES,
} from "../constants/payment.constants.js";

import {
  getMpesaConfig,
} from "../payments/mpesa/mpesa.config.js";

import {
  fetchAuthenticatedMerchantTransaction,
  MERCHANT_RECONCILIATION_STATUSES,
} from "../payments/mpesa/mpesaMerchantReconciliation.adapter.js";

import {
  validateMerchantTransactionEvidence,
} from "./mpesaMerchantEvidenceValidation.service.js";

/**
 * ============================================================
 * PREMIUMCHAT — AUTHENTICATED MERCHANT RECONCILIATION
 * ============================================================
 *
 * Read-only reconciliation.
 *
 * Does not:
 * - Mark payments verified
 * - Record financial settlement
 * - Activate subscriptions
 */

const fail = (reason, paymentId = null) => ({
  reconciled: false,
  paymentId,
  reason,
  detailsMatched: false,
  settlementRecorded: false,
  paymentVerified: false,
  subscriptionActivated: false,
});

export const reconcileAuthenticatedMerchantPayment =
  async ({ paymentId } = {}) => {
    if (
      typeof paymentId !== "string" ||
      !mongoose.isObjectIdOrHexString(paymentId)
    ) {
      return fail("INVALID_PAYMENT_ID");
    }

    const payment =
      await PaymentTransaction.findById(paymentId);

    if (!payment) {
      return fail("PAYMENT_NOT_FOUND", paymentId);
    }

    if (payment.provider !== PAYMENT_PROVIDERS.MPESA) {
      return fail("UNSUPPORTED_PROVIDER", paymentId);
    }

    if (
      ![
        PAYMENT_STATUSES.PENDING,
        PAYMENT_STATUSES.PROCESSING,
      ].includes(payment.status)
    ) {
      return fail(
        "PAYMENT_NOT_ELIGIBLE_FOR_RECONCILIATION",
        paymentId
      );
    }

    if (
      payment.verificationStatus !==
      PAYMENT_VERIFICATION_STATUSES.UNVERIFIED
    ) {
      return fail(
        "PAYMENT_ALREADY_VERIFIED_OR_RESTRICTED",
        paymentId
      );
    }

    if (!payment.subscriptionId) {
      return fail(
        "PAYMENT_SUBSCRIPTION_MISSING",
        paymentId
      );
    }

    const receiptNumber =
      payment.transactionStatusEnquiry?.receiptNumber;

    if (
      typeof receiptNumber !== "string" ||
      !/^[A-Za-z0-9]{8,30}$/.test(receiptNumber)
    ) {
      return fail(
        "RECONCILIATION_RECEIPT_MISSING",
        paymentId
      );
    }

    const merchantResult =
      await fetchAuthenticatedMerchantTransaction({
        receiptNumber,
      });

    if (
      merchantResult.status !==
        MERCHANT_RECONCILIATION_STATUSES.VERIFIED ||
      merchantResult.authenticated !== true ||
      !merchantResult.evidenceReference ||
      !merchantResult.transaction
    ) {
      return fail(
        merchantResult.reason ||
          "AUTHENTICATED_EVIDENCE_UNAVAILABLE",
        paymentId
      );
    }

    const config = getMpesaConfig();

    const validation =
      validateMerchantTransactionEvidence({
        payment,
        transaction: merchantResult.transaction,
        expectedMerchantShortcode: config.shortcode,
      });

    if (!validation.valid) {
      return fail(validation.reason, paymentId);
    }

    /**
     * This result means the evidence details match.
     *
     * The adapter must independently guarantee
     * provider authentication before returning
     * authenticated:true.
     *
     * Settlement recording is deliberately separate.
     */

    return {
      reconciled: true,
      paymentId,
      reason: "AUTHENTICATED_DETAILS_MATCH",
      detailsMatched: true,
      evidenceReference:
        merchantResult.evidenceReference,
      settlementRecorded: false,
      paymentVerified: false,
      subscriptionActivated: false,
    };
  };