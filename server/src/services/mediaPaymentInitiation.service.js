
import mongoose from 'mongoose';

import User from '../models/User.model.js';
import MediaPurchase from '../models/MediaPurchase.model.js';
import MediaPaymentDispatch from '../models/MediaPaymentDispatch.model.js';
import PaymentTransaction from '../models/PaymentTransaction.model.js';

import {
  PAYMENT_PURPOSES,
  PAYMENT_PROVIDERS,
  PAYMENT_STATUSES,
  PAYMENT_VERIFICATION_STATUSES,
  PAYMENT_INITIATION_STATUSES,
} from '../constants/payment.constants.js';

import {
  normalizeMpesaPhone,
  initiateMpesaStkPush,
} from '../payments/mpesa/mpesa.client.js';

import {
  fingerprintMpesaPhone,
} from '../payments/mpesa/mpesa.fingerprint.js';

import {
  getMpesaConfig,
} from '../payments/mpesa/mpesa.config.js';

import {
  linkMediaPurchasePayment,
} from './mediaPurchase.service.js';

import {
  authorizeMediaPaymentDispatch,
  markMediaPaymentDispatchStarted,
  recordMediaPaymentDispatchOutcome,
} from './mediaPaymentDispatch.service.js';

import AppError from '../utils/AppError.js';

const createError = (message, statusCode = 400) =>
  new AppError(message, statusCode);

const validateObjectId = (value, fieldName) => {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    throw createError(`Invalid ${fieldName}.`, 400);
  }
};

const validateClientRequestId = (value) => {
  if (
    typeof value !== 'string' ||
    !/^[A-Za-z0-9_-]{8,128}$/.test(value.trim())
  ) {
    throw createError('Invalid client request ID.', 400);
  }

  return value.trim();
};

const formatResult = (payment, extra = {}) => ({
  paymentId: payment._id.toString(),
  purchaseId: extra.purchaseId ?? null,
  status: payment.status,
  initiationStatus: payment.initiationStatus,
  amountMinor: payment.amountMinor,
  currency: payment.currency,
  checkoutRequestId: payment.providerTransactionId ?? null,
  paymentVerified: false,
  mediaAccessGranted: false,
});

