import mongoose from "mongoose";

import PaymentTransaction from "../models/PaymentTransaction.model.js";

import {
  PAYMENT_PROVIDERS,
  PAYMENT_STATUSES,
  PAYMENT_VERIFICATION_STATUSES,
} from "../constants/payment.constants.js";

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
 * GET AUTHENTICATED PAYMENT STATUS
 * ============================================================
 *
 * GET /api/payments/mpesa/:paymentId/status
 *
 * Read-only endpoint.
 *
 * A user can only retrieve their own payment.
 *
 * This endpoint does not:
 *
 * - Query Safaricom
 * - Verify payment evidence
 * - Activate subscriptions
 * - Modify payment records
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
     * Validate MongoDB ObjectId.
     */
    if (!mongoose.isValidObjectId(paymentId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment ID.",
      });
    }

    /**
     * Retrieve only the authenticated
     * subscriber's M-Pesa payment.
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
     * Check the stored verified payment state.
     *
     * This is a read-only status check,
     * not independent financial verification.
     */
    const verified =
      payment.status ===
        PAYMENT_STATUSES.SUCCEEDED &&
      payment.verificationStatus ===
        PAYMENT_VERIFICATION_STATUSES.VERIFIED &&
      Boolean(payment.verifiedAt) &&
      Boolean(payment.paidAt);

    /**
     * Check whether the payment failed.
     *
     * Avoid assuming additional enum values
     * that may not exist in payment.constants.js.
     */
    const failed =
      payment.status ===
      PAYMENT_STATUSES.FAILED;

    /**
     * A payment can be verified without
     * its subscription entitlement
     * having been applied.
     */
    const entitlementApplied =
      verified &&
      Boolean(payment.entitlementAppliedAt);

    /**
     * Treat all other states as pending
     * from the frontend's perspective.
     */
    const pending =
      !verified && !failed;

    return res.status(200).json({
      success: true,

      data: {
        payment: {
          id: payment._id,

          subscriptionId:
            payment.subscriptionId,

          status:
            payment.status,

          verificationStatus:
            payment.verificationStatus,

          amountMinor:
            payment.amountMinor,

          currency:
            payment.currency,

          verified,

          pending,

          failed,

          entitlementApplied,

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