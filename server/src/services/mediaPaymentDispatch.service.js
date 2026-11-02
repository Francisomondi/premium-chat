
import mongoose from "mongoose";

import MediaPurchase, {
  MEDIA_PURCHASE_STATUSES,
} from "../models/MediaPurchase.model.js";

import PaymentTransaction from "../models/PaymentTransaction.model.js";

import MediaPaymentDispatch, {
  MEDIA_DISPATCH_STATES,
} from "../models/MediaPaymentDispatch.model.js";

import {
  PAYMENT_PURPOSES,
  PAYMENT_STATUSES,
  PAYMENT_PROVIDERS,
  PAYMENT_VERIFICATION_STATUSES,
  PAYMENT_INITIATION_STATUSES,
} from "../constants/payment.constants.js";

import AppError from "../utils/AppError.js";

const isValidId = (value) =>
  mongoose.isObjectIdOrHexString(value);

/**
 * AUTHORIZE MEDIA PAYMENT DISPATCH
 *
 * Atomically:
 * 1. Validates the pending purchase.
 * 2. Validates its linked reserved payment.
 * 3. Creates the unique media dispatch record.
 * 4. Claims the payment for processing.
 *
 * No external provider request occurs here.
 */
export const authorizeMediaPaymentDispatch = async ({
  buyerId,
  purchaseId,
  paymentId,
}) => {
  if (
    !isValidId(buyerId) ||
    !isValidId(purchaseId) ||
    !isValidId(paymentId)
  ) {
    throw new AppError(
      "Invalid media payment dispatch identifiers.",
      400,
      "INVALID_MEDIA_DISPATCH_IDENTIFIERS"
    );
  }

  const session = await mongoose.startSession();

  try {
    let result;

    await session.withTransaction(async () => {
      const purchase = await MediaPurchase.findOne({
        _id: purchaseId,
        buyerId,
        paymentId,
        status: MEDIA_PURCHASE_STATUSES.PENDING,
      }).session(session);

      if (!purchase) {
        throw new AppError(
          "Pending media purchase with the linked payment was not found.",
          404,
          "MEDIA_PURCHASE_NOT_DISPATCHABLE"
        );
      }

      const existingDispatch =
        await MediaPaymentDispatch.findOne({
          mediaPurchaseId: purchase._id,
        }).session(session);

      if (existingDispatch) {
        if (
          existingDispatch.paymentId.toString() !== paymentId ||
          existingDispatch.buyerId.toString() !== buyerId
        ) {
          throw new AppError(
            "A conflicting dispatch already exists for this purchase.",
            409,
            "MEDIA_DISPATCH_CONFLICT"
          );
        }

        throw new AppError(
          "This media payment has already been authorized or attempted. Check its status before retrying.",
          409,
          "MEDIA_DISPATCH_ALREADY_EXISTS"
        );
      }

      const payment = await PaymentTransaction.findOne({
        _id: paymentId,
        payerId: buyerId,
        creatorId: purchase.creatorId,
        purpose: PAYMENT_PURPOSES.MEDIA_PURCHASE,
        subscriptionId: null,
        provider: PAYMENT_PROVIDERS.MPESA,
        amountMinor: purchase.amountMinor,
        currency: purchase.currency,
        status: PAYMENT_STATUSES.PENDING,
        verificationStatus:
          PAYMENT_VERIFICATION_STATUSES.UNVERIFIED,
        initiationStatus:
          PAYMENT_INITIATION_STATUSES.RESERVED,
      }).session(session);

      if (!payment) {
        throw new AppError(
          "Payment is not eligible for dispatch.",
          409,
          "MEDIA_PAYMENT_NOT_DISPATCHABLE"
        );
      }

      const now = new Date();

      await MediaPaymentDispatch.create(
        [
          {
            mediaPurchaseId: purchase._id,
            paymentId: payment._id,
            buyerId: purchase.buyerId,
            state: MEDIA_DISPATCH_STATES.AUTHORIZED,
            authorizedAt: now,
          },
        ],
        { session }
      );

      const paymentUpdate =
        await PaymentTransaction.updateOne(
          {
            _id: payment._id,
            status: PAYMENT_STATUSES.PENDING,
            verificationStatus:
              PAYMENT_VERIFICATION_STATUSES.UNVERIFIED,
            initiationStatus:
              PAYMENT_INITIATION_STATUSES.RESERVED,
          },
          {
            $set: {
              status: PAYMENT_STATUSES.PROCESSING,
              initiationStatus:
                PAYMENT_INITIATION_STATUSES.DISPATCHING,
              initiationClaimedAt: now,
            },
            $inc: {
              __v: 1,
            },
          },
          { session }
        );

      if (paymentUpdate.modifiedCount !== 1) {
        throw new AppError(
          "Payment was claimed by another process.",
          409,
          "MEDIA_PAYMENT_ALREADY_CLAIMED"
        );
      }

      result = {
        authorized: true,
        paymentId: payment._id.toString(),
        purchaseId: purchase._id.toString(),
      };
    });

    return result;
  } finally {
    await session.endSession();
  }
};