const markUnknownForReconciliation = async ({
  paymentId,
  purchaseId,
  reason,
}) => {
  try {
    await recordMediaPaymentDispatchOutcome({
      paymentId,
      state: 'UNKNOWN',
      requiresManualReview: true,
      manualReviewReason: reason,
    });

    const updatedPayment =
      await PaymentTransaction.findById(paymentId);

    if (!updatedPayment) {
      throw createError(
        'Payment could not be retrieved after reconciliation.',
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
      'The M-Pesa request requires reconciliation. Do not submit a new payment request.',
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
  validateObjectId(buyerId, 'buyer ID');
  validateObjectId(purchaseId, 'purchase ID');

  const requestId = validateClientRequestId(clientRequestId);

  const config = getMpesaConfig();

  if (!config.paymentsEnabled) {
    throw createError(
      'M-Pesa payments are currently unavailable.',
      503
    );
  }

  const normalizedPhone = normalizeMpesaPhone(phoneNumber);
  const phoneFingerprint = fingerprintMpesaPhone(normalizedPhone);

  const buyer = await User.findById(buyerId);

  if (!buyer || !buyer.canAccessRestrictedContent()) {
    throw createError(
      'You are not eligible to purchase restricted media.',
      403
    );
  }

  const purchase = await MediaPurchase.findOne({
    _id: purchaseId,
    buyerId,
    status: 'PENDING',
  });

  if (!purchase) {
    throw createError('Pending media purchase not found.', 404);
  }

  if (
    !Number.isSafeInteger(purchase.amountMinor) ||
    purchase.amountMinor <= 0 ||
    purchase.currency !== 'KES' ||
    purchase.amountMinor % 100 !== 0
  ) {
    throw createError(
      'This media purchase has an invalid M-Pesa amount.',
      400
    );
  }

  /*
   * Idempotency:
   * Reuse a payment only when its request ID, buyer,
   * purchase, creator and financial snapshot match.
   */
  let payment = await PaymentTransaction.findOne({
    payerId: buyerId,
    clientRequestId: requestId,
  });

  if (payment) {
    if (
      payment.creatorId.toString() !== purchase.creatorId.toString() ||
      payment.purpose !== PAYMENT_PURPOSES.MEDIA_PURCHASE ||
      payment.provider !== PAYMENT_PROVIDERS.MPESA ||
      payment.subscriptionId ||
      payment.amountMinor !== purchase.amountMinor ||
      payment.currency !== purchase.currency
    ) {
      throw createError(
        'This request ID has already been used for another payment.',
        409
      );
    }

    if (payment.paymentPhoneFingerprint !== phoneFingerprint) {
      throw createError(
        'This request ID is already associated with a different phone number.',
        409
      );
    }

    /*
     * A purchase already linked to another payment cannot
     * be reused with this payment.
     */
    if (
      purchase.paymentId &&
      purchase.paymentId.toString() !== payment._id.toString()
    ) {
      throw createError(
        'This purchase is already linked to another payment.',
        409
      );
    }

    /*
     * A payment that has progressed beyond RESERVED must
     * already be linked to this exact purchase.
     */
    if (
      payment.initiationStatus !== PAYMENT_INITIATION_STATUSES.RESERVED &&
      (
        !purchase.paymentId ||
        purchase.paymentId.toString() !== payment._id.toString()
      )
    ) {
      throw createError(
        'The existing payment is not linked to this purchase.',
        409
      );
    }
  } else {
    /*
     * Do not create a second payment for a purchase
     * that is already linked to an existing payment.
     */
    if (purchase.paymentId) {
      throw createError(
        'This purchase is already linked to another payment.',
        409
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
        verificationStatus: PAYMENT_VERIFICATION_STATUSES.UNVERIFIED,
        initiationStatus: PAYMENT_INITIATION_STATUSES.RESERVED,
      });
    } catch (error) {
      if (error.code === 11000) {
        throw createError(
          'A payment request with this ID already exists. Retry using the same request ID.',
          409
        );
      }

      throw error;
    }
  }

  /*
   * A previously created dispatch record is authoritative
   * evidence that dispatch processing has already started.
   *
   * Never send another STK request for that purchase.
   */
  const existingDispatch = await MediaPaymentDispatch.findOne({
    mediaPurchaseId: purchase._id,
  });

  if (existingDispatch) {
    const latestPayment =
      await PaymentTransaction.findById(payment._id);

    if (!latestPayment) {
      throw createError('Payment record not found.', 404);
    }

    return formatResult(latestPayment, {
      purchaseId: purchase._id.toString(),
    });
  }

  /*
   * A non-RESERVED payment without a dispatch record
   * must not be dispatched again automatically.
   */
  if (
    payment.initiationStatus !== PAYMENT_INITIATION_STATUSES.RESERVED
  ) {
    return formatResult(payment, {
      purchaseId: purchase._id.toString(),
    });
  }

  /*
   * Link the payment to the purchase before dispatch.
   * The existing linking service remains unchanged.
   */
  await linkMediaPurchasePayment({
    buyerId,
    purchaseId,
    paymentId: payment._id,
  });

  /*
   * Atomically authorize this one-time dispatch.
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
   * A thrown error is UNKNOWN, not proof of rejection.
   */
  let providerResponse;

  try {
    providerResponse = await initiateMpesaStkPush({
      phoneNumber: normalizedPhone,
      amountMinor: purchase.amountMinor,
      accountReference: payment._id.toString().slice(-12),
    });
  } catch (error) {
    return markUnknownForReconciliation({
      paymentId: payment._id,
      purchaseId: purchase._id,
      reason: 'M-Pesa initiation outcome could not be confirmed.',
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
      reason: 'M-Pesa response did not contain the required identifiers.',
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
      state: 'ACCEPTED',
      requiresManualReview: false,
      checkoutRequestId: providerResponse.checkoutRequestId,
      merchantRequestId: providerResponse.merchantRequestId,
    });

    const updatedPayment =
      await PaymentTransaction.findById(payment._id);

    if (!updatedPayment) {
      throw createError(
        'Payment record could not be retrieved.',
        503
      );
    }

    return formatResult(updatedPayment, {
      purchaseId: purchase._id.toString(),
    });
  } catch (error) {
    /*
     * The provider may already have accepted the request.
     * Attempt to record UNKNOWN for reconciliation.
     * Never resend the STK request.
     */
    return markUnknownForReconciliation({
      paymentId: payment._id,
      purchaseId: purchase._id,
      reason:
        'M-Pesa may have accepted the request, but acceptance could not be safely persisted.',
    });
  }
};
