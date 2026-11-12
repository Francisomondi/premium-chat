
import mongoose from "mongoose";

import User from "../models/User.model.js";
import MediaPurchase from "../models/MediaPurchase.model.js";
import PaymentTransaction from "../models/PaymentTransaction.model.js";

import {
  PAYMENT_PURPOSES,
  PAYMENT_PROVIDERS,
  PAYMENT_STATUSES,
  PAYMENT_VERIFICATION_STATUSES,
  PAYMENT_INITIATION_STATUSES,
} from "../constants/payment.constants.js";

import {
  normalizeMpesaPhone,
  initiateMpesaStkPush,
} from "../payments/mpesa/mpesa.client.js";

import {
  fingerprintMpesaPhone,
} from "../payments/mpesa/mpesa.fingerprint.js";

import {
  getMpesaConfig,
} from "../payments/mpesa/mpesa.config.js";

import {
  linkMediaPurchasePayment,
} from "./mediaPurchase.service.js";

import AppError from "../utils/AppError.js";

const createError = (
  message,
  statusCode = 400,
  code = "MEDIA_PAYMENT_ERROR"
) => new AppError(message, statusCode, code);

const validateObjectId = (value, fieldName) => {
  if (!mongoose.isObjectIdOrHexString(value)) {
    throw createError(
      `Invalid ${fieldName}.`,
      400,
      "INVALID_IDENTIFIER"
    );
  }
};

const validateClientRequestId = (value) => {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9_-]{8,128}$/.test(value.trim())
  ) {
    throw createError(
      "Invalid client request ID.",
      400,
      "INVALID_CLIENT_REQUEST_ID"
    );
  }

  return value.trim();
};

const formatResult = (payment, purchaseId) => {
  let message = "Payment is being prepared.";

  if (
    payment.initiationStatus ===
    PAYMENT_INITIATION_STATUSES.RESERVED
  ) {
    message =
      "Your payment request is reserved and has not yet been submitted.";
  } else if (
    payment.initiationStatus ===
    PAYMENT_INITIATION_STATUSES.DISPATCHING
  ) {
    message =
      "Your M-Pesa request is being submitted. Do not initiate another payment.";
  } else if (
    payment.initiationStatus ===
    PAYMENT_INITIATION_STATUSES.ACCEPTED
  ) {
    message =
      "Safaricom accepted the STK request. Check your phone for the payment prompt.";
  } else if (
    payment.initiationStatus ===
    PAYMENT_INITIATION_STATUSES.UNKNOWN
  ) {
    message =
      "The M-Pesa request outcome is uncertain. Do not retry this payment.";
  } else if (
    payment.initiationStatus ===
    PAYMENT_INITIATION_STATUSES.REJECTED
  ) {
    message =
      "The STK request was rejected before submission. This payment attempt cannot be reused.";
  } else if (
    payment.status === PAYMENT_STATUSES.PROCESSING
  ) {
    message =
      "Your payment is being processed. Check its status before trying again.";
  } else if (
    payment.status === PAYMENT_STATUSES.SUCCEEDED &&
    payment.verificationStatus ===
      PAYMENT_VERIFICATION_STATUSES.VERIFIED
  ) {
    message = "Your payment has been verified.";
  }

  return {
    paymentId: payment._id.toString(),
    purchaseId: purchaseId.toString(),
    status: payment.status,
    initiationStatus: payment.initiationStatus,
    amountMinor: payment.amountMinor,
    currency: payment.currency,
    checkoutRequestId: payment.providerTransactionId ?? null,
    paymentVerified:
      payment.status === PAYMENT_STATUSES.SUCCEEDED &&
      payment.verificationStatus ===
        PAYMENT_VERIFICATION_STATUSES.VERIFIED,
    mediaAccessGranted:
      payment.status === PAYMENT_STATUSES.SUCCEEDED &&
      payment.verificationStatus ===
        PAYMENT_VERIFICATION_STATUSES.VERIFIED,
    message,
  };
};

/**
 * Mark an uncertain provider outcome.
 *
 * Never reset this payment to RESERVED.
 * Never automatically submit another STK request.
 */
