import mongoose from "mongoose";

import SubscriberSubscription, {
  SUBSCRIPTION_STATUSES,
} from "../models/SubscriberSubscription.model.js";

import PaymentTransaction from "../models/PaymentTransaction.model.js";

import PaymentDispatchCoordination, {
  DISPATCH_STATES,
} from "../models/PaymentDispatchCoordination.model.js";

import {
  PAYMENT_STATUSES,
  PAYMENT_INITIATION_STATUSES,
} from "../constants/payment.constants.js";

import AppError from "../utils/AppError.js";

/**
 * Atomically authorize payment dispatch.
 *
 * All cancellation paths must use the same
 * subscription-document coordination protocol.
 */
export const authorizePaymentDispatch = async ({
  paymentId,
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
        }).session(session);

      if (
        !subscription ||
        subscription.status !==
          SUBSCRIPTION_STATUSES.PENDING
      ) {
        throw new AppError(
          "Subscription is no longer eligible for payment.",
          409,
          "SUBSCRIPTION_NOT_PENDING"
        );
      }

      /*
       * Force a write to the subscription document.
       * A competing cancellation transaction that
       * writes the same document will conflict.
       */
      const subscriptionWrite =
        await SubscriberSubscription.updateOne(
          {
            _id: subscription._id,
            subscriberId,
            status: SUBSCRIPTION_STATUSES.PENDING,
          },
          {
            $inc: {
              __v: 1,
            },
          },
          { session }
        );

      if (subscriptionWrite.modifiedCount !== 1) {
        throw new AppError(
          "Subscription state changed during authorization.",
          409,
          "SUBSCRIPTION_STATE_CONFLICT"
        );
      }

      const payment =
        await PaymentTransaction.findOne({
          _id: paymentId,
          subscriptionId,
          payerId: subscriberId,
          status: PAYMENT_STATUSES.PENDING,
          initiationStatus:
            PAYMENT_INITIATION_STATUSES.RESERVED,
        }).session(session);

      if (!payment) {
        throw new AppError(
          "Payment is not available for dispatch.",
          409,
          "PAYMENT_NOT_RESERVED"
        );
      }

      await PaymentDispatchCoordination.create(
        [
          {
            subscriptionId,
            paymentId,
            state: DISPATCH_STATES.AUTHORIZED,
            authorizedAt: new Date(),
          },
        ],
        { session }
      );

      const claimed =
        await PaymentTransaction.updateOne(
          {
            _id: paymentId,
            status: PAYMENT_STATUSES.PENDING,
            initiationStatus:
              PAYMENT_INITIATION_STATUSES.RESERVED,
          },
          {
            $set: {
              status: PAYMENT_STATUSES.PROCESSING,
              initiationStatus:
                PAYMENT_INITIATION_STATUSES.DISPATCHING,
              initiationClaimedAt: new Date(),
            },
            $inc: { __v: 1 },
          },
          { session }
        );

      if (claimed.modifiedCount !== 1) {
        throw new AppError(
          "Payment dispatch could not be claimed.",
          409,
          "PAYMENT_DISPATCH_CONFLICT"
        );
      }

      result = {
        authorized: true,
        paymentId: paymentId.toString(),
      };
    });

    return result;
  } finally {
    await session.endSession();
  }
};

/**
 * Mark a dispatch as started.
 *
 * This must happen before the external HTTP request.
 */
export const markPaymentDispatchStarted = async ({
  paymentId,
}) => {
  const result =
    await PaymentDispatchCoordination.findOneAndUpdate(
      {
        paymentId,
        state: DISPATCH_STATES.AUTHORIZED,
      },
      {
        $set: {
          state: DISPATCH_STATES.DISPATCHING,
          dispatchStartedAt: new Date(),
        },
      },
      { new: true }
    );

  if (!result) {
    throw new AppError(
      "Payment dispatch authorization is unavailable.",
      409,
      "PAYMENT_DISPATCH_NOT_AUTHORIZED"
    );
  }

  return result;
};

/**
 * Record the final initiation outcome.
 *
 * This does not verify settlement.
 */
export const recordPaymentDispatchOutcome = async ({
  paymentId,
  state,
}) => {
  const allowed = [
    DISPATCH_STATES.ACCEPTED,
    DISPATCH_STATES.UNKNOWN,
    DISPATCH_STATES.REJECTED,
  ];

  if (!allowed.includes(state)) {
    throw new AppError(
      "Invalid payment dispatch outcome.",
      400,
      "INVALID_DISPATCH_OUTCOME"
    );
  }

  return PaymentDispatchCoordination.findOneAndUpdate(
    {
      paymentId,
      state: DISPATCH_STATES.DISPATCHING,
    },
    {
      $set: {
        state,
        dispatchCompletedAt: new Date(),
      },
    },
    { new: true }
  );
};