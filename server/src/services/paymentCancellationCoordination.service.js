import mongoose from "mongoose";

import SubscriberSubscription, {
  SUBSCRIPTION_STATUSES,
} from "../models/SubscriberSubscription.model.js";

import PaymentDispatchCoordination, {
  DISPATCH_STATES,
} from "../models/PaymentDispatchCoordination.model.js";

import AppError from "../utils/AppError.js";

const IN_FLIGHT_STATES = [
  DISPATCH_STATES.AUTHORIZED,
  DISPATCH_STATES.DISPATCHING,
  DISPATCH_STATES.ACCEPTED,
  DISPATCH_STATES.UNKNOWN,
];

/**
 * Cancel a PENDING subscription while recording
 * unresolved payment dispatches.
 *
 * This function is only for PENDING subscriptions.
 * It must not replace existing ACTIVE subscription
 * cancellation or end-of-period cancellation logic.
 */
export const cancelPendingSubscriptionSafely = async ({
  subscriptionId,
  subscriberId,
}) => {
  const session = await mongoose.startSession();

  try {
    let result;

    await session.withTransaction(async () => {
      const subscription =
        await SubscriberSubscription.findOne({
          _id: subscriptionId,
          subscriberId,
          status: SUBSCRIPTION_STATUSES.PENDING,
        }).session(session);

      if (!subscription) {
        throw new AppError(
          "Pending subscription not found.",
          404,
          "PENDING_SUBSCRIPTION_NOT_FOUND"
        );
      }

      const cancellationTime = new Date();

      const updated =
        await SubscriberSubscription.updateOne(
          {
            _id: subscriptionId,
            subscriberId,
            status: SUBSCRIPTION_STATUSES.PENDING,
          },
          {
            $set: {
              status: SUBSCRIPTION_STATUSES.CANCELED,
            },
            $inc: { __v: 1 },
          },
          { session }
        );

      if (updated.modifiedCount !== 1) {
        throw new AppError(
          "Subscription cancellation conflicted with another operation.",
          409,
          "SUBSCRIPTION_CANCELLATION_CONFLICT"
        );
      }

      /*
       * Prevent dispatches that have only
       * been authorized but have not started.
       */
      await PaymentDispatchCoordination.updateMany(
        {
          subscriptionId,
          state: DISPATCH_STATES.AUTHORIZED,
        },
        {
          $set: {
            state: DISPATCH_STATES.BLOCKED,
            cancellationRequestedAt: cancellationTime,
          },
        },
        { session }
      );

      /*
       * Already-started or accepted dispatches
       * may still produce a charge or callback.
       */
      await PaymentDispatchCoordination.updateMany(
        {
          subscriptionId,
          state: {
            $in: [
              DISPATCH_STATES.DISPATCHING,
              DISPATCH_STATES.ACCEPTED,
              DISPATCH_STATES.UNKNOWN,
            ],
          },
        },
        {
          $set: {
            cancellationRequestedAt: cancellationTime,
            requiresManualReview: true,
            manualReviewReason:
              "SUBSCRIPTION_CANCELED_WITH_PAYMENT_IN_FLIGHT",
          },
        },
        { session }
      );

      const unresolved =
        await PaymentDispatchCoordination.countDocuments({
          subscriptionId,
          state: { $in: IN_FLIGHT_STATES },
        }).session(session);

      result = {
        canceled: true,
        subscriptionId: subscriptionId.toString(),
        unresolvedPaymentDispatches: unresolved,
        requiresPaymentReview: unresolved > 0,
      };
    });

    return result;
  } finally {
    await session.endSession();
  }
};