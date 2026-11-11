
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
 * 3. Creates a dispatch record for a first attempt, OR
 *    reuses the existing dispatch after a confirmed rejection.
 * 4. Claims the payment for processing.
 *
 * A previous UNKNOWN, ACCEPTED, DISPATCHING, or other
 * non-rejected dispatch blocks another attempt.
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

      // A payment attempt must never be dispatched twice.
      const existingAttemptDispatch =
        await MediaPaymentDispatch.findOne({
          paymentId,
        }).session(session);

      if (existingAttemptDispatch) {
        throw new AppError(
          "This payment attempt already has a dispatch record.",
          409,
          "MEDIA_DISPATCH_ALREADY_EXISTS"
        );
      }

      // UNKNOWN, ACCEPTED, DISPATCHING, and other non-rejected
      // attempts must continue blocking another payment attempt.
      const blockingDispatch =
        await MediaPaymentDispatch.findOne({
          mediaPurchaseId: purchase._id,
          state: {
            $ne: MEDIA_DISPATCH_STATES.REJECTED,
          },
        }).session(session);

      if (blockingDispatch) {
        throw new AppError(
          "A previous payment attempt is still awaiting reconciliation or settlement.",
          409,
          "MEDIA_DISPATCH_REQUIRES_RECONCILIATION"
        );
      }

      // The unique mediaPurchaseId index means a rejected dispatch
      // must be reused instead of creating another dispatch record.
      const previousRejectedDispatch =
        await MediaPaymentDispatch.findOne({
          mediaPurchaseId: purchase._id,
          state: MEDIA_DISPATCH_STATES.REJECTED,
        }).session(session);

      if (previousRejectedDispatch) {
        if (
          previousRejectedDispatch.requiresManualReview !== false ||
          !isValidId(previousRejectedDispatch.paymentId)
        ) {
          throw new AppError(
            "The previous payment attempt is not eligible for automatic retry.",
            409,
            "MEDIA_PREVIOUS_ATTEMPT_NOT_RETRYABLE"
          );
        }

        const previousPayment =
          await PaymentTransaction.findOne({
            _id: previousRejectedDispatch.paymentId,
            payerId: purchase.buyerId,
            creatorId: purchase.creatorId,
            purpose: PAYMENT_PURPOSES.MEDIA_PURCHASE,
            subscriptionId: null,
            provider: PAYMENT_PROVIDERS.MPESA,
            status: PAYMENT_STATUSES.FAILED,
            verificationStatus:
              PAYMENT_VERIFICATION_STATUSES.UNVERIFIED,
            initiationStatus:
              PAYMENT_INITIATION_STATUSES.REJECTED,
          }).session(session);

        if (!previousPayment) {
          throw new AppError(
            "The previous payment does not have a confirmed safe-retry state.",
            409,
            "MEDIA_PREVIOUS_PAYMENT_NOT_RETRYABLE"
          );
        }
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

      if (previousRejectedDispatch) {
        // Reuse the existing dispatch document. The previous
        // PaymentTransaction remains FAILED for audit purposes.
        const dispatchUpdate =
          await MediaPaymentDispatch.updateOne(
            {
              _id: previousRejectedDispatch._id,
              mediaPurchaseId: purchase._id,
              paymentId: previousRejectedDispatch.paymentId,
              state: MEDIA_DISPATCH_STATES.REJECTED,
              requiresManualReview: false,
            },
            {
              $set: {
                paymentId: payment._id,
                buyerId: purchase.buyerId,
                state: MEDIA_DISPATCH_STATES.AUTHORIZED,
                authorizedAt: now,
                dispatchStartedAt: null,
                dispatchCompletedAt: null,
                requiresManualReview: false,
                manualReviewReason: null,
              },
            },
            { session }
          );

        if (dispatchUpdate.modifiedCount !== 1) {
          throw new AppError(
            "The rejected dispatch could not be safely reused.",
            409,
            "MEDIA_DISPATCH_REUSE_CONFLICT"
          );
        }
      } else {
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
      }

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
        reusedRejectedDispatch: Boolean(
          previousRejectedDispatch
        ),
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
 * ACCEPTED:
 * Daraja accepted the STK request. This is NOT payment success.
 *
 * UNKNOWN:
 * The outcome could not be confirmed. Manual reconciliation is
 * required, and another attempt is blocked.
 *
 * REJECTED:
 * Only permitted when there is confirmed evidence that the STK
 * request was never submitted to Daraja.
 */
export const recordMediaPaymentDispatchOutcome = async ({
  paymentId,
  state,
  requiresManualReview = false,
  manualReviewReason = null,
  checkoutRequestId = null,
  merchantRequestId = null,
  confirmedNotSubmitted = false,
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
    MEDIA_DISPATCH_STATES.REJECTED,
  ];

  if (!allowedStates.includes(state)) {
    throw new AppError(
      "Unsupported media payment dispatch outcome.",
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
      !manualReviewReason.trim() ||
      checkoutRequestId !== null ||
      merchantRequestId !== null ||
      confirmedNotSubmitted !== false
    ) {
      throw new AppError(
        "Unknown dispatch outcomes require manual review and cannot contain provider identifiers.",
        400,
        "UNKNOWN_OUTCOME_REQUIRES_REVIEW"
      );
    }
  }

  if (state === MEDIA_DISPATCH_STATES.ACCEPTED) {
    if (
      requiresManualReview !== false ||
      manualReviewReason !== null ||
      confirmedNotSubmitted !== false
    ) {
      throw new AppError(
        "Accepted dispatches cannot carry rejection or unknown-outcome details.",
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

  if (state === MEDIA_DISPATCH_STATES.REJECTED) {
    if (
      confirmedNotSubmitted !== true ||
      requiresManualReview !== false ||
      manualReviewReason !== null ||
      checkoutRequestId !== null ||
      merchantRequestId !== null
    ) {
      throw new AppError(
        "REJECTED requires confirmed evidence that no STK request was submitted.",
        400,
        "INVALID_CONFIRMED_REJECTION"
      );
    }
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
        initiationStatus:
          PAYMENT_INITIATION_STATUSES.DISPATCHING,
        verificationStatus:
          PAYMENT_VERIFICATION_STATUSES.UNVERIFIED,
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
          : state === MEDIA_DISPATCH_STATES.REJECTED
            ? PAYMENT_INITIATION_STATUSES.REJECTED
            : PAYMENT_INITIATION_STATUSES.UNKNOWN;

      const dispatchChanges = {
        state,
        dispatchCompletedAt: now,
        requiresManualReview,
        manualReviewReason:
          state === MEDIA_DISPATCH_STATES.UNKNOWN
            ? manualReviewReason.trim()
            : null,
      };

      const dispatchUpdate =
        await MediaPaymentDispatch.updateOne(
          {
            _id: dispatch._id,
            paymentId,
            state: MEDIA_DISPATCH_STATES.DISPATCHING,
          },
          {
            $set: dispatchChanges,
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

      if (state === MEDIA_DISPATCH_STATES.REJECTED) {
        // A confirmed pre-submission rejection is a failed
        // initiation, not a verified financial transaction.
        paymentChanges.status = PAYMENT_STATUSES.FAILED;
        paymentChanges.initiationErrorCode =
          "MPESA_OAUTH_FAILED";
      }

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
            initiationStatus:
              PAYMENT_INITIATION_STATUSES.DISPATCHING,
            verificationStatus:
              PAYMENT_VERIFICATION_STATUSES.UNVERIFIED,
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
