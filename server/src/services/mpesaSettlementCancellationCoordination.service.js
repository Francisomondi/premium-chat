import mongoose from "mongoose";

import SubscriberSubscription, {
  SUBSCRIPTION_STATUSES,
} from "../models/SubscriberSubscription.model.js";

import PaymentTransaction from "../models/PaymentTransaction.model.js";

import PaymentDispatchCoordination, {
  DISPATCH_STATES,
} from "../models/PaymentDispatchCoordination.model.js";

import MpesaFinancialVerification, {
  FINANCIAL_VERIFICATION_STATUSES,
} from "../models/MpesaFinancialVerification.model.js";

import {
  PAYMENT_PROVIDERS,
  PAYMENT_PURPOSES,
} from "../constants/payment.constants.js";

import AppError from "../utils/AppError.js";

/**
 * ============================================================
 * PREMIUMCHAT — SETTLEMENT CANCELLATION COORDINATION
 * ============================================================
 *
 * MODULE 4.3.5.7.8.13.17.5
 *
 * PURPOSE:
 *
 * Coordinate M-Pesa settlement eligibility
 * with subscription cancellation.
 *
 * SECURITY:
 *
 * - Settlement must not activate a canceled
 *   subscription.
 *
 * - Cancellation and settlement must use
 *   the same subscription write-conflict
 *   protocol.
 *
 * - In-flight payment dispatches are checked.
 *
 * - Existing financial review flags are
 *   preserved.
 *
 * - No payment success is assigned here.
 *
 * - No entitlement is granted here.
 */

const isValidId = (value) =>
  typeof value === "string" &&
  mongoose.isObjectIdOrHexString(value);

const sameId = (left, right) =>
  Boolean(left && right) &&
  left.toString() === right.toString();

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
 * INSPECT SETTLEMENT ELIGIBILITY
 * ============================================================
 *
 * Read-only inspection.
 *
 * This is not a reservation or authorization
 * to commit a settlement later.
 */

export const inspectSettlementCancellationSafety =
  async ({
    paymentId,
  } = {}) => {
    if (!isValidId(paymentId)) {
      fail(
        "Invalid payment identifier.",
        "INVALID_PAYMENT_ID",
        400
      );
    }

    const payment =
      await PaymentTransaction.findById(
        paymentId
      );

    if (!payment) {
      fail(
        "Payment not found.",
        "PAYMENT_NOT_FOUND",
        404
      );
    }

    if (
      payment.provider !==
        PAYMENT_PROVIDERS.MPESA ||
      payment.purpose !==
        PAYMENT_PURPOSES.SUBSCRIPTION_INITIAL
    ) {
      fail(
        "Unsupported payment for settlement coordination.",
        "UNSUPPORTED_SETTLEMENT_PAYMENT"
      );
    }

    const subscription =
      await SubscriberSubscription.findById(
        payment.subscriptionId
      );

    if (!subscription) {
      fail(
        "Subscription not found.",
        "SUBSCRIPTION_NOT_FOUND",
        404
      );
    }

    if (
      !sameId(
        payment.subscriptionId,
        subscription._id
      ) ||
      !sameId(
        payment.payerId,
        subscription.subscriberId
      ) ||
      !sameId(
        payment.creatorId,
        subscription.creatorId
      )
    ) {
      fail(
        "Payment and subscription ownership mismatch.",
        "PAYMENT_SUBSCRIPTION_MISMATCH"
      );
    }

    const dispatch =
      await PaymentDispatchCoordination.findOne({
        paymentId:
          payment._id,
      });

    const verification =
      await MpesaFinancialVerification.findOne({
        paymentId:
          payment._id,
      });

    const canceled =
      subscription.status ===
        SUBSCRIPTION_STATUSES.CANCELED ||
      Boolean(subscription.canceledAt);

    const suspended =
      subscription.status ===
        SUBSCRIPTION_STATUSES.SUSPENDED ||
      Boolean(subscription.suspendedAt);

    const pending =
      subscription.status ===
      SUBSCRIPTION_STATUSES.PENDING;

    const dispatchBlocked =
      dispatch?.state ===
      DISPATCH_STATES.BLOCKED;

    const dispatchRejected =
      dispatch?.state ===
      DISPATCH_STATES.REJECTED;

    const requiresManualReview =
      Boolean(
        dispatch?.requiresManualReview ||
        verification?.requiresManualReview ||
        verification?.status ===
          FINANCIAL_VERIFICATION_STATUSES.MANUAL_REVIEW
      );

    const eligible =
      pending &&
      !canceled &&
      !suspended &&
      !subscription.cancelAtPeriodEnd &&
      !dispatchBlocked &&
      !dispatchRejected &&
      !requiresManualReview;

    return {
      paymentId:
        payment._id.toString(),

      subscriptionId:
        subscription._id.toString(),

      eligible,

      subscriptionStatus:
        subscription.status,

      dispatchState:
        dispatch?.state || null,

      financialVerificationStatus:
        verification?.status || null,

      requiresManualReview,

      canceled,

      suspended,

      reason:
        eligible
          ? null
          : canceled
            ? "SUBSCRIPTION_CANCELED"
            : suspended
              ? "SUBSCRIPTION_SUSPENDED"
              : dispatchBlocked
                ? "PAYMENT_DISPATCH_BLOCKED"
                : dispatchRejected
                  ? "PAYMENT_DISPATCH_REJECTED"
                  : requiresManualReview
                    ? "FINANCIAL_REVIEW_REQUIRED"
                    : "SUBSCRIPTION_NOT_ELIGIBLE",
    };
  };