const markPaymentUnknown = async ({
  paymentId,
  errorCode = "MPESA_INITIATION_UNKNOWN",
}) => {
  await PaymentTransaction.updateOne(
    {
      _id: paymentId,
      initiationStatus: {
        $in: [
          PAYMENT_INITIATION_STATUSES.DISPATCHING,
          PAYMENT_INITIATION_STATUSES.ACCEPTED,
        ],
      },
      verificationStatus:
        PAYMENT_VERIFICATION_STATUSES.UNVERIFIED,
    },
    {
      $set: {
        initiationStatus:
          PAYMENT_INITIATION_STATUSES.UNKNOWN,
        status: PAYMENT_STATUSES.PROCESSING,
        initiationErrorCode: errorCode,
      },
      $inc: {
        __v: 1,
      },
    }
  );

  const payment = await PaymentTransaction.findById(paymentId);

  if (!payment) {
    throw createError(
      "Payment requires reconciliation.",
      503,
      "MEDIA_PAYMENT_RECONCILIATION_REQUIRED"
    );
  }

  return payment;
};

/**
 * Initiate one M-Pesa STK Push for a media purchase.
 *
 * PaymentTransaction is the single source of truth.
 * No MediaPaymentDispatch records or dispatch leases
 * are required by this service.
 */
