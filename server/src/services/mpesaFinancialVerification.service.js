import mongoose from "mongoose";

import PaymentTransaction from "../models/PaymentTransaction.model.js";

import SubscriberSubscription from "../models/SubscriberSubscription.model.js";

import MpesaFinancialVerification, {
  FINANCIAL_VERIFICATION_STATUSES,
  FINANCIAL_EVIDENCE_SOURCES,
} from "../models/MpesaFinancialVerification.model.js";

import {
  PAYMENT_PROVIDERS,
  PAYMENT_PURPOSES,
  PAYMENT_STATUSES,
  PAYMENT_VERIFICATION_STATUSES,
} from "../constants/payment.constants.js";

import AppError from "../utils/AppError.js";

/**
 * ============================================================
 * PREMIUMCHAT — M-PESA FINANCIAL VERIFICATION SERVICE
 * ============================================================
 *
 * Module 4.3.5.7.8.13.17.2
 *
 * Responsibilities:
 *
 * - Validate payment identity.
 * - Validate subscription ownership.
 * - Validate payment amount and currency.
 * - Validate receipt and provider identifiers.
 * - Prevent duplicate receipt verification.
 * - Record a financial verification decision.
 *
 * IMPORTANT:
 *
 * This module does not contact Safaricom.
 *
 * Only an independently authenticated,
 * trusted settlement integration may authorize
 * a VERIFIED decision.
 *
 * Until that integration exists, verification
 * remains fail-closed.
 *
 * This service does not activate subscriptions.
 */

const isValidId = (value) =>
  mongoose.isObjectIdOrHexString(value);

const sameId = (left, right) =>
  Boolean(left && right) &&
  left.toString() === right.toString();

const validString = (value) =>
  typeof value === "string" &&
  value.trim().length > 0;

const fail = (
  message,
  code,
  status = 409
) => {
  throw new AppError(
    message,
    status,
    code
  );
};

/**
 * ============================================================
 * VALIDATE PAYMENT RELATIONSHIP
 * ============================================================
 */

const validatePaymentRelationship = (
  payment,
  subscription
) => {
  if (
    !sameId(
      payment.subscriptionId,
      subscription._id
    ) ||
    !sameId(
      payment.payerId,
      subscription.subscriberId
    ) ||
    !sameId(
      payment.creatorId,
      subscription.creatorId
    )
  ) {
    fail(
      "Payment and subscription ownership do not match.",
      "PAYMENT_SUBSCRIPTION_MISMATCH"
    );
  }

  if (
    payment.purpose !==
      PAYMENT_PURPOSES.SUBSCRIPTION_INITIAL &&
    payment.purpose !==
      PAYMENT_PURPOSES.SUBSCRIPTION_RENEWAL
  ) {
    fail(
      "Unsupported payment purpose.",
      "INVALID_PAYMENT_PURPOSE"
    );
  }

  if (
    payment.amountMinor !==
      subscription.planSnapshot?.monthlyPriceMinor ||
    payment.currency !==
      subscription.planSnapshot?.currency
  ) {
    fail(
      "Payment does not match the subscription price.",
      "PAYMENT_PRICE_MISMATCH"
    );
  }

  if (
    payment.provider !==
    PAYMENT_PROVIDERS.MPESA
  ) {
    fail(
      "Payment provider mismatch.",
      "INVALID_PAYMENT_PROVIDER"
    );
  }
};

/**
 * ============================================================
 * VALIDATE FINANCIAL EVIDENCE
 * ============================================================
 *
 * This function validates evidence consistency.
 *
 * It does NOT establish evidence authenticity.
 */

export const validateMpesaFinancialEvidence = ({
  payment,
  subscription,
  evidence,
}) => {
  if (!payment || !subscription) {
    fail(
      "Payment and subscription are required.",
      "PAYMENT_CONTEXT_MISSING"
    );
  }

  validatePaymentRelationship(
    payment,
    subscription
  );

  if (
    !evidence ||
    typeof evidence !== "object"
  ) {
    fail(
      "Financial evidence is required.",
      "FINANCIAL_EVIDENCE_MISSING"
    );
  }

  if (
    !validString(
      payment.providerTransactionId
    )
  ) {
    fail(
      "Original provider transaction identifier is missing.",
      "PROVIDER_TRANSACTION_ID_MISSING"
    );
  }

  if (
    evidence.providerTransactionId !==
    payment.providerTransactionId
  ) {
    fail(
      "Provider transaction identifiers do not match.",
      "PROVIDER_TRANSACTION_MISMATCH"
    );
  }

  if (
    !validString(
      evidence.mpesaReceiptNumber
    )
  ) {
    fail(
      "M-Pesa receipt number is required.",
      "MPESA_RECEIPT_REQUIRED"
    );
  }

  if (
    !Number.isSafeInteger(
      evidence.amountMinor
    ) ||
    evidence.amountMinor <= 0
  ) {
    fail(
      "Verified payment amount is invalid.",
      "INVALID_VERIFIED_AMOUNT"
    );
  }

  if (
    evidence.amountMinor !==
    payment.amountMinor
  ) {
    fail(
      "Verified amount does not match the payment.",
      "VERIFIED_AMOUNT_MISMATCH"
    );
  }

  if (
    evidence.currency !== "KES" ||
    evidence.currency !== payment.currency
  ) {
    fail(
      "Verified currency does not match the payment.",
      "VERIFIED_CURRENCY_MISMATCH"
    );
  }

  if (
    !Object.values(
      FINANCIAL_EVIDENCE_SOURCES
    ).includes(evidence.source)
  ) {
    fail(
      "Unsupported financial evidence source.",
      "INVALID_EVIDENCE_SOURCE"
    );
  }

  return {
    valid: true,

    paymentId:
      payment._id.toString(),

    subscriptionId:
      subscription._id.toString(),

    providerTransactionId:
      payment.providerTransactionId,

    mpesaReceiptNumber:
      evidence.mpesaReceiptNumber.trim(),

    amountMinor:
      payment.amountMinor,

    currency:
      payment.currency,

    evidenceSource:
      evidence.source,
  };
};

