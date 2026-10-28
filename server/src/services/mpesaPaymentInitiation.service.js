import mongoose from "mongoose";

import User from "../models/User.model.js";

import SubscriberSubscription, {
  SUBSCRIPTION_STATUSES,
} from "../models/SubscriberSubscription.model.js";

import PaymentTransaction from "../models/PaymentTransaction.model.js";

import {
  authorizePaymentDispatch,
  markPaymentDispatchStarted,
  recordPaymentDispatchOutcome,
} from "./paymentDispatchCoordination.service.js";

import {
  DISPATCH_STATES,
} from "../models/PaymentDispatchCoordination.model.js";

import {
  PAYMENT_PURPOSES,
  PAYMENT_PROVIDERS,
  PAYMENT_STATUSES,
  PAYMENT_VERIFICATION_STATUSES,
  PAYMENT_INITIATION_STATUSES,
} from "../constants/payment.constants.js";

import {
  initiateMpesaStkPush,
  normalizeMpesaPhone,
  convertMinorToKes,
} from "../payments/mpesa/mpesa.client.js";

import {
  fingerprintMpesaPhone,
} from "../payments/mpesa/mpesa.fingerprint.js";

import {
  getMpesaConfig,
} from "../payments/mpesa/mpesa.config.js";

import AppError from "../utils/AppError.js";

/**
 * ============================================================
 * PREMIUMCHAT — M-PESA PAYMENT INITIATION SERVICE
 * ============================================================
 *
 * Module 4.3.5.7.8.13.16
 *
 * FEATURES:
 *
 * - Subscriber eligibility validation
 * - Subscription ownership validation
 * - Server-controlled payment amount
 * - KES currency enforcement
 * - Phone normalization
 * - Secure HMAC phone fingerprinting
 * - Phone-bound idempotency
 * - Duplicate payment prevention
 * - Atomic payment dispatch authorization
 * - Cancellation coordination
 * - M-Pesa STK Push initiation
 * - Provider acceptance validation
 * - Provider identifier persistence
 * - Unknown outcome handling
 * - Dispatch outcome recording
 *
 * SECURITY:
 *
 * - Never trust client-provided payment amounts.
 * - Never store plaintext payment phone numbers.
 * - Never automatically retry uncertain STK Push requests.
 * - Never treat STK acceptance as financial verification.
 * - Never activate subscriptions in this service.
 *
 * IMPORTANT:
 *
 * Cancellation coordination requires all pending
 * subscription cancellation paths to participate
 * in the same database coordination protocol.
 */

/**
 * ============================================================
 * VALIDATION HELPERS
 * ============================================================
 */

const isValidId = (value) =>
  typeof value === "string" &&
  mongoose.isObjectIdOrHexString(value);

const validateClientRequestId = (value) => {
  if (
    typeof value !== "string" ||
    value.length < 8 ||
    value.length > 100 ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  ) {
    throw new AppError(
      "Invalid payment request identifier.",
      400,
      "INVALID_PAYMENT_REQUEST_ID"
    );
  }
};

/**
 * ============================================================
 * VALIDATE SUBSCRIPTION
 * ============================================================
 */

const validateSubscription = (
  subscription,
  subscriberId
) => {
  if (!subscription) {
    throw new AppError(
      "Subscription not found.",
      404,
      "SUBSCRIPTION_NOT_FOUND"
    );
  }

  if (
    subscription.subscriberId.toString() !==
    subscriberId
  ) {
    throw new AppError(
      "Subscription not found.",
      404,
      "SUBSCRIPTION_NOT_FOUND"
    );
  }

  if (
    subscription.status !==
    SUBSCRIPTION_STATUSES.PENDING
  ) {
    throw new AppError(
      "Only pending subscriptions can initiate an initial payment.",
      409,
      "SUBSCRIPTION_NOT_PENDING"
    );
  }

  if (
    subscription.planSnapshot?.currency !== "KES"
  ) {
    throw new AppError(
      "M-Pesa currently supports KES subscriptions only.",
      409,
      "UNSUPPORTED_PAYMENT_CURRENCY"
    );
  }

  const amountMinor =
    subscription.planSnapshot?.monthlyPriceMinor;

  try {
    convertMinorToKes(amountMinor);
  } catch {
    throw new AppError(
      "Subscription price is not supported by M-Pesa.",
      409,
      "INVALID_MPESA_AMOUNT"
    );
  }

  return amountMinor;
};

