import mongoose from "mongoose";

import PaymentTransaction from "../models/PaymentTransaction.model.js";

import MpesaCallbackEvent, {
  MPESA_CALLBACK_EVENT_STATUSES,
} from "../models/MpesaCallbackEvent.model.js";

import {
  PAYMENT_PROVIDERS,
} from "../constants/payment.constants.js";

import {
  queryMpesaStkPayment,
  STK_QUERY_STATUSES,
} from "../payments/mpesa/mpesaStkQuery.adapter.js";

/**
 * ============================================================
 * PREMIUMCHAT — DARAJA STK RECONCILIATION SERVICE
 * ============================================================
 *
 * STEP 19.8.14
 *
 * Responsibilities:
 *
 * - Reconcile stored callbacks with STK Query results.
 * - Validate payment and callback identity.
 * - Detect inconsistent provider outcomes.
 * - Preserve conflicting evidence.
 * - Support safe retries.
 * - Never activate subscriptions.
 * - Never mark payments financially verified.
 *
 * SECURITY:
 *
 * Callback claims remain untrusted.
 *
 * A successful STK Query confirms the reported
 * checkout outcome, not the independent
 * authenticity of callback financial metadata.
 */

const {
  RECEIVED,
  PROCESSING,
  RETRY_SCHEDULED,
  RECONCILED,
  UNRESOLVED,
  MANUAL_REVIEW,
} = MPESA_CALLBACK_EVENT_STATUSES;

const validId = (value) =>
  typeof value === "string" &&
  mongoose.isObjectIdOrHexString(value);

const validString = (value) =>
  typeof value === "string" &&
  value.trim().length > 0;

const sameId = (left, right) =>
  Boolean(left && right) &&
  left.toString() === right.toString();

const result = ({
  reconciled = false,
  reason,
  paymentId = null,
  callbackEventId = null,
  requiresManualReview = false,
}) => ({
  reconciled,
  reason,
  paymentId,
  callbackEventId,
  requiresManualReview,
});

/**
 * ============================================================
 * RECONCILE ONE CALLBACK EVENT
 * ============================================================
 *
 * The caller must supply an existing event ID.
 *
 * This service claims the event before querying
 * Safaricom to avoid concurrent processing.
 */

