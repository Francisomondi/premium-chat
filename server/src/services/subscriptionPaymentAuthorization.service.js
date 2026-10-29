import mongoose from "mongoose";

import PaymentTransaction from "../models/PaymentTransaction.model.js";

import MpesaFinancialVerification, {
  FINANCIAL_VERIFICATION_STATUSES,
} from "../models/MpesaFinancialVerification.model.js";

import {
  PAYMENT_PURPOSES,
  PAYMENT_STATUSES,
  PAYMENT_VERIFICATION_STATUSES,
} from "../constants/payment.constants.js";

/**
 * PREMIUMCHAT — SUBSCRIPTION PAYMENT AUTHORIZATION
 *
 * Read-only authorization.
 *
 * IMPORTANT:
 * A VERIFIED financial record must originate
 * from a trusted settlement-confirmation process.
 * This service does not authenticate Safaricom
 * evidence or activate subscriptions.
 */

export const verifySubscriptionPayment = async ({
  subscription,
} = {}) => {
  if (
    !subscription?._id ||
    !mongoose.isValidObjectId(subscription._id)
  ) {
    return {
      verified: false,
      reason: "INVALID_SUBSCRIPTION",
    };
  }

  if (
    !subscription.currentPeriodStart ||
    !subscription.currentPeriodEnd ||
    !subscription.lastPaymentId
  ) {
    return {
      verified: false,
      reason: "SUBSCRIPTION_ENTITLEMENT_INCOMPLETE",
    };
  }

  const payment = await PaymentTransaction.findOne({
    _id: subscription.lastPaymentId,

    subscriptionId: subscription._id,

    payerId: subscription.subscriberId,

    creatorId: subscription.creatorId,

    purpose: {
      $in: [
        PAYMENT_PURPOSES.SUBSCRIPTION_INITIAL,
        PAYMENT_PURPOSES.SUBSCRIPTION_RENEWAL,
      ],
    },

    status: PAYMENT_STATUSES.SUCCEEDED,

    verificationStatus:
      PAYMENT_VERIFICATION_STATUSES.VERIFIED,

    verifiedAt: { $ne: null },

    paidAt: { $ne: null },

    entitlementAppliedAt: { $ne: null },

    periodStart: subscription.currentPeriodStart,

    periodEnd: subscription.currentPeriodEnd,
  }).lean();

  if (!payment) {
    return {
      verified: false,
      reason: "VERIFIED_PAYMENT_REQUIRED",
    };
  }

  const financialVerification =
    await MpesaFinancialVerification.findOne({
      paymentId: payment._id,

      subscriptionId: subscription._id,

      status:
        FINANCIAL_VERIFICATION_STATUSES.VERIFIED,

      requiresManualReview: false,

      providerTransactionId:
        payment.providerTransactionId,

      mpesaReceiptNumber:
        payment.providerReceipt,

      verifiedAmountMinor:
        payment.amountMinor,

      verifiedCurrency:
        payment.currency,
    }).lean();

  if (
    !financialVerification ||
    !payment.providerReceipt ||
    !financialVerification.verifiedAt
  ) {
    return {
      verified: false,
      reason: "TRUSTED_FINANCIAL_VERIFICATION_REQUIRED",
    };
  }

  return {
    verified: true,
    reason: "PAYMENT_VERIFIED",
  };
};