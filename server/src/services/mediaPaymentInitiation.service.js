
import mongoose from "mongoose";

import User from "../models/User.model.js";
import MediaPurchase from "../models/MediaPurchase.model.js";

import MediaPaymentDispatch, {
  MEDIA_DISPATCH_STATES,
} from "../models/MediaPaymentDispatch.model.js";

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

import {
  authorizeMediaPaymentDispatch,
  markMediaPaymentDispatchStarted,
  recordMediaPaymentDispatchOutcome,
} from "./mediaPaymentDispatch.service.js";

import AppError from "../utils/AppError.js";

const createError = (message, statusCode = 400) =>
  new AppError(message, statusCode);

const validateObjectId = (value, fieldName) => {
  if (!mongoose.isObjectIdOrHexString(value)) {
    throw createError(`Invalid ${fieldName}.`, 400);
  }
};

const validateClientRequestId = (value) => {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9_-]{8,128}$/.test(value.trim())
  ) {
    throw createError("Invalid client request ID.", 400);
  }

  return value.trim();
};

const formatResult = (payment, extra = {}) => {
  let message = "Payment is being prepared.";

  if (
    payment.initiationStatus ===
    PAYMENT_INITIATION_STATUSES.REJECTED
  ) {
    message =
      "M-Pesa authorization failed before the STK request was submitted. You can start a new payment attempt.";
  } else if (
    payment.initiationStatus ===
    PAYMENT_INITIATION_STATUSES.UNKNOWN
  ) {
    message =
      "The M-Pesa request outcome could not be confirmed. Do not retry until the payment is reconciled.";
  } else if (
    payment.initiationStatus ===
    PAYMENT_INITIATION_STATUSES.ACCEPTED
  ) {
    message =
      "M-Pesa accepted the request. Check your phone for the payment prompt.";
  } else if (
    payment.status === PAYMENT_STATUSES.FAILED
  ) {
    message =
      "This payment attempt failed. Start a new payment attempt if it was confirmed not submitted.";
  } else if (
    payment.status === PAYMENT_STATUSES.PROCESSING
  ) {
    message =
      "Your payment request is being processed. Check your payment status before trying again.";
  }

  return {
    paymentId: payment._id.toString(),
    purchaseId: extra.purchaseId ?? null,
    status: payment.status,
    initiationStatus: payment.initiationStatus,
    amountMinor: payment.amountMinor,
    currency: payment.currency,
    checkoutRequestId: payment.providerTransactionId ?? null,
    paymentVerified: false,
    mediaAccessGranted: false,
    message,
  };
};

