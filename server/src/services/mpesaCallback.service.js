import PaymentTransaction from "../models/PaymentTransaction.model.js";

import MpesaCallbackEvent, {
  MPESA_CALLBACK_EVENT_STATUSES,
} from "../models/MpesaCallbackEvent.model.js";

import {
  recordMpesaCallbackConflict,
} from "./mpesaCallbackConflictRecording.service.js";

import {
  PAYMENT_PROVIDERS,
} from "../constants/payment.constants.js";

import {
  quarantineMpesaCallback,
} from "./mpesaCallbackQuarantine.service.js";

import {
  parseMpesaStkCallback,
} from "../payments/mpesa/mpesa.callback.js";

/**
 * ============================================================
 * PREMIUMCHAT — HARDENED M-PESA CALLBACK INGESTION
 * ============================================================
 *
 * - Idempotent first delivery.
 * - Duplicate callback comparison.
 * - Conflict recording.
 * - No payment verification.
 * - No subscription activation.
 */

const normalizeAmount = (value) => {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value <= 0
  ) {
    return null;
  }

  const amountMinor = value * 100;

  return Number.isSafeInteger(amountMinor)
    ? amountMinor
    : null;
};

/**
 * ============================================================
 * COMPARE CALLBACK IDENTITY AND CLAIMS
 * ============================================================
 *
 * Duplicate callbacks must match:
 *
 * - Payment identity
 * - Checkout request ID
 * - Merchant request ID
 * - Result code
 * - Reported amount
 * - Reported receipt
 *
 * Callback claims remain untrusted.
 */

const detectConflict = (
  existing,
  incoming
) => {
  if (
    existing.paymentId?.toString() !==
    incoming.paymentId?.toString()
  ) {
    return "PAYMENT_ID_MISMATCH";
  }

  if (
    existing.checkoutRequestId !==
    incoming.checkoutRequestId
  ) {
    return "CHECKOUT_REQUEST_ID_MISMATCH";
  }

  if (
    existing.merchantRequestId !==
    incoming.merchantRequestId
  ) {
    return "MERCHANT_REQUEST_ID_MISMATCH";
  }

  if (
    existing.resultCode !==
    incoming.resultCode
  ) {
    return "RESULT_CODE_MISMATCH";
  }

  if (
    existing.reportedAmountMinor !==
    incoming.reportedAmountMinor
  ) {
    return "AMOUNT_MISMATCH";
  }

  if (
    existing.reportedReceipt !==
    incoming.reportedReceipt
  ) {
    return "RECEIPT_MISMATCH";
  }

  return null;
};

/**
 * ============================================================
 * INGEST CALLBACK
 * ============================================================
 */

export const ingestMpesaCallback =
  async (payload) => {
    const callback =
      parseMpesaStkCallback(payload);

    const payment =
      await PaymentTransaction.findOne({
        provider:
          PAYMENT_PROVIDERS.MPESA,

        providerTransactionId:
          callback.checkoutRequestId,

        merchantRequestId:
          callback.merchantRequestId,
      });

    if (!payment) {
      await quarantineMpesaCallback(callback);

      return {
        accepted: true,
        quarantined: true,
        reason: "UNMATCHED_CALLBACK_QUARANTINED",
      };
    }

    const incoming = {
      paymentId:
        payment._id,

      checkoutRequestId:
        callback.checkoutRequestId,

      merchantRequestId:
        callback.merchantRequestId,

      resultCode:
        callback.resultCode,

      reportedAmountMinor:
        normalizeAmount(callback.amount),

      reportedReceipt:
        callback.receipt,
    };

    /**
     * Atomically insert only when absent.
     *
     * The unique checkout index ensures
     * concurrent first deliveries cannot
     * create two primary events.
     */

    const existing =
      await MpesaCallbackEvent.findOne({
        checkoutRequestId:
          callback.checkoutRequestId,
      });

    if (!existing) {
      try {
        await MpesaCallbackEvent.create(
          incoming
        );

        return {
          accepted: true,
          duplicate: false,
          reason: "CALLBACK_STORED",
        };
      } catch (error) {
        if (error?.code !== 11000) {
          throw error;
        }
      }
    }

    /**
     * Another request may have inserted
     * the event concurrently.
     */

    const stored =
      await MpesaCallbackEvent.findOne({
        checkoutRequestId:
          callback.checkoutRequestId,
      });

    if (!stored) {
      throw new Error(
        "Callback event disappeared during ingestion."
      );
    }

    const reason =
      detectConflict(stored, incoming);

/**
 * ============================================================
 * IDENTICAL DUPLICATE CALLBACK
 * ============================================================
 *
 * An identical duplicate must not clear
 * an existing conflict or manual-review state.
 */

if (!reason) {
  const requiresManualReview =
    stored.hasConflict === true ||
    stored.status ===
      MPESA_CALLBACK_EVENT_STATUSES.MANUAL_REVIEW;

  return {
    accepted: true,

    duplicate: true,

    conflict:
      stored.hasConflict === true,

    requiresManualReview,

    callbackEventId:
      stored._id.toString(),

    reason: requiresManualReview
      ? "CALLBACK_ALREADY_STORED_REVIEW_REQUIRED"
      : "CALLBACK_ALREADY_STORED",
  };
}



await recordMpesaCallbackConflict({
  callbackEventId:
    stored._id.toString(),

  incoming,

  reason,
});

return {
  accepted: true,

  duplicate: true,

  conflict: true,

  requiresManualReview: true,

  callbackEventId:
    stored._id.toString(),

  reason:
    "CALLBACK_CONFLICT_RECORDED",
};
};