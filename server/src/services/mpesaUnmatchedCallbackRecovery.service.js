import mongoose from "mongoose";

import PaymentTransaction from "../models/PaymentTransaction.model.js";

import MpesaUnmatchedCallback, {
  MPESA_QUARANTINE_STATUSES,
} from "../models/MpesaUnmatchedCallback.model.js";

import {
  PAYMENT_PROVIDERS,
} from "../constants/payment.constants.js";

import {
  ingestMpesaCallback,
} from "./mpesaCallback.service.js";

import AppError from "../utils/AppError.js";

/**
 * ============================================================
 * PREMIUMCHAT — UNMATCHED CALLBACK RECOVERY
 * ============================================================
 *
 * MODULE 4.3.5.7.8.13.17.6.5
 *
 * RESPONSIBILITIES:
 *
 * - Recover one specific unmatched callback.
 * - Preserve existing batch recovery.
 * - Require exact provider identifier matching.
 * - Prevent conflicting callbacks from recovery.
 * - Prevent duplicate recovery.
 *
 * SECURITY:
 *
 * - Recovered callbacks remain untrusted.
 * - No financial settlement verification.
 * - No payment success assignment.
 * - No subscription activation.
 * - No premium content authorization.
 */

const isValidId = (value) =>
  typeof value === "string" &&
  mongoose.isObjectIdOrHexString(value);

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
 * RECOVER EXACT UNMATCHED CALLBACK
 * ============================================================
 */

export const recoverUnmatchedMpesaCallback =
  async ({
    callbackId,
  } = {}) => {
    if (!isValidId(callbackId)) {
      fail(
        "Invalid unmatched callback identifier.",
        "INVALID_UNMATCHED_CALLBACK_ID",
        400
      );
    }

    /**
     * STEP 1:
     * Load the exact callback.
     */

    const callback =
      await MpesaUnmatchedCallback.findById(
        callbackId
      );

    if (!callback) {
      fail(
        "Unmatched callback not found.",
        "UNMATCHED_CALLBACK_NOT_FOUND",
        404
      );
    }

    /**
     * STEP 2:
     * Handle previously recovered callbacks.
     */

    if (
      callback.status ===
      MPESA_QUARANTINE_STATUSES.MATCHED
    ) {
      if (!callback.matchedPaymentId) {
        fail(
          "Matched callback has no payment reference.",
          "MATCHED_CALLBACK_STATE_INVALID"
        );
      }

      return {
        recovered: true,
        alreadyRecovered: true,

        callbackId:
          callback._id.toString(),

        paymentId:
          callback.matchedPaymentId.toString(),
      };
    }

    /**
     * STEP 3:
     * Require a recoverable quarantine state.
     */

    if (
      callback.status !==
        MPESA_QUARANTINE_STATUSES.QUARANTINED ||
      callback.conflictDetected
    ) {
      fail(
        "Callback is not eligible for recovery.",
        "CALLBACK_NOT_RECOVERABLE"
      );
    }

    /**
     * STEP 4:
     * Find payment using exact provider IDs.
     */

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
      return {
        recovered: false,

        reason:
          "MATCHING_PAYMENT_NOT_FOUND",

        callbackId:
          callback._id.toString(),
      };
    }

    /**
     * STEP 5:
     * Reconstruct the callback envelope.
     *
     * This does not make callback metadata
     * authoritative financial evidence.
     */

    const callbackMetadata = [];

    if (
      callback.reportedAmountMinor != null
    ) {
      callbackMetadata.push({
        Name: "Amount",

        Value:
          callback.reportedAmountMinor / 100,
      });
    }

    if (callback.reportedReceipt) {
      callbackMetadata.push({
        Name: "MpesaReceiptNumber",

        Value:
          callback.reportedReceipt,
      });
    }

    const payload = {
      Body: {
        stkCallback: {
          MerchantRequestID:
            callback.merchantRequestId,

          CheckoutRequestID:
            callback.checkoutRequestId,

          ResultCode:
            callback.resultCode,

          ResultDesc:
            "Recovered quarantined callback",

          CallbackMetadata: {
            Item: callbackMetadata,
          },
        },
      },
    };

    /**
     * STEP 6:
     * Reuse the existing callback ingestion.
     *
     * No payment is marked successful here.
     */

    const result =
      await ingestMpesaCallback(payload);

    if (
      !result?.accepted ||
      result?.conflict
    ) {
      return {
        recovered: false,

        reason:
          "CALLBACK_INGESTION_NOT_ACCEPTED",

        callbackId:
          callback._id.toString(),
      };
    }

    /**
     * STEP 7:
     * Atomically mark this exact callback
     * as matched.
     */

    const updated =
      await MpesaUnmatchedCallback.findOneAndUpdate(
        {
          _id:
            callback._id,

          status:
            MPESA_QUARANTINE_STATUSES.QUARANTINED,

          conflictDetected:
            false,
        },
        {
          $set: {
            status:
              MPESA_QUARANTINE_STATUSES.MATCHED,

            matchedPaymentId:
              payment._id,

            matchedAt:
              new Date(),
          },
        },
        {
          new: true,
        }
      );

    if (!updated) {
      fail(
        "Callback recovery conflicted with another operation.",
        "CALLBACK_RECOVERY_CONFLICT"
      );
    }

    return {
      recovered: true,

      alreadyRecovered: false,

      callbackId:
        callback._id.toString(),

      paymentId:
        payment._id.toString(),
    };
  };

/**
 * ============================================================
 * RECOVER UNMATCHED CALLBACK BATCH
 * ============================================================
 *
 * Preserve existing batch recovery behavior.
 *
 * Each callback is processed by its exact ID.
 */

export const recoverUnmatchedMpesaCallbacks =
  async ({
    limit = 50,
  } = {}) => {
    const safeLimit =
      Number.isSafeInteger(limit) &&
      limit >= 1 &&
      limit <= 100
        ? limit
        : 50;

    const callbacks =
      await MpesaUnmatchedCallback.find({
        status:
          MPESA_QUARANTINE_STATUSES.QUARANTINED,

        conflictDetected:
          false,
      })
        .sort({
          firstReceivedAt: 1,
        })
        .limit(safeLimit);

    let matched = 0;
    let unmatched = 0;

    for (const callback of callbacks) {
      const result =
        await recoverUnmatchedMpesaCallback({
          callbackId:
            callback._id.toString(),
        });

      if (result.recovered) {
        matched++;
      } else {
        unmatched++;
      }
    }

    return {
      examined:
        callbacks.length,

      matched,

      unmatched,
    };
  };

export default {
  recoverUnmatchedMpesaCallback,
  recoverUnmatchedMpesaCallbacks,
};