export const initiateMediaMpesaPayment = async ({
  buyerId,
  purchaseId,
  phoneNumber,
  clientRequestId,
}) => {
  validateObjectId(buyerId, "buyer ID");
  validateObjectId(purchaseId, "purchase ID");

  const requestId = validateClientRequestId(clientRequestId);

  const config = getMpesaConfig();

  if (!config.paymentsEnabled) {
    throw createError(
      "M-Pesa payments are currently unavailable.",
      503,
      "MPESA_PAYMENTS_DISABLED"
    );
  }

  const normalizedPhone = normalizeMpesaPhone(phoneNumber);
  const phoneFingerprint =
    fingerprintMpesaPhone(normalizedPhone);

  const buyer = await User.findById(buyerId);

  if (
    !buyer ||
    typeof buyer.canAccessRestrictedContent !== "function" ||
    !buyer.canAccessRestrictedContent()
  ) {
    throw createError(
      "You are not eligible to purchase restricted media.",
      403,
      "BUYER_NOT_ELIGIBLE"
    );
  }

  const purchase = await MediaPurchase.findOne({
    _id: purchaseId,
    buyerId,
    status: "PENDING",
  });

  if (!purchase) {
    throw createError(
      "Pending media purchase not found.",
      404,
      "MEDIA_PURCHASE_NOT_FOUND"
    );
  }

  if (
    !Number.isSafeInteger(purchase.amountMinor) ||
    purchase.amountMinor <= 0 ||
    purchase.currency !== "KES" ||
    purchase.amountMinor % 100 !== 0
  ) {
    throw createError(
      "This media purchase has an invalid M-Pesa amount.",
      400,
      "INVALID_MPESA_MEDIA_AMOUNT"
    );
  }

  /*
   * A purchase already linked to a different payment
   * must never be charged again through another request.
   */
  let payment = await PaymentTransaction.findOne({
    payerId: buyerId,
    clientRequestId: requestId,
  });

  if (payment) {
    const paymentMatchesPurchase =
      payment.creatorId.toString() ===
        purchase.creatorId.toString() &&
      payment.purpose === PAYMENT_PURPOSES.MEDIA_PURCHASE &&
      payment.provider === PAYMENT_PROVIDERS.MPESA &&
      !payment.subscriptionId &&
      payment.amountMinor === purchase.amountMinor &&
      payment.currency === purchase.currency;

    if (!paymentMatchesPurchase) {
      throw createError(
        "This request ID has already been used for another payment.",
        409,
        "PAYMENT_REQUEST_CONFLICT"
      );
    }

    if (
      payment.paymentPhoneFingerprint !== phoneFingerprint
    ) {
      throw createError(
        "This request ID is associated with a different phone number.",
        409,
        "PAYMENT_PHONE_CONFLICT"
      );
    }

    if (
      purchase.paymentId &&
      purchase.paymentId.toString() !== payment._id.toString()
    ) {
      throw createError(
        "This purchase is already linked to another payment.",
        409,
        "MEDIA_PURCHASE_PAYMENT_CONFLICT"
      );
    }
  } else {
    /*
     * Do not create a second payment for a purchase
     * that already has an unresolved or completed attempt.
     */
    if (purchase.paymentId) {
      throw createError(
        "This purchase already has a payment attempt. Its outcome must be resolved before another payment can be initiated.",
        409,
        "MEDIA_PURCHASE_PAYMENT_ALREADY_LINKED"
      );
    }

    try {
      payment = await PaymentTransaction.create({
        payerId: buyerId,
        creatorId: purchase.creatorId,
        purpose: PAYMENT_PURPOSES.MEDIA_PURCHASE,
        subscriptionId: null,
        provider: PAYMENT_PROVIDERS.MPESA,
        amountMinor: purchase.amountMinor,
        currency: purchase.currency,
        clientRequestId: requestId,
        paymentPhoneFingerprint: phoneFingerprint,
        status: PAYMENT_STATUSES.PENDING,
        verificationStatus:
          PAYMENT_VERIFICATION_STATUSES.UNVERIFIED,
        initiationStatus:
          PAYMENT_INITIATION_STATUSES.RESERVED,
      });
    } catch (error) {
      if (error?.code === 11000) {
        const existingPayment =
          await PaymentTransaction.findOne({
            payerId: buyerId,
            clientRequestId: requestId,
          });

        if (existingPayment) {
          payment = existingPayment;
        } else {
          throw createError(
            "A payment request with this identifier already exists.",
            409,
            "PAYMENT_REQUEST_CONFLICT"
          );
        }
      } else {
        throw error;
      }
    }
  }

  /*
   * Link before dispatch.
   *
   * If the process stops after creating the payment but
   * before linking it, the same request ID can safely
   * resume this step.
   */
  await linkMediaPurchasePayment({
    buyerId,
    purchaseId,
    paymentId: payment._id,
  });

  /*
   * Return existing payment states without resubmitting.
   */
  if (
    payment.initiationStatus !==
    PAYMENT_INITIATION_STATUSES.RESERVED
  ) {
    const latestPayment =
      await PaymentTransaction.findById(payment._id);

    if (!latestPayment) {
      throw createError(
        "Payment record not found.",
        404,
        "PAYMENT_NOT_FOUND"
      );
    }

    return formatResult(latestPayment, purchase._id);
  }

  /*
   * Atomic dispatch claim.
   *
   * Only one concurrent request can change RESERVED
   * to DISPATCHING. A second request cannot submit STK.
   *
   * If the process crashes after this update, the payment
   * remains DISPATCHING and cannot be automatically retried.
   */
  const claimedPayment =
    await PaymentTransaction.findOneAndUpdate(
      {
        _id: payment._id,
        payerId: buyerId,
        purpose: PAYMENT_PURPOSES.MEDIA_PURCHASE,
        provider: PAYMENT_PROVIDERS.MPESA,
        status: PAYMENT_STATUSES.PENDING,
        verificationStatus:
          PAYMENT_VERIFICATION_STATUSES.UNVERIFIED,
        initiationStatus:
          PAYMENT_INITIATION_STATUSES.RESERVED,
        providerTransactionId: null,
        merchantRequestId: null,
      },
      {
        $set: {
          initiationStatus:
            PAYMENT_INITIATION_STATUSES.DISPATCHING,
          initiationClaimedAt: new Date(),
        },
        $inc: {
          __v: 1,
        },
      },
      {
        new: true,
        runValidators: true,
      }
    );

  if (!claimedPayment) {
    const latestPayment =
      await PaymentTransaction.findById(payment._id);

    if (!latestPayment) {
      throw createError(
        "Payment record not found.",
        404,
        "PAYMENT_NOT_FOUND"
      );
    }

    return formatResult(latestPayment, purchase._id);
  }

  /*
   * Only the request that successfully claimed DISPATCHING
   * reaches the provider.
   */
  let providerResponse;

  try {
    providerResponse = await initiateMpesaStkPush({
      phoneNumber: normalizedPhone,
      amountMinor: purchase.amountMinor,
      accountReference: payment._id.toString().slice(-12),
    });
  } catch (error) {
    /*
     * OAuth failure occurs before the STK POST.
     * This is the only currently recognized safe
     * pre-submission rejection.
     */
    if (
      error?.code === "MPESA_OAUTH_FAILED" &&
      error?.stage === "OAUTH" &&
      error?.requestSubmitted === false
    ) {
      await PaymentTransaction.updateOne(
        {
          _id: payment._id,
          initiationStatus:
            PAYMENT_INITIATION_STATUSES.DISPATCHING,
          verificationStatus:
            PAYMENT_VERIFICATION_STATUSES.UNVERIFIED,
        },
        {
          $set: {
            initiationStatus:
              PAYMENT_INITIATION_STATUSES.REJECTED,
            status: PAYMENT_STATUSES.FAILED,
            failureReason: "UNKNOWN",
            failureMessage:
              "M-Pesa authorization failed before the STK request was submitted.",
            initiationErrorCode: "MPESA_OAUTH_FAILED",
          },
          $inc: {
            __v: 1,
          },
        }
      );

      const rejectedPayment =
        await PaymentTransaction.findById(payment._id);

      if (!rejectedPayment) {
        throw createError(
          "Payment rejection could not be confirmed.",
          503,
          "PAYMENT_STATE_UNCERTAIN"
        );
      }

      return formatResult(rejectedPayment, purchase._id);
    }

    /*
     * Once the STK POST might have been submitted,
     * network and provider errors are UNKNOWN.
     */
    const unknownPayment = await markPaymentUnknown({
      paymentId: payment._id,
      errorCode:
        typeof error?.code === "string"
          ? error.code.slice(0, 100)
          : "MPESA_INITIATION_UNKNOWN",
    });

    return formatResult(unknownPayment, purchase._id);
  }

  if (
    !providerResponse?.accepted ||
    typeof providerResponse.checkoutRequestId !== "string" ||
    !providerResponse.checkoutRequestId.trim() ||
    typeof providerResponse.merchantRequestId !== "string" ||
    !providerResponse.merchantRequestId.trim()
  ) {
    const unknownPayment = await markPaymentUnknown({
      paymentId: payment._id,
      errorCode: "MPESA_RESPONSE_IDENTIFIERS_MISSING",
    });

    return formatResult(unknownPayment, purchase._id);
  }

  /*
   * Safaricom accepted the STK request.
   * This is not proof of payment.
   */
  try {
    const acceptedPayment =
      await PaymentTransaction.findOneAndUpdate(
        {
          _id: payment._id,
          initiationStatus:
            PAYMENT_INITIATION_STATUSES.DISPATCHING,
          verificationStatus:
            PAYMENT_VERIFICATION_STATUSES.UNVERIFIED,
        },
        {
          $set: {
            initiationStatus:
              PAYMENT_INITIATION_STATUSES.ACCEPTED,
            status: PAYMENT_STATUSES.PROCESSING,
            providerTransactionId:
              providerResponse.checkoutRequestId.trim(),
            merchantRequestId:
              providerResponse.merchantRequestId.trim(),
            initiationAcceptedAt: new Date(),
            initiationErrorCode: null,
          },
          $inc: {
            __v: 1,
          },
        },
        {
          new: true,
          runValidators: true,
        }
      );

    if (!acceptedPayment) {
      throw createError(
        "Provider acceptance could not be saved.",
        503,
        "MPESA_ACCEPTANCE_PERSISTENCE_FAILED"
      );
    }

    return formatResult(acceptedPayment, purchase._id);
  } catch (error) {
    /*
     * Safaricom may already have accepted the request.
     * Never send it again because local persistence failed.
     */
    const unknownPayment = await markPaymentUnknown({
      paymentId: payment._id,
      errorCode: "MPESA_ACCEPTANCE_PERSISTENCE_FAILED",
    });

    return formatResult(unknownPayment, purchase._id);
  }
};