export const reconcileMpesaStkCallback = async ({
  callbackEventId,
} = {}) => {
  if (!validId(callbackEventId)) {
    return result({
      reason: "INVALID_CALLBACK_EVENT_ID",
    });
  }

  const now = new Date();

    const configuredMaxAttempts = Number(
    process.env.MPESA_STK_WORKER_MAX_ATTEMPTS
    );

    const maxAttempts =
    Number.isSafeInteger(configuredMaxAttempts) &&
    configuredMaxAttempts >= 1 &&
    configuredMaxAttempts <= 100
        ? configuredMaxAttempts
        : 12;

  const leaseOwner = new mongoose.Types.ObjectId()
    .toString();

  const leaseExpiresAt = new Date(
    now.getTime() + 60_000
  );

  /**
   * STEP 1 — CLAIM EVENT
   */

const event =
  await MpesaCallbackEvent.findOneAndUpdate(
    {
      _id: callbackEventId,

      hasConflict: false,

      manualReviewRequiredAt: null,

      attemptCount: {
        $lt: maxAttempts,
        },

      $or: [
        {
          status: {
            $in: [
              RECEIVED,
              RETRY_SCHEDULED,
              UNRESOLVED,
            ],
          },

          $and: [
            {
              $or: [
                { leaseExpiresAt: null },
                { leaseExpiresAt: { $lte: now } },
              ],
            },
            {
              $or: [
                { nextAttemptAt: null },
                { nextAttemptAt: { $lte: now } },
              ],
            },
          ],
        },

        {
          status: PROCESSING,

          leaseExpiresAt: {
            $lte: now,
          },
        },
      ],
    },
    {
      $set: {
        status: PROCESSING,

        leaseOwner,

        leaseExpiresAt,

        reconciliationAttemptedAt: now,

        nextAttemptAt: null,
      },

      $inc: {
        attemptCount: 1,
      },
    },
    {
      new: true,
    }
  );

  if (!event) {
    return result({
      reason:
        "CALLBACK_NOT_AVAILABLE_FOR_RECONCILIATION",
      callbackEventId,
    });
  }

  const paymentId =
    event.paymentId?.toString() || null;

  /**
   * STEP 2 — FINALIZE USING LEASE TOKEN
   */

  const finalize = async ({
    status,
    reason,
    reconciled = false,
    requiresManualReview = false,
    retry = false,
  }) => {
    const completedAt = new Date();

    const nextAttemptAt = retry
      ? new Date(
          completedAt.getTime() +
            Math.min(
              60_000 * 2 ** Math.min(
                event.attemptCount,
                6
              ),
              3_600_000
            )
        )
      : null;

    const update =
      await MpesaCallbackEvent.updateOne(
        {
        _id: event._id,

        status: PROCESSING,

        leaseOwner,

        leaseExpiresAt: {
            $gt: completedAt,
        },

        hasConflict: false,

        manualReviewRequiredAt: null,
        },
        {
          $set: {
            status,

            leaseOwner: null,

            leaseExpiresAt: null,

            nextAttemptAt,

            lastErrorCode: reason,

            reconciledAt: reconciled
              ? completedAt
              : null,

            manualReviewRequiredAt:
              requiresManualReview
                ? completedAt
                : null,

            manualReviewReason:
              requiresManualReview
                ? reason
                : null,
          },
        }
      );

    if (update.modifiedCount !== 1) {
      return result({
        reason:
          "RECONCILIATION_LEASE_LOST",

        paymentId,

        callbackEventId,

        requiresManualReview: true,
      });
    }

    return result({
      reconciled,
      reason,
      paymentId,
      callbackEventId,
      requiresManualReview,
    });
  };

  try {
    /**
     * STEP 3 — LOAD ORIGINAL PAYMENT
     */

    if (!paymentId) {
      return finalize({
        status: MANUAL_REVIEW,
        reason: "CALLBACK_PAYMENT_REFERENCE_MISSING",
        requiresManualReview: true,
      });
    }

    const payment =
      await PaymentTransaction.findById(paymentId);

    if (!payment) {
      return finalize({
        status: MANUAL_REVIEW,
        reason: "PAYMENT_NOT_FOUND",
        requiresManualReview: true,
      });
    }

    /**
     * STEP 4 — VALIDATE PAYMENT IDENTITY
     */

    if (
      payment.provider !== PAYMENT_PROVIDERS.MPESA ||
      !sameId(event.paymentId, payment._id) ||
      payment.providerTransactionId !==
        event.checkoutRequestId ||
      payment.merchantRequestId !==
        event.merchantRequestId
    ) {
      return finalize({
        status: MANUAL_REVIEW,
        reason: "PAYMENT_CALLBACK_IDENTITY_MISMATCH",
        requiresManualReview: true,
      });
    }

    /**
     * STEP 5 — QUERY SAFARICOM
     */

    const query =
      await queryMpesaStkPayment({
        checkoutRequestId:
          event.checkoutRequestId,
      });

    if (
      query.status ===
        STK_QUERY_STATUSES.UNAVAILABLE ||
      query.status ===
        STK_QUERY_STATUSES.PENDING ||
      query.status ===
        STK_QUERY_STATUSES.INCONCLUSIVE
    ) {
      return finalize({
        status: RETRY_SCHEDULED,

        reason:
          query.reason ||
          "STK_QUERY_INCONCLUSIVE",

        retry: true,
      });
    }

    /**
     * STEP 6 — VALIDATE SUCCESS OUTCOME
     */

    if (
      query.status ===
        STK_QUERY_STATUSES.SUCCESS
    ) {
      if (
        query.authenticatedQuery !== true ||
        query.checkoutRequestId !==
          event.checkoutRequestId ||
        String(query.resultCode) !== "0" ||
        event.resultCode !== 0
      ) {
        return finalize({
          status: MANUAL_REVIEW,

          reason:
            "STK_QUERY_CALLBACK_RESULT_CONFLICT",

          requiresManualReview: true,
        });
      }

      /**
       * STEP 7 — VALIDATE CALLBACK CLAIMS
       *
       * These checks establish consistency,
       * not independent financial authenticity.
       */

      if (
        !validString(event.reportedReceipt) ||
        !Number.isSafeInteger(
          event.reportedAmountMinor
        ) ||
        event.reportedAmountMinor !==
          payment.amountMinor
      ) {
        return finalize({
          status: MANUAL_REVIEW,

          reason:
            "CALLBACK_FINANCIAL_DETAILS_INVALID",

          requiresManualReview: true,
        });
      }

      /**
       * STEP 8 — RECORD RECONCILIATION
       *
       * RECONCILED means that the checkout
       * result and stored callback agree.
       *
       * It does not mean that independent
       * financial verification is complete.
       */

      return finalize({
        status: RECONCILED,

        reason:
          "STK_CHECKOUT_RESULT_RECONCILED",

        reconciled: true,
      });
    }

/**
 * ============================================================
 * STEP 9 — HANDLE FAILED CHECKOUT
 * ============================================================
 *
 * A confirmed unsuccessful checkout does not
 * establish a successful payment.
 *
 * We retain the callback event for inspection.
 *
 * A matching failed callback is marked
 * UNRESOLVED and sent for manual review.
 *
 * We do not:
 *
 * - Mark payment SUCCEEDED.
 * - Mark payment VERIFIED.
 * - Activate a subscription.
 */

if (
  query.status ===
  STK_QUERY_STATUSES.FAILED
) {
  if (
    query.authenticatedQuery !== true ||
    query.checkoutRequestId !==
      event.checkoutRequestId
  ) {
    return finalize({
      status: MANUAL_REVIEW,

      reason:
        "STK_QUERY_IDENTITY_MISMATCH",

      requiresManualReview: true,
    });
  }

  if (event.resultCode === 0) {
    return finalize({
      status: MANUAL_REVIEW,

      reason:
        "CALLBACK_SUCCESS_QUERY_FAILURE_CONFLICT",

      requiresManualReview: true,
    });
  }

  return finalize({
    status: MANUAL_REVIEW,

    reason:
      "STK_CHECKOUT_NOT_SUCCESSFUL",

    requiresManualReview: true,
  });
}

    return finalize({
      status: RETRY_SCHEDULED,

      reason:
        "UNKNOWN_STK_QUERY_RESULT",

      retry: true,
    });
  } catch (error) {
  console.error(
    "[M-Pesa STK Reconciliation] Processing failed:",
    {
      callbackEventId,

      paymentId,

      message:
        error instanceof Error
          ? error.message
          : "Unknown error",
    }
  );

  try {
    return await finalize({
      status: RETRY_SCHEDULED,

      reason:
        "STK_RECONCILIATION_ERROR",

      retry: true,
    });
  } catch (finalizeError) {
    console.error(
      "[M-Pesa STK Reconciliation] Finalization failed:",
      {
        callbackEventId,

        message:
          finalizeError instanceof Error
            ? finalizeError.message
            : "Unknown error",
      }
    );

    return result({
      reconciled: false,

      reason:
        "RECONCILIATION_FINALIZATION_FAILED",

      paymentId,

      callbackEventId,

      requiresManualReview: false,
    });
  }
}
};

export default {
  reconcileMpesaStkCallback,
};