/**
 * MARK PROVIDER DISPATCH STARTED
 *
 * This must happen before the external M-Pesa request.
 */
export const markMediaPaymentDispatchStarted = async ({
  paymentId,
}) => {
  if (!isValidId(paymentId)) {
    throw new AppError(
      "Invalid payment identifier.",
      400,
      "INVALID_PAYMENT_ID"
    );
  }

  const session = await mongoose.startSession();

  try {
    let result;

    await session.withTransaction(async () => {
      const dispatch =
        await MediaPaymentDispatch.findOne({
          paymentId,
          state: MEDIA_DISPATCH_STATES.AUTHORIZED,
        }).session(session);

      if (!dispatch) {
        throw new AppError(
          "Media payment dispatch is not authorized.",
          409,
          "MEDIA_DISPATCH_NOT_AUTHORIZED"
        );
      }

      const now = new Date();

      const dispatchUpdate =
        await MediaPaymentDispatch.updateOne(
          {
            _id: dispatch._id,
            state: MEDIA_DISPATCH_STATES.AUTHORIZED,
          },
          {
            $set: {
              state: MEDIA_DISPATCH_STATES.DISPATCHING,
              dispatchStartedAt: now,
            },
          },
          { session }
        );

      if (dispatchUpdate.modifiedCount !== 1) {
        throw new AppError(
          "Media payment dispatch was already claimed.",
          409,
          "MEDIA_DISPATCH_ALREADY_STARTED"
        );
      }

      const paymentUpdate =
        await PaymentTransaction.updateOne(
          {
            _id: paymentId,
            status: PAYMENT_STATUSES.PROCESSING,
            initiationStatus:
              PAYMENT_INITIATION_STATUSES.DISPATCHING,
          },
          {
            $inc: {
              __v: 1,
            },
          },
          { session }
        );

      if (paymentUpdate.modifiedCount !== 1) {
        throw new AppError(
          "Payment is not in the expected dispatch state.",
          409,
          "MEDIA_PAYMENT_STATE_CONFLICT"
        );
      }

      result = {
        started: true,
        paymentId,
      };
    });

    return result;
  } finally {
    await session.endSession();
  }
};

/**
 * RECORD MEDIA PAYMENT DISPATCH OUTCOME
 *
 * ACCEPTED means Daraja accepted the STK request.
 * It does NOT mean the payment succeeded.
 */


