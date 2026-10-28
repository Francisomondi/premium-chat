import PaymentTransaction from "../models/PaymentTransaction.model.js";

import MpesaCallbackEvent, {
  MPESA_CALLBACK_EVENT_STATUSES,
} from "../models/MpesaCallbackEvent.model.js";

import MpesaCallbackConflict from "../models/MpesaCallbackConflict.model.js";

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
 * COMPARE CALLBACK
 * ============================================================
 */

const detectConflict = (
  existing,
  incoming
) => {
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

    if (!reason) {
      return {
        accepted: true,
        duplicate: true,
        reason: "CALLBACK_ALREADY_STORED",
      };
    }

    /**
     * Persist conflicting callback evidence.
     */

    await MpesaCallbackConflict.create({
      callbackEventId:
        stored._id,

      checkoutRequestId:
        callback.checkoutRequestId,

      merchantRequestId:
        callback.merchantRequestId,

      originalResultCode:
        stored.resultCode,

      conflictingResultCode:
        callback.resultCode,

      reason,
    });

    /**
     * Escalate to manual review.
     *
     * Do not modify payment state.
     */

    await MpesaCallbackEvent.updateOne(
      {
        _id: stored._id,
      },
      {
        $set: {
          hasConflict: true,

          lastConflictAt:
            new Date(),

          lastConflictReason:
            reason,

          status:
            MPESA_CALLBACK_EVENT_STATUSES.MANUAL_REVIEW,

          manualReviewRequiredAt:
            new Date(),

          manualReviewReason:
            "CONFLICTING_CALLBACK_DELIVERY",

          nextAttemptAt: null,

          leaseOwner: null,

          leaseExpiresAt: null,
        },

        $inc: {
          conflictCount: 1,
          __v: 1,
        },
      }
    );

    return {
      accepted: true,
      duplicate: true,
      conflict: true,
      reason: "CALLBACK_CONFLICT_RECORDED",
    };
  };