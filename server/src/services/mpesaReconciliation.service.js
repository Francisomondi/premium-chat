import mongoose from "mongoose";

import PaymentTransaction from "../models/PaymentTransaction.model.js";

import MpesaCallbackEvent, {
  MPESA_CALLBACK_EVENT_STATUSES,
} from "../models/MpesaCallbackEvent.model.js";

import {
  PAYMENT_PROVIDERS,
  PAYMENT_STATUSES,
} from "../constants/payment.constants.js";

import {
  queryMpesaStkStatus,
} from "../payments/mpesa/mpesa.client.js";

import AppError from "../utils/AppError.js";

/**
 * ============================================================
 * PREMIUMCHAT — M-PESA RECONCILIATION SERVICE
 * ============================================================
 *
 * Responsibilities:
 *
 * - Load the original payment attempt.
 * - Query Safaricom directly.
 * - Match CheckoutRequestID.
 * - Match MerchantRequestID when returned.
 * - Track reconciliation progress.
 *
 * SECURITY:
 *
 * - Never trust callback status alone.
 * - Never activate subscriptions.
 * - Never mark payment VERIFIED here.
 * - Never mark payment SUCCEEDED here.
 */

const isValidId = (value) =>
  typeof value === "string" &&
  mongoose.isObjectIdOrHexString(value);

/**
 * ============================================================
 * RECONCILE PAYMENT
 * ============================================================
 */

export const reconcileMpesaPayment =
  async ({
    paymentId,
  } = {}) => {
    if (!isValidId(paymentId)) {
      throw new AppError(
        "Invalid payment identifier.",
        400,
        "INVALID_PAYMENT_ID"
      );
    }

    const payment =
      await PaymentTransaction.findById(
        paymentId
      );

    if (!payment) {
      throw new AppError(
        "Payment not found.",
        404,
        "PAYMENT_NOT_FOUND"
      );
    }

    if (
      payment.provider !==
      PAYMENT_PROVIDERS.MPESA
    ) {
      throw new AppError(
        "Payment provider mismatch.",
        409,
        "INVALID_PAYMENT_PROVIDER"
      );
    }

    if (
      ![
        PAYMENT_STATUSES.PENDING,
        PAYMENT_STATUSES.PROCESSING,
      ].includes(payment.status)
    ) {
      return {
        checked: false,

        reason:
          "PAYMENT_NOT_PENDING",
      };
    }

    if (
      !payment.providerTransactionId ||
      !payment.merchantRequestId
    ) {
      return {
        checked: false,

        reason:
          "PROVIDER_IDENTIFIERS_MISSING",
      };
    }

    const result =
      await queryMpesaStkStatus({
        checkoutRequestId:
          payment.providerTransactionId,
      });

    /**
     * Verify checkout identity.
     */

    if (
      result.checkoutRequestId !==
      payment.providerTransactionId
    ) {
      throw new AppError(
        "CheckoutRequestID mismatch.",
        409,
        "MPESA_CHECKOUT_MISMATCH"
      );
    }

    /**
     * Verify MerchantRequestID when
     * Safaricom returns it.
     */

    if (
      result.merchantRequestId &&
      result.merchantRequestId !==
        payment.merchantRequestId
    ) {
      throw new AppError(
        "MerchantRequestID mismatch.",
        409,
        "MPESA_MERCHANT_REQUEST_MISMATCH"
      );
    }

    /**
     * Find stored callback event.
     */

    const event =
      await MpesaCallbackEvent.findOne({
        paymentId:
          payment._id,

        checkoutRequestId:
          payment.providerTransactionId,

        merchantRequestId:
          payment.merchantRequestId,
      });

    /**
     * Determine whether the provider
     * reports successful payment.
     *
     * This is not final entitlement approval.
     */

    const providerReportsSuccess =
      result.providerReportsSuccess;

    /**
     * Detect disagreement between
     * callback and query results.
     */

    const callbackReportsSuccess =
      event?.resultCode === 0;

    const hasCallbackConflict =
      Boolean(event) &&
      result.resultCode !== null &&
      callbackReportsSuccess !==
        providerReportsSuccess;

    /**
     * Update event reconciliation state.
     *
     * Do not mark RECONCILED when evidence
     * is contradictory or incomplete.
     */

    if (event) {
      await MpesaCallbackEvent.updateOne(
        {
          _id: event._id,
        },
        {
          $set: {
            status:
              hasCallbackConflict
                ? MPESA_CALLBACK_EVENT_STATUSES.UNRESOLVED
                : MPESA_CALLBACK_EVENT_STATUSES.RECONCILED,

            reconciliationAttemptedAt:
              new Date(),

            reconciledAt:
              hasCallbackConflict
                ? null
                : new Date(),

            lastErrorCode:
              hasCallbackConflict
                ? "PROVIDER_CALLBACK_CONFLICT"
                : null,
          },

          $inc: {
            __v: 1,
          },
        }
      );
    }

    return {
      checked: true,

      paymentId:
        payment._id.toString(),

      checkoutRequestId:
        payment.providerTransactionId,

      providerReportsSuccess,

      callbackReportsSuccess:
        event
          ? callbackReportsSuccess
          : null,

      hasCallbackConflict,

      resultCode:
        result.resultCode,

      /**
       * Payment status remains unchanged.
       */

      paymentVerified: false,

      entitlementApplied: false,

      requiresFurtherVerification:
        providerReportsSuccess,
    };
  };