import mongoose from "mongoose";

import SubscriberSubscription, {
  SUBSCRIPTION_STATUSES,
} from "../models/SubscriberSubscription.model.js";

import PaymentDispatchCoordination, {
  DISPATCH_STATES,
} from "../models/PaymentDispatchCoordination.model.js";

import AppError from "../utils/AppError.js";

/**
 * ============================================================
 * PREMIUMCHAT — PAYMENT CANCELLATION COORDINATION
 * ============================================================
 *
 * MODULE 4.3.5.7.8.13.17.5
 *
 * PURPOSE:
 *
 * Safely cancel PENDING subscriptions while
 * coordinating outstanding M-Pesa dispatches.
 *
 * SECURITY:
 *
 * - Cancellation and dispatch authorization
 *   write to the same subscription document.
 *
 * - Settlement coordination must also write
 *   to the same subscription document.
 *
 * - Authorized but unstarted dispatches are
 *   blocked.
 *
 * - Already-started dispatches are flagged
 *   for financial review.
 *
 * - Canceled subscriptions cannot be
 *   automatically reactivated.
 *
 * - Cancellation does not imply that an
 *   in-flight M-Pesa charge was reversed.
 *
 * IMPORTANT:
 *
 * This service is only for PENDING subscriptions.
 *
 * Existing ACTIVE subscription cancellation
 * logic must remain separate.
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

const REVIEW_STATES = [
  DISPATCH_STATES.DISPATCHING,
  DISPATCH_STATES.ACCEPTED,
  DISPATCH_STATES.UNKNOWN,
];

/**
 * ============================================================
 * CANCEL PENDING SUBSCRIPTION SAFELY
 * ============================================================
 */

export const cancelPendingSubscriptionSafely =
  async ({
    subscriptionId,
    subscriberId,
  } = {}) => {
    if (
      !isValidId(subscriptionId) ||
      !isValidId(subscriberId)
    ) {
      fail(
        "Invalid subscription cancellation request.",
        "INVALID_CANCELLATION_REQUEST",
        400
      );
    }

    let result;

    await mongoose.connection.transaction(
      async (session) => {
        /**
         * STEP 1:
         * Load subscription.
         */

        const subscription =
          await SubscriberSubscription.findOne({
            _id: subscriptionId,

            subscriberId,

            status:
              SUBSCRIPTION_STATUSES.PENDING,
          }).session(session);

        if (!subscription) {
          fail(
            "Pending subscription not found.",
            "PENDING_SUBSCRIPTION_NOT_FOUND",
            404
          );
        }

        /**
         * STEP 2:
         * Record cancellation time.
         */

        const cancellationTime =
          new Date();

        /**
         * STEP 3:
         * Atomically cancel subscription.
         *
         * The version check protects against
         * concurrent subscription changes.
         */

        const updated =
          await SubscriberSubscription.updateOne(
            {
              _id:
                subscription._id,

              subscriberId,

              status:
                SUBSCRIPTION_STATUSES.PENDING,

              __v:
                subscription.__v,

              canceledAt:
                null,
            },
            {
              $set: {
                status:
                  SUBSCRIPTION_STATUSES.CANCELED,

                canceledAt:
                  cancellationTime,

                cancelAtPeriodEnd:
                  false,
              },

              $inc: {
                __v: 1,
              },
            },
            {
              session,
            }
          );

        if (
          updated.modifiedCount !== 1
        ) {
          fail(
            "Subscription changed during cancellation.",
            "SUBSCRIPTION_CANCELLATION_CONFLICT"
          );
        }

        /**
         * STEP 4:
         * Block authorized dispatches that
         * have not started.
         */

        await PaymentDispatchCoordination.updateMany(
          {
            subscriptionId:
              subscription._id,

            state:
              DISPATCH_STATES.AUTHORIZED,
          },
          {
            $set: {
              state:
                DISPATCH_STATES.BLOCKED,

              cancellationRequestedAt:
                cancellationTime,
            },
          },
          {
            session,
          }
        );

        /**
         * STEP 5:
         * Flag in-flight dispatches.
         *
         * These may still result in a charge.
         */

        await PaymentDispatchCoordination.updateMany(
          {
            subscriptionId:
              subscription._id,

            state: {
              $in:
                REVIEW_STATES,
            },
          },
          {
            $set: {
              cancellationRequestedAt:
                cancellationTime,

              requiresManualReview:
                true,

              manualReviewReason:
                "SUBSCRIPTION_CANCELED_WITH_PAYMENT_IN_FLIGHT",
            },
          },
          {
            session,
          }
        );

        /**
         * STEP 6:
         * Count dispatches requiring review.
         */

        const unresolved =
          await PaymentDispatchCoordination.countDocuments({
            subscriptionId:
              subscription._id,

            state: {
              $in:
                REVIEW_STATES,
            },
          }).session(session);

        /**
         * STEP 7:
         * Return cancellation result.
         */

        result = {
          canceled: true,

          subscriptionId:
            subscription._id.toString(),

          canceledAt:
            cancellationTime,

          unresolvedPaymentDispatches:
            unresolved,

          requiresPaymentReview:
            unresolved > 0,

          paymentReversed:
            false,

          subscriptionActivated:
            false,
        };
      }
    );

    return result;
  };

export default {
  cancelPendingSubscriptionSafely,
};