/**
 * ============================================================
 * INSPECT EXISTING FINANCIAL VERIFICATION
 * ============================================================
 *
 * Read-only inspection.
 *
 * No financial state is changed.
 */

export const inspectMpesaFinancialVerification =
  async ({
    paymentId,
  } = {}) => {
    if (!isValidId(paymentId)) {
      fail(
        "Invalid payment identifier.",
        "INVALID_PAYMENT_ID",
        400
      );
    }

    const payment =
      await PaymentTransaction.findById(
        paymentId
      );

    if (!payment) {
      fail(
        "Payment not found.",
        "PAYMENT_NOT_FOUND",
        404
      );
    }

    if (
      payment.provider !==
      PAYMENT_PROVIDERS.MPESA
    ) {
      fail(
        "Payment provider mismatch.",
        "INVALID_PAYMENT_PROVIDER"
      );
    }

    const verification =
      await MpesaFinancialVerification.findOne({
        paymentId: payment._id,
      });

    return {
      paymentId:
        payment._id.toString(),

      subscriptionId:
        payment.subscriptionId?.toString() ||
        null,

      paymentStatus:
        payment.status,

      paymentVerificationStatus:
        payment.verificationStatus,

      financialVerificationStatus:
        verification?.status ||
        FINANCIAL_VERIFICATION_STATUSES.PENDING,

      financialVerificationRecorded:
        Boolean(verification),

      providerTransactionId:
        payment.providerTransactionId ||
        null,

      requiresManualReview:
        verification?.requiresManualReview ||
        false,

      paymentVerified:
        payment.status ===
          PAYMENT_STATUSES.SUCCEEDED &&
        payment.verificationStatus ===
          PAYMENT_VERIFICATION_STATUSES.VERIFIED &&
        verification?.status ===
          FINANCIAL_VERIFICATION_STATUSES.VERIFIED,

      entitlementApplied:
        Boolean(payment.entitlementAppliedAt),
    };
  };

/**
 * ============================================================
 * VERIFY M-PESA FINANCIAL SETTLEMENT
 * ============================================================
 *
 * FAIL-CLOSED IMPLEMENTATION
 *
 * A future trusted provider adapter must:
 *
 * 1. Authenticate the settlement source.
 * 2. Obtain financial details independently.
 * 3. Verify transaction and receipt identity.
 * 4. Verify amount and currency.
 * 5. Establish receipt uniqueness.
 * 6. Commit the financial verification decision.
 *
 * Do not expose this function as a public
 * endpoint that accepts client-supplied evidence.
 */

export const verifyMpesaFinancialSettlement =
  async ({
    paymentId,
  } = {}) => {
    if (!isValidId(paymentId)) {
      fail(
        "Invalid payment identifier.",
        "INVALID_PAYMENT_ID",
        400
      );
    }

    const payment =
      await PaymentTransaction.findById(
        paymentId
      );

    if (!payment) {
      fail(
        "Payment not found.",
        "PAYMENT_NOT_FOUND",
        404
      );
    }

    if (
      payment.provider !==
      PAYMENT_PROVIDERS.MPESA
    ) {
      fail(
        "Payment provider mismatch.",
        "INVALID_PAYMENT_PROVIDER"
      );
    }

    if (!payment.subscriptionId) {
      fail(
        "Subscription payment reference is missing.",
        "PAYMENT_SUBSCRIPTION_MISSING"
      );
    }

    const subscription =
      await SubscriberSubscription.findById(
        payment.subscriptionId
      );

    if (!subscription) {
      fail(
        "Subscription not found.",
        "SUBSCRIPTION_NOT_FOUND",
        404
      );
    }

    validatePaymentRelationship(
      payment,
      subscription
    );

    /**
     * No trusted financial settlement adapter
     * has been integrated yet.
     *
     * Do not manufacture evidence from:
     *
     * - STK initiation responses
     * - Callback success codes
     * - STK query success codes
     * - Existing payment database fields
     *
     * No verification record is marked VERIFIED.
     * No payment is marked SUCCEEDED.
     * No subscription is activated.
     */

    return {
      verified: false,

      paymentId:
        payment._id.toString(),

      subscriptionId:
        subscription._id.toString(),

      reason:
        "AUTHORITATIVE_FINANCIAL_VERIFICATION_UNAVAILABLE",

      financialDetailsVerified: false,

      paymentVerified: false,

      entitlementApplied: false,

      subscriptionActivated: false,
    };
  };

export default {
  validateMpesaFinancialEvidence,
  inspectMpesaFinancialVerification,
  verifyMpesaFinancialSettlement,
};