const markUnknownForReconciliation = async ({
  paymentId,
  purchaseId,
  reason,
}) => {
  try {
    await recordMediaPaymentDispatchOutcome({
      paymentId,
      state: MEDIA_DISPATCH_STATES.UNKNOWN,
      requiresManualReview: true,
      manualReviewReason: reason,
    });

    const updatedPayment =
      await PaymentTransaction.findById(paymentId);

    if (!updatedPayment) {
      throw createError(
        "Payment could not be retrieved after reconciliation.",
        503
      );
    }

    return formatResult(updatedPayment, {
      purchaseId: purchaseId.toString(),
    });
  } catch (error) {
    /*
     * Never automatically retry an STK request when its
     * provider outcome or persistence outcome is uncertain.
     */
    throw createError(
      "The M-Pesa request requires reconciliation. Do not submit a new payment request.",
      503
    );
  }
};

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
      503
    );
  }

  const normalizedPhone = normalizeMpesaPhone(phoneNumber);

  const phoneFingerprint =
    fingerprintMpesaPhone(normalizedPhone);

  const buyer = await User.findById(buyerId);

  if (!buyer || !buyer.canAccessRestrictedContent()) {
    throw createError(
      "You are not eligible to purchase restricted media.",
      403
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
      404
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
      400
    );
  }

  /*
   * IDEMPOTENCY
   *
   * Reuse a payment only when its request ID, buyer,
   * purchase, creator and financial snapshot match.
   *
   * A repeated request ID must never initiate another STK.
   */
  let payment = await PaymentTransaction.findOne({
    payerId: buyerId,
    clientRequestId: requestId,
  });

  if (payment) {
    if (
      payment.creatorId.toString() !==
        purchase.creatorId.toString() ||
      payment.purpose !== PAYMENT_PURPOSES.MEDIA_PURCHASE ||
      payment.provider !== PAYMENT_PROVIDERS.MPESA ||
      payment.subscriptionId ||
      payment.amountMinor !== purchase.amountMinor ||
      payment.currency !== purchase.currency
    ) {
      throw createError(
        "This request ID has already been used for another payment.",
        409
      );
    }

    if (
      payment.paymentPhoneFingerprint !== phoneFingerprint
    ) {
      throw createError(
        "This request ID is already associated with a different phone number.",
        409
      );
    }

    /*
     * An existing payment must belong to the purchase's
     * currently linked payment attempt.
     */
    if (
      purchase.paymentId &&
      purchase.paymentId.toString() !== payment._id.toString()
    ) {
      throw createError(
        "This purchase is already linked to another payment.",
        409
      );
    }

    /*
     * A payment that has progressed beyond RESERVED must
     * already be linked to this exact purchase.
     */
    if (
      payment.initiationStatus !==
        PAYMENT_INITIATION_STATUSES.RESERVED &&
      (
        !purchase.paymentId ||
        purchase.paymentId.toString() !== payment._id.toString()
      )
    ) {
      throw createError(
        "The existing payment is not linked to this purchase.",
        409
      );
    }
  } else {
    /*
     * A purchase linked to an earlier payment can only
     * accept a new attempt after a confirmed rejection.
     *
     * UNKNOWN, ACCEPTED, DISPATCHING and all other
     * non-rejected states remain blocked.
     */
    if (purchase.paymentId) {
      const previousPayment =
        await PaymentTransaction.findById(purchase.paymentId);

      const previousDispatch =
        await MediaPaymentDispatch.findOne({
          mediaPurchaseId: purchase._id,
          paymentId: purchase.paymentId,
        });

      const previousAttemptWasDefinitelyRejected =
        previousPayment?.status === PAYMENT_STATUSES.FAILED &&
        previousPayment?.initiationStatus ===
          PAYMENT_INITIATION_STATUSES.REJECTED &&
        previousPayment?.verificationStatus ===
          PAYMENT_VERIFICATION_STATUSES.UNVERIFIED &&
        previousDispatch?.state ===
          MEDIA_DISPATCH_STATES.REJECTED &&
        previousDispatch?.requiresManualReview === false;

      if (!previousAttemptWasDefinitelyRejected) {
        throw createError(
          "This purchase is already linked to a payment that requires reconciliation.",
          409
        );
      }
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
      if (error.code === 11000) {
        throw createError(
          "A payment request with this ID already exists. Retry using the same request ID.",
          409
        );
      }

      throw error;
    }
  }

  /*
   * A dispatch record for this exact payment is authoritative
   * evidence that this payment attempt has already progressed.
   *
   * Never send another STK request for the same payment.
   */
  const existingDispatch =
    await MediaPaymentDispatch.findOne({
      paymentId: payment._id,
    });

  if (existingDispatch) {
    const latestPayment =
      await PaymentTransaction.findById(payment._id);

    if (!latestPayment) {
      throw createError(
        "Payment record not found.",
        404
      );
    }

    return formatResult(latestPayment, {
      purchaseId: purchase._id.toString(),
    });
  }

  /*
   * A non-RESERVED payment without a dispatch record must
   * not be dispatched automatically.
   */
  if (
    payment.initiationStatus !==
    PAYMENT_INITIATION_STATUSES.RESERVED
  ) {
    return formatResult(payment, {
      purchaseId: purchase._id.toString(),
    });
  }

  /*
   * Link the payment to the purchase before dispatch.
   *
   * The linking service must permit replacing an old payment
   * only when that old attempt was definitely rejected.
   */
  await linkMediaPurchasePayment({
    buyerId,
    purchaseId,
    paymentId: payment._id,
  });

  /*
   * Atomically authorize this one-time dispatch.
   *
   * A previously rejected dispatch is reused by the dispatch
   * service. An UNKNOWN or ACCEPTED dispatch blocks this step.
   */
  await authorizeMediaPaymentDispatch({
    buyerId,
    purchaseId,
    paymentId: payment._id,
  });

  /*
   * The provider must not be called unless dispatch start
   * has been successfully recorded.
   */
  await markMediaPaymentDispatchStarted({
    paymentId: payment._id,
  });

  /*
   * Provider calls happen outside MongoDB transactions.
   *
   * A thrown error is UNKNOWN unless it carries explicit
   * evidence that the STK request was never submitted.
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
     * OAuth happens before the STK POST.
     *
     * This tagged error is the only failure currently
     * classified as a confirmed pre-submission rejection.
     */
    if (
      error?.code === "MPESA_OAUTH_FAILED" &&
      error?.stage === "OAUTH" &&
      error?.requestSubmitted === false
    ) {
      try {
        await recordMediaPaymentDispatchOutcome({
          paymentId: payment._id,
          state: MEDIA_DISPATCH_STATES.REJECTED,
          requiresManualReview: false,
          manualReviewReason: null,
          confirmedNotSubmitted: true,
        });
      } catch (recordError) {
        /*
         * If rejection persistence is uncertain, do not
         * assume the attempt is retryable.
         */
        return markUnknownForReconciliation({
          paymentId: payment._id,
          purchaseId: purchase._id,
          reason:
            "OAuth failed before STK submission, but the rejection outcome could not be safely persisted.",
        });
      }

      const rejectedPayment =
        await PaymentTransaction.findById(payment._id);

      if (!rejectedPayment) {
        throw createError(
          "Rejected payment could not be retrieved.",
          503
        );
      }

      return formatResult(rejectedPayment, {
        purchaseId: purchase._id.toString(),
      });
    }

    /*
     * Network timeouts, connection resets, and unclassified
     * provider errors remain UNKNOWN. Never resend automatically.
     */
    return markUnknownForReconciliation({
      paymentId: payment._id,
      purchaseId: purchase._id,
      reason:
        "M-Pesa initiation outcome could not be confirmed.",
    });
  }

  /*
   * Missing identifiers or an unaccepted response cannot
   * be treated as confirmed settlement or safe rejection.
   */
  if (
    !providerResponse?.accepted ||
    !providerResponse?.checkoutRequestId ||
    !providerResponse?.merchantRequestId
  ) {
    return markUnknownForReconciliation({
      paymentId: payment._id,
      purchaseId: purchase._id,
      reason:
        "M-Pesa response did not contain the required identifiers.",
    });
  }

  /*
   * Record provider acceptance and identifiers atomically.
   *
   * ACCEPTED does not mean payment is verified or media
   * access can be granted.
   */
  try {
    await recordMediaPaymentDispatchOutcome({
      paymentId: payment._id,
      state: MEDIA_DISPATCH_STATES.ACCEPTED,
      requiresManualReview: false,
      checkoutRequestId: providerResponse.checkoutRequestId,
      merchantRequestId: providerResponse.merchantRequestId,
    });
  } catch (error) {
    /*
     * The provider may already have accepted the request.
     * Never resend the STK request.
     */
    return markUnknownForReconciliation({
      paymentId: payment._id,
      purchaseId: purchase._id,
      reason:
        "M-Pesa may have accepted the request, but acceptance could not be safely persisted.",
    });
  }

  const updatedPayment =
    await PaymentTransaction.findById(payment._id);

  if (!updatedPayment) {
    throw createError(
      "Payment record could not be retrieved.",
      503
    );
  }

  return formatResult(updatedPayment, {
    purchaseId: purchase._id.toString(),
  });
};
