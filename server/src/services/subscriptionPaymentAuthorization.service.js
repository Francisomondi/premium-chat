import mongoose from "mongoose";

import PaymentTransaction from "../models/PaymentTransaction.model.js";

import {
  PAYMENT_PURPOSES,
  PAYMENT_STATUSES,
  PAYMENT_VERIFICATION_STATUSES,
} from "../constants/payment.constants.js";

/**
 * ============================================================
 * PREMIUMCHAT — SUBSCRIPTION PAYMENT AUTHORIZATION
 * ============================================================
 *
 * Responsibilities:
 *
 * - Check whether a subscription has a
 *   payment record for its current period.
 *
 * - Keep subscription payment authorization
 *   separate from subscription status checks.
 *
 * SECURITY:
 *
 * - Never grant access from subscription
 *   status alone.
 *
 * - Never grant access from a payment record
 *   whose provider verification has not
 *   been established.
 *
 * - Never accept payment identifiers from
 *   clients as proof of entitlement.
 */

/**
 * ============================================================
 * VERIFY SUBSCRIPTION PAYMENT
 * ============================================================
 *
 * This is the intended integration point for:
 *
 * subscriptionAuthorization.service.js
 *
 * Current behavior:
 *
 * FAIL CLOSED until trusted payment verification
 * and entitlement application are implemented.
 */

export const verifySubscriptionPayment = async ({
  subscription,
} = {}) => {
  if (
    !subscription ||
    !mongoose.isObjectIdOrHexString(
      subscription._id
    )
  ) {
    return {
      verified: false,

      reason: "INVALID_SUBSCRIPTION",
    };
  }

  /**
   * Locate a potentially relevant
   * payment record.
   *
   * This query is informational only.
   */

  const payment =
    await PaymentTransaction.findOne({
      subscriptionId: subscription._id,

      purpose: {
        $in: [
          PAYMENT_PURPOSES.SUBSCRIPTION_INITIAL,
          PAYMENT_PURPOSES.SUBSCRIPTION_RENEWAL,
        ],
      },

      status:
        PAYMENT_STATUSES.SUCCEEDED,

      verificationStatus:
        PAYMENT_VERIFICATION_STATUSES.VERIFIED,

      entitlementAppliedAt: {
        $ne: null,
      },

      periodStart:
        subscription.currentPeriodStart,

      periodEnd:
        subscription.currentPeriodEnd,
    }).sort({
      createdAt: -1,
    });

  /**
   * The payment model is not yet connected
   * to a trusted provider-verification workflow.
   *
   * Therefore, finding a matching record
   * must not grant access.
   */

  return {
    verified: false,

    reason:
      payment
        ? "PAYMENT_PROVIDER_TRUST_NOT_ESTABLISHED"
        : "VERIFIED_PAYMENT_REQUIRED",
  };
};