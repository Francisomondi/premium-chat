import mongoose from "mongoose";

import PaymentTransaction from "../models/PaymentTransaction.model.js";

import {
  PAYMENT_STATUSES,
  PAYMENT_VERIFICATION_STATUSES,
} from "../constants/payment.constants.js";

/**
 * ============================================================
 * PREMIUMCHAT — PAYMENT VERIFICATION SERVICE
 * ============================================================
 *
 * Module 4.3.5.7.7
 *
 * SECURITY:
 *
 * - Payment verification must be provider-backed.
 * - Never trust client payment confirmations.
 * - Never mark payments successful without
 *   verified provider evidence.
 * - Never activate subscriptions here.
 */

/**
 * ============================================================
 * VALIDATE PAYMENT ID
 * ============================================================
 */

const isValidPaymentId = (paymentId) =>
  typeof paymentId === "string" &&
  mongoose.isObjectIdOrHexString(paymentId);

/**
 * ============================================================
 * VERIFY PAYMENT TRANSACTION
 * ============================================================
 *
 * This function currently fails closed.
 *
 * Provider-specific verification will be
 * connected in the payment integration module.
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

  /**
   * Provider verification is not implemented.
   *
   * Even if a database record currently says
   * SUCCEEDED / VERIFIED, this function does
   * not independently establish its authenticity.
   */

  return {
    verified: false,

    reason:
      "PROVIDER_VERIFICATION_NOT_CONFIGURED",

    payment: null,
  };
};

/**
 * ============================================================
 * CHECK VERIFIED PAYMENT RECORD
 * ============================================================
 *
 * This helper only checks stored payment state.
 *
 * It does not independently verify the provider.
 * Do not use it alone to grant premium access.
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
      payment.verifiedAt instanceof Date &&
      !Number.isNaN(
        payment.verifiedAt.getTime()
      ) &&
      payment.paidAt instanceof Date &&
      !Number.isNaN(
        payment.paidAt.getTime()
      )
    );
  };