/**
 * ============================================================
 * CLAIM SETTLEMENT ELIGIBILITY
 * ============================================================
 *
 * Must be called inside an existing MongoDB
 * transaction.
 *
 * This writes to the subscription document
 * so concurrent cancellation transactions
 * cannot commit independently.
 *
 * IMPORTANT:
 *
 * This claim does not reserve eligibility
 * beyond the transaction that contains it.
 */

export const claimSettlementCancellationSafety =
  async ({
    payment,
    subscription,
    session,
  } = {}) => {
    if (
      !payment ||
      !subscription ||
      !session
    ) {
      fail(
        "Settlement coordination context is missing.",
        "SETTLEMENT_COORDINATION_CONTEXT_MISSING",
        500
      );
    }

    if (
      !sameId(
        payment.subscriptionId,
        subscription._id
      ) ||
      !sameId(
        payment.payerId,
        subscription.subscriberId
      ) ||
      !sameId(
        payment.creatorId,
        subscription.creatorId
      )
    ) {
      fail(
        "Payment and subscription ownership mismatch.",
        "PAYMENT_SUBSCRIPTION_MISMATCH"
      );
    }

    const dispatch =
      await PaymentDispatchCoordination.findOne({
        paymentId:
          payment._id,
      }).session(session);

    if (
      !dispatch ||
      !sameId(
        dispatch.subscriptionId,
        subscription._id
      )
    ) {
      fail(
        "Payment dispatch coordination record is missing.",
        "PAYMENT_DISPATCH_COORDINATION_MISSING"
      );
    }

    if (
      dispatch.state !==
        DISPATCH_STATES.ACCEPTED &&
      dispatch.state !==
        DISPATCH_STATES.UNKNOWN
    ) {
      fail(
        "Payment dispatch is not eligible for settlement.",
        "PAYMENT_DISPATCH_NOT_SETTLEMENT_ELIGIBLE"
      );
    }

    if (
      dispatch.requiresManualReview ||
      dispatch.cancellationRequestedAt
    ) {
      fail(
        "Payment dispatch requires financial review.",
        "PAYMENT_DISPATCH_REVIEW_REQUIRED"
      );
    }

    if (
      subscription.status !==
        SUBSCRIPTION_STATUSES.PENDING ||
      subscription.canceledAt ||
      subscription.cancelAtPeriodEnd ||
      subscription.suspendedAt
    ) {
      fail(
        "Subscription is not eligible for settlement.",
        "SUBSCRIPTION_NOT_SETTLEMENT_ELIGIBLE"
      );
    }

    /**
     * Force a write to the subscription document.
     *
     * This conflicts with concurrent cancellation
     * transactions using the same document.
     */

    const result =
      await SubscriberSubscription.updateOne(
        {
          _id:
            subscription._id,

          __v:
            subscription.__v,

          status:
            SUBSCRIPTION_STATUSES.PENDING,

          canceledAt:
            null,

          cancelAtPeriodEnd:
            false,

          suspendedAt:
            null,
        },
        {
          $inc: {
            __v: 1,
          },
        },
        {
          session,
        }
      );

    if (
      result.modifiedCount !== 1
    ) {
      fail(
        "Subscription changed during settlement coordination.",
        "SETTLEMENT_CANCELLATION_CONFLICT"
      );
    }

    return {
      claimed: true,

      paymentId:
        payment._id.toString(),

      subscriptionId:
        subscription._id.toString(),
    };
  };

export default {
  inspectSettlementCancellationSafety,
  claimSettlementCancellationSafety,
};