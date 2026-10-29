import mongoose from "mongoose";

import SubscriberSubscription, {
  SUBSCRIPTION_STATUSES,
} from "../models/SubscriberSubscription.model.js";

import PaymentTransaction from "../models/PaymentTransaction.model.js";

import MpesaFinancialVerification, {
  FINANCIAL_VERIFICATION_STATUSES,
} from "../models/MpesaFinancialVerification.model.js";

import {
  PAYMENT_PROVIDERS,
  PAYMENT_PURPOSES,
  PAYMENT_STATUSES,
  PAYMENT_VERIFICATION_STATUSES,
} from "../constants/payment.constants.js";

import {
  verifyPaymentTransaction,
} from "./paymentVerification.service.js";

/**
 * ============================================================
 * PREMIUMCHAT — SUBSCRIPTION AUTHORIZATION
 * ============================================================
 *
 * STEP 18.32
 *
 * Security requirements:
 *
 * - Deny access by default.
 * - Require an ACTIVE subscription.
 * - Enforce billing-period boundaries.
 * - Reject suspended subscriptions.
 * - Require a matching, applied payment.
 * - Require matching financial verification.
 * - Require authoritative provider verification.
 *
 * This service does not:
 *
 * - Initiate payments.
 * - Activate subscriptions.
 * - Extend billing periods.
 * - Modify payment verification.
 * - Trust client-submitted payment evidence.
 */

const validId = (value) =>
  typeof value === "string" &&
  mongoose.isObjectIdOrHexString(value);

const sameId = (left, right) =>
  Boolean(left && right) &&
  left.toString() === right.toString();

const validDate = (value) =>
  value instanceof Date &&
  !Number.isNaN(value.getTime());

const deny = (reason) => ({
  authorized: false,
  hasAccess: false,
  reason,
  subscriptionId: null,
  expiresAt: null,
});

const allow = (subscription) => ({
  authorized: true,
  hasAccess: true,
  reason: "VERIFIED_SUBSCRIPTION_ACCESS",
  subscriptionId: subscription._id.toString(),
  expiresAt: subscription.currentPeriodEnd,
});

/**
 * ============================================================
 * VALIDATE SUBSCRIPTION PERIOD
 * ============================================================
 */

export const hasValidSubscriptionPeriod = (
  subscription,
  now = new Date()
) => {
  if (
    !subscription ||
    !validDate(now) ||
    subscription.status !==
      SUBSCRIPTION_STATUSES.ACTIVE
  ) {
    return false;
  }

  if (
    !validDate(subscription.startedAt) ||
    !validDate(subscription.currentPeriodStart) ||
    !validDate(subscription.currentPeriodEnd)
  ) {
    return false;
  }

  if (
    subscription.currentPeriodStart > now ||
    subscription.currentPeriodEnd <= now ||
    subscription.currentPeriodEnd <=
      subscription.currentPeriodStart
  ) {
    return false;
  }

  if (
    subscription.suspendedAt ||
    subscription.expiredAt ||
    subscription.canceledAt
  ) {
    return false;
  }

  return true;
};

/**
 * ============================================================
 * VALIDATE APPLIED PAYMENT
 * ============================================================
 *
 * This checks stored payment integrity only.
 *
 * It does not establish provider authenticity.
 */

export const inspectSubscriptionPaymentIntegrity = ({
  subscription,
  payment,
  financialVerification,
} = {}) => {
  if (!subscription || !payment) {
    return {
      valid: false,
      reason: "SUBSCRIPTION_PAYMENT_MISSING",
    };
  }

  if (
    !sameId(
      subscription.lastPaymentId,
      payment._id
    ) ||
    !sameId(
      subscription._id,
      payment.subscriptionId
    ) ||
    !sameId(
      subscription.subscriberId,
      payment.payerId
    ) ||
    !sameId(
      subscription.creatorId,
      payment.creatorId
    )
  ) {
    return {
      valid: false,
      reason: "PAYMENT_OWNERSHIP_MISMATCH",
    };
  }

  if (
    payment.provider !==
      PAYMENT_PROVIDERS.MPESA ||
    payment.purpose !==
      PAYMENT_PURPOSES.SUBSCRIPTION_INITIAL
  ) {
    return {
      valid: false,
      reason: "UNSUPPORTED_PAYMENT_TYPE",
    };
  }

  if (
    payment.status !==
      PAYMENT_STATUSES.SUCCEEDED ||
    payment.verificationStatus !==
      PAYMENT_VERIFICATION_STATUSES.VERIFIED
  ) {
    return {
      valid: false,
      reason: "PAYMENT_NOT_VERIFIED",
    };
  }

  if (
    !validDate(payment.verifiedAt) ||
    !validDate(payment.paidAt) ||
    !validDate(payment.entitlementAppliedAt)
  ) {
    return {
      valid: false,
      reason: "PAYMENT_APPLICATION_INCOMPLETE",
    };
  }

  if (
    !validDate(payment.periodStart) ||
    !validDate(payment.periodEnd) ||
    payment.periodStart.getTime() !==
      subscription.currentPeriodStart.getTime() ||
    payment.periodEnd.getTime() !==
      subscription.currentPeriodEnd.getTime()
  ) {
    return {
      valid: false,
      reason: "BILLING_PERIOD_MISMATCH",
    };
  }

  if (
    payment.amountMinor !==
      subscription.planSnapshot?.monthlyPriceMinor ||
    payment.currency !==
      subscription.planSnapshot?.currency
  ) {
    return {
      valid: false,
      reason: "SUBSCRIPTION_PRICE_MISMATCH",
    };
  }

  if (
    !financialVerification ||
    financialVerification.status !==
      FINANCIAL_VERIFICATION_STATUSES.VERIFIED ||
    financialVerification.requiresManualReview
  ) {
    return {
      valid: false,
      reason: "FINANCIAL_VERIFICATION_INVALID",
    };
  }

  if (
    !sameId(
      financialVerification.paymentId,
      payment._id
    ) ||
    !sameId(
      financialVerification.subscriptionId,
      subscription._id
    ) ||
    financialVerification.provider !==
      PAYMENT_PROVIDERS.MPESA
  ) {
    return {
      valid: false,
      reason: "FINANCIAL_VERIFICATION_OWNERSHIP_MISMATCH",
    };
  }

  if (
    !payment.providerReceipt ||
    financialVerification.mpesaReceiptNumber !==
      payment.providerReceipt ||
    financialVerification.providerTransactionId !==
      payment.providerTransactionId
  ) {
    return {
      valid: false,
      reason: "FINANCIAL_REFERENCE_MISMATCH",
    };
  }

  if (
    financialVerification.verifiedAmountMinor !==
      payment.amountMinor ||
    financialVerification.verifiedCurrency !==
      payment.currency ||
    !validDate(financialVerification.verifiedAt)
  ) {
    return {
      valid: false,
      reason: "FINANCIAL_AMOUNT_OR_DATE_MISMATCH",
    };
  }

  return {
    valid: true,
    reason: null,
  };
};

