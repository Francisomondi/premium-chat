import PaymentTransaction from "../models/PaymentTransaction.model.js";

import MpesaCallbackEvent from "../models/MpesaCallbackEvent.model.js";

import {
  PAYMENT_PROVIDERS,
} from "../constants/payment.constants.js";

import {
  parseMpesaStkCallback,
} from "../payments/mpesa/mpesa.callback.js";

/**
 * ============================================================
 * PREMIUMCHAT — M-PESA CALLBACK SERVICE
 * ============================================================
 *
 * Responsibilities:
 *
 * - Parse callback data.
 * - Match provider transaction identifiers.
 * - Persist callback events.
 * - Handle duplicate delivery.
 *
 * SECURITY:
 *
 * - Never mark payment successful here.
 * - Never activate subscriptions here.
 * - Never trust callback-reported amounts.
 * - Never expose payment ownership details.
 */

const normalizeReportedAmount = (value) => {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value <= 0
  ) {
    return null;
  }

  const minor = value * 100;

  if (!Number.isSafeInteger(minor)) {
    return null;
  }

  return minor;
};

/**
 * ============================================================
 * PROCESS CALLBACK
 * ============================================================
 */

export const ingestMpesaCallback =
  async (payload) => {
    const callback =
      parseMpesaStkCallback(payload);

    /**
     * Match the checkout request.
     */

    const payment =
      await PaymentTransaction.findOne({
        provider:
          PAYMENT_PROVIDERS.MPESA,

        providerTransactionId:
          callback.checkoutRequestId,
      });

    /**
     * Unknown callbacks are not allowed
     * to modify payment records.
     */

    if (!payment) {
      return {
        accepted: false,

        reason:
          "UNKNOWN_CHECKOUT_REQUEST",
      };
    }

    /**
     * Match MerchantRequestID.
     */

    if (
      !payment.merchantRequestId ||
      payment.merchantRequestId !==
        callback.merchantRequestId
    ) {
      return {
        accepted: false,

        reason:
          "MERCHANT_REQUEST_MISMATCH",
      };
    }

    /**
     * Normalize untrusted callback amount.
     */

    const reportedAmountMinor =
      normalizeReportedAmount(
        callback.amount
      );

    /**
     * Save the event idempotently.
     */

    try {
      await MpesaCallbackEvent.create({
        paymentId:
          payment._id,

        checkoutRequestId:
          callback.checkoutRequestId,

        merchantRequestId:
          callback.merchantRequestId,

        resultCode:
          callback.resultCode,

        reportedAmountMinor,

        reportedReceipt:
          callback.receipt,
      });

      return {
        accepted: true,

        duplicate: false,

        reason:
          "CALLBACK_STORED",
      };
    } catch (error) {
      if (error?.code === 11000) {
        return {
          accepted: true,

          duplicate: true,

          reason:
            "CALLBACK_ALREADY_STORED",
        };
      }

      throw error;
    }
  };