/**
 * ============================================================
 * FORMAT PAYMENT RESPONSE
 * ============================================================
 */

const formatPaymentResult = (payment) => ({
  paymentId: payment._id.toString(),

  subscriptionId:
    payment.subscriptionId.toString(),

  status: payment.status,

  initiationStatus:
    payment.initiationStatus,

  amountMinor:
    payment.amountMinor,

  currency:
    payment.currency,

  checkoutRequestId:
    payment.providerTransactionId || null,

  paymentVerified: false,

  subscriptionActivated: false,
});

/**
 * ============================================================
 * VALIDATE IDEMPOTENCY REPLAY
 * ============================================================
 */

const validateIdempotencyReplay = ({
  existingPayment,
  subscriptionId,
  amountMinor,
  paymentPhoneFingerprint,
}) => {
  const isSameRequest =
    existingPayment.subscriptionId?.toString() ===
      subscriptionId &&
    existingPayment.provider ===
      PAYMENT_PROVIDERS.MPESA &&
    existingPayment.purpose ===
      PAYMENT_PURPOSES.SUBSCRIPTION_INITIAL &&
    existingPayment.amountMinor ===
      amountMinor &&
    existingPayment.currency === "KES" &&
    existingPayment.paymentPhoneFingerprint ===
      paymentPhoneFingerprint;

  if (!isSameRequest) {
    throw new AppError(
      "Payment request identifier is already associated with another request.",
      409,
      "PAYMENT_REQUEST_CONFLICT"
    );
  }

  return {
    created: false,

    payment:
      formatPaymentResult(existingPayment),
  };
};

/**
 * ============================================================
 * MARK INITIATION OUTCOME UNKNOWN
 * ============================================================
 */

const markInitiationOutcomeUnknown = async ({
  paymentId,
  errorCode = "PROVIDER_OUTCOME_UNKNOWN",
}) => {
  await PaymentTransaction.updateOne(
    {
      _id: paymentId,

      initiationStatus:
        PAYMENT_INITIATION_STATUSES.DISPATCHING,
    },
    {
      $set: {
        initiationStatus:
          PAYMENT_INITIATION_STATUSES.UNKNOWN,

        initiationErrorCode:
          errorCode,
      },

      $inc: {
        __v: 1,
      },
    }
  );
};

/**
 * ============================================================
 * RECORD DISPATCH OUTCOME SAFELY
 * ============================================================
 *
 * Coordination recording must not trigger
 * another STK Push.
 *
 * If recording fails, log the error and
 * leave the payment available for reconciliation.
 */

const recordDispatchOutcomeSafely = async ({
  paymentId,
  state,
}) => {
  try {
    const result =
      await recordPaymentDispatchOutcome({
        paymentId,
        state,
      });

    if (!result) {
      console.error(
        "[PaymentDispatch] Outcome not recorded:",
        paymentId.toString(),
        state
      );
    }

    return result;
  } catch (error) {
    console.error(
      "[PaymentDispatch] Failed to record outcome:",
      paymentId.toString(),
      state,
      error?.message
    );

    return null;
  }
};

/**
 * ============================================================
 * HANDLE UNKNOWN INITIATION
 * ============================================================
 */