/**
 * ============================================================
 * AUTHORIZE SUBSCRIBER ACCESS
 * ============================================================
 */

export const authorizeSubscriberAccess = async ({
  subscriberId,
  creatorId,
} = {}) => {
  /**
   * STEP 1 — VALIDATE IDENTIFIERS
   */

  if (
    !validId(subscriberId) ||
    !validId(creatorId)
  ) {
    return deny("INVALID_SUBSCRIPTION_IDENTIFIERS");
  }

  if (subscriberId === creatorId) {
    return deny("SELF_SUBSCRIPTION_NOT_ALLOWED");
  }

  const now = new Date();

  /**
   * STEP 2 — FIND CURRENT SUBSCRIPTION
   */

  const subscription =
    await SubscriberSubscription.findOne({
      subscriberId,
      creatorId,
      status: SUBSCRIPTION_STATUSES.ACTIVE,
      currentPeriodStart: { $lte: now },
      currentPeriodEnd: { $gt: now },
      suspendedAt: null,
      canceledAt: null,
      expiredAt: null,
    });

  if (!subscription) {
    return deny("ACTIVE_SUBSCRIPTION_NOT_FOUND");
  }

  /**
   * STEP 3 — VALIDATE PAID PERIOD
   */

  if (
    !hasValidSubscriptionPeriod(
      subscription,
      now
    )
  ) {
    return deny("SUBSCRIPTION_PERIOD_INVALID");
  }

  /**
   * STEP 4 — REQUIRE APPLIED PAYMENT
   */

  if (!subscription.lastPaymentId) {
    return deny("SUBSCRIPTION_PAYMENT_REFERENCE_MISSING");
  }

  const payment =
    await PaymentTransaction.findById(
      subscription.lastPaymentId
    );

  if (!payment) {
    return deny("SUBSCRIPTION_PAYMENT_NOT_FOUND");
  }

  /**
   * STEP 5 — LOAD FINANCIAL VERIFICATION
   */

  const financialVerification =
    await MpesaFinancialVerification.findOne({
      paymentId: payment._id,
    });

  /**
   * STEP 6 — CHECK STORED RECORD INTEGRITY
   */

  const integrity =
    inspectSubscriptionPaymentIntegrity({
      subscription,
      payment,
      financialVerification,
    });

  if (!integrity.valid) {
    return deny(integrity.reason);
  }

  /**
   * STEP 7 — AUTHORITATIVE PROVIDER VERIFICATION
   *
   * Database consistency is insufficient.
   *
   * This service must return verified:true
   * only when the trusted settlement workflow
   * has established authoritative evidence.
   */

  const verification =
    await verifyPaymentTransaction({
      paymentId: payment._id.toString(),
    });

  if (
    verification?.verified !== true ||
    !verification.payment ||
    !sameId(
      verification.payment._id,
      payment._id
    )
  ) {
    return deny(
      verification?.reason ||
        "AUTHORITATIVE_PAYMENT_VERIFICATION_REQUIRED"
    );
  }

  /**
   * STEP 8 — FINAL PERIOD CHECK
   *
   * Do not authorize access after the paid
   * period has ended during verification.
   */

  if (
    !hasValidSubscriptionPeriod(
      subscription,
      new Date()
    )
  ) {
    return deny("SUBSCRIPTION_PERIOD_EXPIRED");
  }

  return allow(subscription);
};

/**
 * ============================================================
 * BOOLEAN PAYMENT AUTHORIZATION HELPER
 * ============================================================
 *
 * Retains a simple boolean interface for
 * existing authorization integrations.
 */

export const verifySubscriptionPayment = async ({
  subscriberId,
  creatorId,
} = {}) => {
  const result = await authorizeSubscriberAccess({
    subscriberId,
    creatorId,
  });

  return result.authorized === true;
};

export default {
  authorizeSubscriberAccess,
  verifySubscriptionPayment,
  hasValidSubscriptionPeriod,
  inspectSubscriptionPaymentIntegrity,
};