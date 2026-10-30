import mongoose from "mongoose";

import PaymentTransaction from "../models/PaymentTransaction.model.js";

import {
  PAYMENT_PROVIDERS,
  PAYMENT_STATUSES,
  PAYMENT_VERIFICATION_STATUSES,
} from "../constants/payment.constants.js";

import MpesaCallbackEvent, {
  MPESA_CALLBACK_EVENT_STATUSES,
} from "../models/MpesaCallbackEvent.model.js";

import {
  verifyPaymentTransaction,
} from "../services/paymentVerification.service.js";
import {
  initiateSubscriptionMpesaPayment,
} from "../services/mpesaPaymentInitiation.service.js";

/**
 * ============================================================
 * PREMIUMCHAT — M-PESA PAYMENT CONTROLLER
 * ============================================================
 *
 * MODULE 4.3.5.7.8.13.18
 *
 * Responsibilities:
 *
 * 1. Initiate subscription M-Pesa payments.
 * 2. Retrieve authenticated payment status.
 *
 * SECURITY:
 *
 * - Authentication required at route level.
 * - Payment ownership comes from req.auth.userId.
 * - Payment amount is never client-controlled.
 * - No direct payment confirmation.
 * - No subscription activation.
 * - No trusted financial evidence is exposed.
 */

/**
 * ============================================================
 * INITIATE SUBSCRIPTION M-PESA PAYMENT
 * ============================================================
 *
 * POST /api/payments/mpesa/stk-push
 */

export const initiateMySubscriptionMpesaPayment =
  async (req, res, next) => {
    try {
      const subscriberId = req.auth.userId;

      const {
        subscriptionId,
        phoneNumber,
        clientRequestId,
      } = req.body || {};

      const result =
        await initiateSubscriptionMpesaPayment({
          subscriberId,
          subscriptionId,
          phoneNumber,
          clientRequestId,
        });

      return res.status(
        result.created ? 202 : 200
      ).json({
        success: true,

        message:
          "Payment request recorded. Awaiting payment confirmation.",

        data: result,
      });
    } catch (error) {
      return next(error);
    }
  };

/**
 * ============================================================
 * GET AUTHENTICATED M-PESA PAYMENT STATUS
 * ============================================================
 *
 * GET /api/payments/mpesa/:paymentId/status
 *
 * STEP 19.8.17
 *
 * SECURITY:
 *
 * - Authentication required.
 * - Payment ownership enforced.
 * - Read-only.
 * - No direct provider queries.
 * - No payment verification writes.
 * - No subscription activation.
 * - No sensitive settlement evidence exposed.
 */

export const getMyMpesaPaymentStatus = async (
  req,
  res,
  next
) => {
  try {
    const payerId = req.auth.userId;
    const { paymentId } = req.params;

    /**
     * STEP 1 — VALIDATE PAYMENT ID
     */

    if (
      typeof paymentId !== "string" ||
      !mongoose.isObjectIdOrHexString(paymentId)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment ID.",
      });
    }

    /**
     * STEP 2 — ENFORCE PAYMENT OWNERSHIP
     */

    const payment =
      await PaymentTransaction.findOne({
        _id: paymentId,
        payerId,
        provider: PAYMENT_PROVIDERS.MPESA,
      })
        .select(
          [
            "_id",
            "subscriptionId",
            "status",
            "verificationStatus",
            "amountMinor",
            "currency",
            "providerTransactionId",
            "createdAt",
            "updatedAt",
            "paidAt",
            "verifiedAt",
            "entitlementAppliedAt",
          ].join(" ")
        )
        .lean();

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found.",
      });
    }

    /**
     * STEP 3 — INSPECT CALLBACK RECONCILIATION
     *
     * Callback status is informational.
     *
     * It cannot independently verify payment.
     */

    const callbackEvent =
      payment.providerTransactionId
        ? await MpesaCallbackEvent.findOne({
            paymentId: payment._id,

            checkoutRequestId:
              payment.providerTransactionId,
          })
            .select(
              [
                "status",
                "hasConflict",
                "manualReviewRequiredAt",
                "reconciledAt",
              ].join(" ")
            )
            .lean()
        : null;

    /**
     * STEP 4 — INSPECT FINANCIAL VERIFICATION
     *
     * Only invoke the verification service when
     * the payment already claims verified state.
     *
     * This avoids unnecessary verification queries
     * for ordinary pending payments.
     */

    const claimsVerified =
      payment.status ===
        PAYMENT_STATUSES.SUCCEEDED &&
      payment.verificationStatus ===
        PAYMENT_VERIFICATION_STATUSES.VERIFIED &&
      Boolean(payment.verifiedAt) &&
      Boolean(payment.paidAt);

    let verified = false;

    if (claimsVerified) {
      const verification =
        await verifyPaymentTransaction({
          paymentId:
            payment._id.toString(),
        });

      verified =
        verification.verified === true;
    }

    /**
     * STEP 5 — DERIVE USER-FACING STATUS
     *
     * These are response statuses, not new
     * PaymentTransaction enum values.
     */

    const manualReviewRequired =
      callbackEvent?.hasConflict === true ||
      Boolean(
        callbackEvent?.manualReviewRequiredAt
      ) ||
      callbackEvent?.status ===
        MPESA_CALLBACK_EVENT_STATUSES.MANUAL_REVIEW;

    const checkoutReconciled =
      callbackEvent?.status ===
        MPESA_CALLBACK_EVENT_STATUSES.RECONCILED;

    const storedPaymentFailed =
      payment.status ===
      PAYMENT_STATUSES.FAILED;

    const entitlementApplied =
      verified &&
      Boolean(
        payment.entitlementAppliedAt
      );

    let paymentStage = "PENDING_CHECKOUT";

    if (manualReviewRequired) {
      paymentStage =
        "MANUAL_REVIEW_REQUIRED";
    } else if (
      claimsVerified &&
      !verified
    ) {
      paymentStage =
        "VERIFICATION_INCONSISTENT";
    } else if (verified) {
      paymentStage =
        entitlementApplied
          ? "SUBSCRIPTION_ACTIVATED"
          : "PAYMENT_VERIFIED";
    } else if (storedPaymentFailed) {
      paymentStage =
        "CHECKOUT_FAILED";
    } else if (checkoutReconciled) {
      paymentStage =
        "AWAITING_FINANCIAL_VERIFICATION";
    }

    /**
     * STEP 6 — RETURN SAFE RESPONSE
     */

    const pending = [
      "PENDING_CHECKOUT",
      "AWAITING_FINANCIAL_VERIFICATION",
    ].includes(paymentStage);

    const failed =
      paymentStage ===
      "CHECKOUT_FAILED";

    return res.status(200).json({
      success: true,

      data: {
        payment: {
          id:
            payment._id.toString(),

          subscriptionId:
            payment.subscriptionId?.toString() ||
            null,

          status:
            payment.status,

          verificationStatus:
            payment.verificationStatus,

          paymentStage,

          amountMinor:
            payment.amountMinor,

          currency:
            payment.currency,

          verified,

          pending,

          failed,

          entitlementApplied,

          checkoutReconciled,

          manualReviewRequired,

          createdAt:
            payment.createdAt,

          updatedAt:
            payment.updatedAt,
        },
      },
    });
  } catch (error) {
    return next(error);
  }
};