const handleUnknownInitiation = async ({
  paymentId,
  errorCode,
  message,
}) => {
  try {
    await markInitiationOutcomeUnknown({
      paymentId,
      errorCode,
    });
  } catch (error) {
    console.error(
      "[MPesa] Failed to persist UNKNOWN initiation:",
      paymentId.toString(),
      error?.message
    );
  }

  await recordDispatchOutcomeSafely({
    paymentId,
    state: DISPATCH_STATES.UNKNOWN,
  });

  throw new AppError(
    message,
    503,
    "MPESA_INITIATION_OUTCOME_UNKNOWN"
  );
};

/**
 * ============================================================
 * INITIATE SUBSCRIPTION M-PESA PAYMENT
 * ============================================================
 */

export const initiateSubscriptionMpesaPayment =
  async ({
    subscriberId,
    subscriptionId,
    phoneNumber,
    clientRequestId,
  } = {}) => {
    /**
     * ========================================================
     * STEP 1 — VALIDATE REQUEST IDENTIFIERS
     * ========================================================
     */

    if (!isValidId(subscriberId)) {
      throw new AppError(
        "Invalid subscriber identifier.",
        400,
        "INVALID_SUBSCRIBER"
      );
    }

    if (!isValidId(subscriptionId)) {
      throw new AppError(
        "Invalid subscription identifier.",
        400,
        "INVALID_SUBSCRIPTION_ID"
      );
    }

    validateClientRequestId(clientRequestId);

    /**
     * ========================================================
     * STEP 2 — NORMALIZE PHONE NUMBER
     * ========================================================
     */

    let normalizedPhone;

    try {
      normalizedPhone =
        normalizeMpesaPhone(phoneNumber);
    } catch {
      throw new AppError(
        "Invalid M-Pesa phone number.",
        400,
        "INVALID_MPESA_PHONE"
      );
    }

    /**
     * ========================================================
     * STEP 3 — GENERATE PHONE FINGERPRINT
     * ========================================================
     */

    const paymentPhoneFingerprint =
      fingerprintMpesaPhone(normalizedPhone);

    /**
     * ========================================================
     * STEP 4 — VERIFY PAYMENT FEATURE FLAG
     * ========================================================
     */

    const config = getMpesaConfig();

    if (!config.paymentsEnabled) {
      throw new AppError(
        "M-Pesa payments are currently disabled.",
        503,
        "MPESA_PAYMENTS_DISABLED"
      );
    }

    /**
     * ========================================================
     * STEP 5 — VALIDATE SUBSCRIBER
     * ========================================================
     */

    const subscriber =
      await User.findById(subscriberId);

    if (
      !subscriber ||
      !subscriber.isAccountActive() ||
      !subscriber.canAccessRestrictedContent()
    ) {
      throw new AppError(
        "Subscriber is not eligible to make this payment.",
        403,
        "SUBSCRIBER_NOT_ELIGIBLE"
      );
    }

    /**
     * ========================================================
     * STEP 6 — LOAD SUBSCRIPTION
     * ========================================================
     */

    const subscription =
      await SubscriberSubscription.findOne({
        _id: subscriptionId,
        subscriberId,
      });

    const amountMinor =
      validateSubscription(
        subscription,
        subscriberId
      );

    /**
     * ========================================================
     * STEP 7 — ENFORCE IDEMPOTENCY
     * ========================================================
     */

    const existingByRequest =
      await PaymentTransaction.findOne({
        payerId: subscriberId,
        clientRequestId,
      });

    if (existingByRequest) {
      return validateIdempotencyReplay({
        existingPayment:
          existingByRequest,

        subscriptionId,

        amountMinor,

        paymentPhoneFingerprint,
      });
    }

    /**
     * ========================================================
     * STEP 8 — PREVENT OVERLAPPING PAYMENTS
     * ========================================================
     */

    const existingOpenPayment =
      await PaymentTransaction.findOne({
        subscriptionId,

        purpose:
          PAYMENT_PURPOSES.SUBSCRIPTION_INITIAL,

        provider:
          PAYMENT_PROVIDERS.MPESA,

        status: {
          $in: [
            PAYMENT_STATUSES.PENDING,
            PAYMENT_STATUSES.PROCESSING,
          ],
        },
      });

    if (existingOpenPayment) {
      throw new AppError(
        "A payment attempt is already in progress for this subscription.",
        409,
        "PAYMENT_ALREADY_IN_PROGRESS"
      );
    }

    /**
     * ========================================================
     * STEP 9 — RESERVE PAYMENT
     * ========================================================
     */

    let payment;

    try {
      payment =
        await PaymentTransaction.create({
          payerId: subscriberId,

          creatorId:
            subscription.creatorId,

          subscriptionId:
            subscription._id,

          purpose:
            PAYMENT_PURPOSES.SUBSCRIPTION_INITIAL,

          provider:
            PAYMENT_PROVIDERS.MPESA,

          amountMinor,

          currency: "KES",

          clientRequestId,

          paymentPhoneFingerprint,

          status:
            PAYMENT_STATUSES.PENDING,

          verificationStatus:
            PAYMENT_VERIFICATION_STATUSES.UNVERIFIED,

          initiationStatus:
            PAYMENT_INITIATION_STATUSES.RESERVED,
        });
    } catch (error) {
      if (error?.code === 11000) {
        const concurrentPayment =
          await PaymentTransaction.findOne({
            payerId: subscriberId,
            clientRequestId,
          });

        if (concurrentPayment) {
          return validateIdempotencyReplay({
            existingPayment:
              concurrentPayment,

            subscriptionId,

            amountMinor,

            paymentPhoneFingerprint,
          });
        }

        throw new AppError(
          "A payment attempt already exists for this subscription.",
          409,
          "PAYMENT_ALREADY_IN_PROGRESS"
        );
      }

      throw error;
    }

    /**
     * ========================================================
     * STEP 10 — AUTHORIZE PAYMENT DISPATCH
     * ========================================================
     *
     * Authorization and payment claiming
     * are coordinated through MongoDB.
     */

    await authorizePaymentDispatch({
      paymentId: payment._id,

      subscriptionId:
        subscription._id,

      subscriberId,
    });

    /**
     * ========================================================
     * STEP 11 — MARK DISPATCH STARTED
     * ========================================================
     *
     * This must succeed before contacting Daraja.
     */

    await markPaymentDispatchStarted({
      paymentId: payment._id,
    });

    /**
     * ========================================================
     * STEP 12 — INITIATE M-PESA STK PUSH
     * ========================================================
     */

    let providerResponse;

    try {
      providerResponse =
        await initiateMpesaStkPush({
          phoneNumber:
            normalizedPhone,

          amountMinor,

          accountReference:
            payment._id
              .toString()
              .slice(-12),
        });
    } catch {
      await handleUnknownInitiation({
        paymentId:
          payment._id,

        errorCode:
          "PROVIDER_OUTCOME_UNKNOWN",

        message:
          "The payment request outcome is uncertain. Check its status before trying again.",
      });
    }

    /**
     * ========================================================
     * STEP 13 — VALIDATE PROVIDER ACCEPTANCE
     * ========================================================
     */

    const providerAccepted =
      providerResponse?.accepted === true;

    const validCheckoutRequestId =
      typeof providerResponse?.checkoutRequestId ===
        "string" &&
      providerResponse.checkoutRequestId.trim().length > 0;

    const validMerchantRequestId =
      typeof providerResponse?.merchantRequestId ===
        "string" &&
      providerResponse.merchantRequestId.trim().length > 0;

    /**
     * ========================================================
     * STEP 14 — HANDLE PROVIDER REJECTION
     * ========================================================
     */

    if (!providerAccepted) {
      /*
       * Only an explicit, authoritative provider
       * rejection may be marked REJECTED.
       *
       * Other outcomes remain UNKNOWN.
       */

      const explicitlyRejected =
        providerResponse?.accepted === false &&
        providerResponse?.rejectionConfirmed === true;

      if (explicitlyRejected) {
        try {
          await PaymentTransaction.updateOne(
            {
              _id:
                payment._id,

              initiationStatus:
                PAYMENT_INITIATION_STATUSES.DISPATCHING,
            },
            {
              $set: {
                initiationStatus:
                  PAYMENT_INITIATION_STATUSES.REJECTED,

                initiationErrorCode:
                  "PROVIDER_INITIATION_REJECTED",
              },

              $inc: {
                __v: 1,
              },
            }
          );
        } catch (error) {
          console.error(
            "[MPesa] Failed to persist rejection:",
            payment._id.toString(),
            error?.message
          );
        }

        await recordDispatchOutcomeSafely({
          paymentId:
            payment._id,

          state:
            DISPATCH_STATES.REJECTED,
        });

        throw new AppError(
          "M-Pesa rejected the payment initiation request.",
          502,
          "MPESA_INITIATION_REJECTED"
        );
      }

      await handleUnknownInitiation({
        paymentId:
          payment._id,

        errorCode:
          "PROVIDER_ACCEPTANCE_UNCONFIRMED",

        message:
          "M-Pesa payment initiation could not be confirmed. Reconciliation is required.",
      });
    }

    /**
     * ========================================================
     * STEP 15 — VALIDATE PROVIDER IDENTIFIERS
     * ========================================================
     */

    if (
      !validCheckoutRequestId ||
      !validMerchantRequestId
    ) {
      await handleUnknownInitiation({
        paymentId:
          payment._id,

        errorCode:
          "PROVIDER_IDENTIFIERS_MISSING",

        message:
          "M-Pesa accepted the request but returned incomplete identifiers. Reconciliation is required.",
      });
    }

    /**
     * ========================================================
     * STEP 16 — PERSIST PROVIDER IDENTIFIERS
     * ========================================================
     */

    let updated;

    try {
      updated =
        await PaymentTransaction.findOneAndUpdate(
          {
            _id:
              payment._id,

            initiationStatus:
              PAYMENT_INITIATION_STATUSES.DISPATCHING,

            status:
              PAYMENT_STATUSES.PROCESSING,
          },
          {
            $set: {
              initiationStatus:
                PAYMENT_INITIATION_STATUSES.ACCEPTED,

              initiationAcceptedAt:
                new Date(),

              providerTransactionId:
                providerResponse.checkoutRequestId.trim(),

              merchantRequestId:
                providerResponse.merchantRequestId.trim(),

              initiationErrorCode:
                null,
            },

            $inc: {
              __v: 1,
            },
          },
          {
            new: true,
          }
        );
    } catch {
      await handleUnknownInitiation({
        paymentId:
          payment._id,

        errorCode:
          "PROVIDER_IDENTIFIERS_PERSISTENCE_FAILED",

        message:
          "Payment initiation was accepted but its identifiers could not be safely stored. Reconciliation is required.",
      });
    }

    if (!updated) {
      await recordDispatchOutcomeSafely({
        paymentId:
          payment._id,

        state:
          DISPATCH_STATES.UNKNOWN,
      });

      throw new AppError(
        "Payment initiation state changed unexpectedly. Reconciliation is required.",
        409,
        "PAYMENT_INITIATION_STATE_CONFLICT"
      );
    }

    /**
     * ========================================================
     * STEP 17 — RECORD ACCEPTED DISPATCH
     * ========================================================
     *
     * ACCEPTED means Safaricom accepted
     * the STK Push initiation.
     *
     * It does not mean payment succeeded.
     */

    await recordDispatchOutcomeSafely({
      paymentId:
        payment._id,

      state:
        DISPATCH_STATES.ACCEPTED,
    });

    /**
     * ========================================================
     * STEP 18 — RETURN RESULT
     * ========================================================
     */

    return {
      created: true,

      payment:
        formatPaymentResult(updated),
    };
  };