export const recordMediaPaymentDispatchOutcome = async ({
  paymentId,
  state,
  requiresManualReview = false,
  manualReviewReason = null,
  checkoutRequestId = null,
  merchantRequestId = null,
}) => {
  if (!isValidId(paymentId)) {
    throw new AppError(
      "Invalid payment identifier.",
      400,
      "INVALID_PAYMENT_ID"
    );
  }

  const allowedStates = [
    MEDIA_DISPATCH_STATES.ACCEPTED,
    MEDIA_DISPATCH_STATES.UNKNOWN,
  ];

  if (!allowedStates.includes(state)) {
    throw new AppError(
      "Only ACCEPTED and UNKNOWN outcomes are supported by this initiation flow.",
      400,
      "INVALID_MEDIA_DISPATCH_OUTCOME"
    );
  }

  if (
    typeof requiresManualReview !== "boolean" ||
    (
      manualReviewReason !== null &&
      typeof manualReviewReason !== "string"
    )
  ) {
    throw new AppError(
      "Invalid manual review details.",
      400,
      "INVALID_MANUAL_REVIEW_DETAILS"
    );
  }

  if (state === MEDIA_DISPATCH_STATES.UNKNOWN) {
    if (
      requiresManualReview !== true ||
      typeof manualReviewReason !== "string" ||
      !manualReviewReason.trim()
    ) {
      throw new AppError(
        "Unknown dispatch outcomes require manual review and a reason.",
        400,
        "UNKNOWN_OUTCOME_REQUIRES_REVIEW"
      );
    }
  }

  if (state === MEDIA_DISPATCH_STATES.ACCEPTED) {
    if (
      requiresManualReview !== false ||
      manualReviewReason !== null
    ) {
      throw new AppError(
        "Accepted dispatches cannot carry unknown-outcome review details.",
        400,
        "INVALID_ACCEPTED_REVIEW_STATE"
      );
    }

    if (
      typeof checkoutRequestId !== "string" ||
      !checkoutRequestId.trim() ||
      checkoutRequestId.trim().length > 255 ||
      typeof merchantRequestId !== "string" ||
      !merchantRequestId.trim() ||
      merchantRequestId.trim().length > 255
    ) {
      throw new AppError(
        "Accepted M-Pesa dispatch requires valid provider identifiers.",
        400,
        "INVALID_MPESA_PROVIDER_IDENTIFIERS"
      );
    }
  }

  if (
    state === MEDIA_DISPATCH_STATES.UNKNOWN &&
    (checkoutRequestId !== null || merchantRequestId !== null)
  ) {
    throw new AppError(
      "Unknown dispatches cannot record provider identifiers through this flow.",
      400,
      "UNEXPECTED_MPESA_PROVIDER_IDENTIFIERS"
    );
  }

  const session = await mongoose.startSession();

  try {
    let result;

    await session.withTransaction(async () => {
      const dispatch = await MediaPaymentDispatch.findOne({
        paymentId,
        state: MEDIA_DISPATCH_STATES.DISPATCHING,
      }).session(session);

      if (!dispatch) {
        throw new AppError(
          "No active media payment dispatch was found.",
          409,
          "MEDIA_DISPATCH_NOT_IN_PROGRESS"
        );
      }

      const payment = await PaymentTransaction.findOne({
        _id: paymentId,
        payerId: dispatch.buyerId,
        purpose: PAYMENT_PURPOSES.MEDIA_PURCHASE,
        subscriptionId: null,
        provider: PAYMENT_PROVIDERS.MPESA,
        status: PAYMENT_STATUSES.PROCESSING,
        initiationStatus: PAYMENT_INITIATION_STATUSES.DISPATCHING,
        verificationStatus: PAYMENT_VERIFICATION_STATUSES.UNVERIFIED,
      }).session(session);

      if (!payment) {
        throw new AppError(
          "Payment is not in the expected initiation state.",
          409,
          "MEDIA_PAYMENT_STATE_CONFLICT"
        );
      }

      const now = new Date();

      const paymentInitiationStatus =
        state === MEDIA_DISPATCH_STATES.ACCEPTED
          ? PAYMENT_INITIATION_STATUSES.ACCEPTED
          : PAYMENT_INITIATION_STATUSES.UNKNOWN;

      const dispatchUpdate =
        await MediaPaymentDispatch.updateOne(
          {
            _id: dispatch._id,
            state: MEDIA_DISPATCH_STATES.DISPATCHING,
          },
          {
            $set: {
              state,
              dispatchCompletedAt: now,
              requiresManualReview,
              manualReviewReason:
                state === MEDIA_DISPATCH_STATES.UNKNOWN
                  ? manualReviewReason.trim()
                  : null,
            },
          },
          { session }
        );

      if (dispatchUpdate.modifiedCount !== 1) {
        throw new AppError(
          "Dispatch outcome could not be recorded safely.",
          409,
          "MEDIA_DISPATCH_OUTCOME_CONFLICT"
        );
      }

      const paymentChanges = {
        initiationStatus: paymentInitiationStatus,
      };

      if (state === MEDIA_DISPATCH_STATES.ACCEPTED) {
        paymentChanges.providerTransactionId =
          checkoutRequestId.trim();

        paymentChanges.merchantRequestId =
          merchantRequestId.trim();

        paymentChanges.initiationAcceptedAt = now;
        paymentChanges.initiationErrorCode = null;
      }

      const paymentUpdate =
        await PaymentTransaction.updateOne(
          {
            _id: payment._id,
            status: PAYMENT_STATUSES.PROCESSING,
            initiationStatus: PAYMENT_INITIATION_STATUSES.DISPATCHING,
            verificationStatus: PAYMENT_VERIFICATION_STATUSES.UNVERIFIED,
          },
          {
            $set: paymentChanges,
            $inc: {
              __v: 1,
            },
          },
          { session }
        );

      if (paymentUpdate.modifiedCount !== 1) {
        throw new AppError(
          "Payment outcome could not be recorded safely.",
          409,
          "MEDIA_PAYMENT_OUTCOME_CONFLICT"
        );
      }

      result = {
        recorded: true,
        paymentId: payment._id.toString(),
        state,
        paymentInitiationStatus,
      };
    });

    return result;
  } finally {
    await session.endSession();
  }
};


