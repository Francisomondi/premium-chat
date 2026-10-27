import mongoose from "mongoose";

import User from "../models/User.model.js";

import SubscriberSubscription, {
  SUBSCRIPTION_STATUSES,
} from "../models/SubscriberSubscription.model.js";

import PaymentTransaction from "../models/PaymentTransaction.model.js";

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
  getMpesaConfig,
} from "../payments/mpesa/mpesa.config.js";

import AppError from "../utils/AppError.js";

/**
 * ============================================================
 * PREMIUMCHAT — M-PESA PAYMENT INITIATION SERVICE
 * ============================================================
 *
 * Module 4.3.5.7.8.13.10
 *
 * SECURITY:
 *
 * - Subscriber identity comes from authentication.
 * - Amount comes from the subscription snapshot.
 * - Currency must be KES.
 * - Subscription must be PENDING.
 * - No payment confirmation is accepted here.
 * - No subscription activation occurs here.
 *
 * IMPORTANT:
 *
 * A durable database-level reservation is required
 * to prevent competing requests from initiating
 * multiple payments for one subscription.
 */

/**
 * ============================================================
 * VALIDATION
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
 * FORMAT RESPONSE
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

  /**
   * This endpoint never confirms payment.
   */

  paymentVerified: false,

  subscriptionActivated: false,
});

/**
 * ============================================================
 * INITIATE SUBSCRIPTION PAYMENT
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
     * STEP 1:
     * Validate request.
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

    validateClientRequestId(
      clientRequestId
    );

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
     * STEP 2:
     * Verify payments are enabled.
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
     * STEP 3:
     * Validate subscriber.
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
     * STEP 4:
     * Load and validate subscription.
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
     * STEP 5:
     * Enforce request idempotency.
     *
     * A repeated request identifier must not
     * create another payment attempt.
     */

    const existingByRequest =
      await PaymentTransaction.findOne({
        payerId: subscriberId,
        clientRequestId,
      });

    if (existingByRequest) {
      if (
        existingByRequest.subscriptionId?.toString() !==
          subscriptionId ||
        existingByRequest.provider !==
          PAYMENT_PROVIDERS.MPESA ||
        existingByRequest.purpose !==
          PAYMENT_PURPOSES.SUBSCRIPTION_INITIAL ||
        existingByRequest.amountMinor !==
          amountMinor ||
        existingByRequest.currency !== "KES"
      ) {
        throw new AppError(
          "Payment request identifier is already associated with another request.",
          409,
          "PAYMENT_REQUEST_CONFLICT"
        );
      }

      return {
        created: false,

        payment:
          formatPaymentResult(existingByRequest),
      };
    }

    /**
     * STEP 6:
     * Prevent overlapping attempts.
     *
     * IMPORTANT:
     *
     * This preflight query improves behavior,
     * but it is NOT a concurrency guarantee.
     *
     * A unique partial index is required
     * before this service can be safely
     * enabled for concurrent production traffic.
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
     * STEP 7:
     * Reserve payment attempt.
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

          status:
            PAYMENT_STATUSES.PENDING,

          verificationStatus:
            PAYMENT_VERIFICATION_STATUSES.UNVERIFIED,

          initiationStatus:
            PAYMENT_INITIATION_STATUSES.RESERVED,
        });
    } catch (error) {
      if (error?.code === 11000) {
        throw new AppError(
          "A payment request already exists. Retrieve its status before retrying.",
          409,
          "PAYMENT_REQUEST_CONFLICT"
        );
      }

      throw error;
    }

    /**
     * STEP 8:
     * Atomically claim the attempt.
     *
     * Only the request that successfully
     * changes RESERVED -> DISPATCHING
     * may contact Daraja.
     */

    const claimed =
      await PaymentTransaction.findOneAndUpdate(
        {
          _id: payment._id,

          status:
            PAYMENT_STATUSES.PENDING,

          initiationStatus:
            PAYMENT_INITIATION_STATUSES.RESERVED,
        },
        {
          $set: {
            status:
              PAYMENT_STATUSES.PROCESSING,

            initiationStatus:
              PAYMENT_INITIATION_STATUSES.DISPATCHING,

            initiationClaimedAt:
              new Date(),
          },

          $inc: {
            __v: 1,
          },
        },
        {
          new: true,
        }
      );

    if (!claimed) {
      throw new AppError(
        "Payment initiation is already being processed.",
        409,
        "PAYMENT_INITIATION_CONFLICT"
      );
    }

    /**
     * STEP 9:
     * Initiate STK Push.
     *
     * The payment document already exists.
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
    } catch (error) {
      /**
       * The request may have reached Daraja.
       *
       * Do not automatically create another
       * payment or retry the STK Push.
       */

      await PaymentTransaction.updateOne(
        {
          _id: payment._id,

          initiationStatus:
            PAYMENT_INITIATION_STATUSES.DISPATCHING,
        },
        {
          $set: {
            initiationStatus:
              PAYMENT_INITIATION_STATUSES.UNKNOWN,

            initiationErrorCode:
              "PROVIDER_OUTCOME_UNKNOWN",
          },

          $inc: {
            __v: 1,
          },
        }
      );

      throw new AppError(
        "The payment request outcome is uncertain. Check its status before trying again.",
        503,
        "MPESA_INITIATION_OUTCOME_UNKNOWN"
      );
    }

    /**
     * STEP 10:
     * Store provider identifiers.
     *
     * This is not payment verification.
     */

    const updated =
      await PaymentTransaction.findOneAndUpdate(
        {
          _id: payment._id,

          initiationStatus:
            PAYMENT_INITIATION_STATUSES.DISPATCHING,
        },
        {
          $set: {
            initiationStatus:
              PAYMENT_INITIATION_STATUSES.ACCEPTED,

            initiationAcceptedAt:
              new Date(),

            providerTransactionId:
              providerResponse.checkoutRequestId,

            merchantRequestId:
              providerResponse.merchantRequestId,

            status:
              PAYMENT_STATUSES.PROCESSING,
          },

          $inc: {
            __v: 1,
          },
        },
        {
          new: true,
        }
      );

    if (!updated) {
      throw new AppError(
        "Payment initiation state changed unexpectedly. Reconciliation is required.",
        409,
        "PAYMENT_INITIATION_STATE_CONFLICT"
      );
    }

    /**
     * STEP 11:
     * Return payment initiation details.
     *
     * No subscription activation occurs.
     */

    return {
      created: true,

      payment:
        formatPaymentResult(updated),
    };
  };