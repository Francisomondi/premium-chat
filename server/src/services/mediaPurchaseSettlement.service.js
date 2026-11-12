
import mongoose from "mongoose";

import PaymentTransaction from "../models/PaymentTransaction.model.js";

import MpesaCallbackEvent from "../models/MpesaCallbackEvent.model.js";

import MediaPurchase, {
  MEDIA_PURCHASE_STATUSES,
} from "../models/MediaPurchase.model.js";

import MpesaFinancialVerification, {
  FINANCIAL_VERIFICATION_STATUSES,
  FINANCIAL_EVIDENCE_SOURCES,
} from "../models/MpesaFinancialVerification.model.js";

import {
  PAYMENT_PURPOSES,
  PAYMENT_PROVIDERS,
  PAYMENT_STATUSES,
  PAYMENT_VERIFICATION_STATUSES,
} from "../constants/payment.constants.js";

import {
  queryMpesaStkStatus,
} from "../payments/mpesa/mpesa.client.js";

import AppError from "../utils/AppError.js";

const validObjectId = (value) =>
  typeof value === "string" &&
  mongoose.isObjectIdOrHexString(value);

const sameId = (a, b) =>
  Boolean(a && b) && String(a) === String(b);

const validDate = (value) =>
  value instanceof Date && !Number.isNaN(value.getTime());

const validString = (value) =>
  typeof value === "string" && value.trim().length > 0;

const fail = (message, statusCode = 400) => {
  throw new AppError(message, statusCode);
};

/**
 * Confirm that the payment is the exact payment linked
 * to this pending media purchase.
 *
 * This validates database relationships only. It does
 * not treat callback data as financial verification.
 */
const validateMediaPaymentRelationship = ({
  payment,
  purchase,
}) => {
  if (!payment || !purchase) {
    fail("MEDIA_PURCHASE_PAYMENT_NOT_FOUND", 404);
  }

  if (
    payment.purpose !== PAYMENT_PURPOSES.MEDIA_PURCHASE ||
    payment.provider !== PAYMENT_PROVIDERS.MPESA ||
    payment.subscriptionId
  ) {
    fail("INVALID_MEDIA_PURCHASE_PAYMENT");
  }

  if (
    !sameId(payment.payerId, purchase.buyerId) ||
    !sameId(payment.creatorId, purchase.creatorId) ||
    !sameId(purchase.paymentId, payment._id)
  ) {
    fail("MEDIA_PURCHASE_PAYMENT_RELATIONSHIP_MISMATCH");
  }

  if (
    payment.amountMinor !== purchase.amountMinor ||
    payment.currency !== purchase.currency
  ) {
    fail("MEDIA_PURCHASE_PAYMENT_AMOUNT_MISMATCH");
  }

  if (
    payment.currency !== "KES" ||
    !Number.isSafeInteger(payment.amountMinor) ||
    payment.amountMinor <= 0 ||
    payment.amountMinor % 100 !== 0
  ) {
    fail("INVALID_MPESA_MEDIA_PURCHASE_AMOUNT");
  }

  if (
    payment.status !== PAYMENT_STATUSES.PENDING &&
    payment.status !== PAYMENT_STATUSES.PROCESSING
  ) {
    fail("MEDIA_PAYMENT_NOT_SETTLEABLE");
  }

  if (
    payment.verificationStatus !==
    PAYMENT_VERIFICATION_STATUSES.UNVERIFIED
  ) {
    fail("MEDIA_PAYMENT_ALREADY_VERIFIED_OR_REJECTED");
  }

  if (!validString(payment.providerTransactionId)) {
    fail("MPESA_CHECKOUT_REFERENCE_MISSING");
  }

  if (purchase.status !== MEDIA_PURCHASE_STATUSES.PENDING) {
    fail("MEDIA_PURCHASE_NOT_PENDING");
  }

  if (
    payment.entitlementAppliedAt ||
    payment.verifiedAt ||
    payment.paidAt ||
    payment.providerReceipt
  ) {
    fail("MEDIA_PAYMENT_ALREADY_HAS_SETTLEMENT_FIELDS");
  }
};

const isExactCommittedMediaSettlement = ({
  payment,
  purchase,
  verification,
}) => {
  if (!payment || !purchase || !verification) {
    return false;
  }

  return Boolean(
    payment.purpose === PAYMENT_PURPOSES.MEDIA_PURCHASE &&
    payment.provider === PAYMENT_PROVIDERS.MPESA &&
    !payment.subscriptionId &&
    payment.status === PAYMENT_STATUSES.SUCCEEDED &&
    payment.verificationStatus ===
      PAYMENT_VERIFICATION_STATUSES.VERIFIED &&
    payment.providerReceipt === null &&
    purchase.status === MEDIA_PURCHASE_STATUSES.ACTIVE &&
    verification.status ===
      FINANCIAL_VERIFICATION_STATUSES.VERIFIED &&
    verification.evidenceSource ===
      FINANCIAL_EVIDENCE_SOURCES.DARAJA_STK_QUERY &&
    verification.provider === PAYMENT_PROVIDERS.MPESA &&
    verification.subscriptionId === null &&
    verification.providerTransactionId ===
      payment.providerTransactionId &&
    validString(payment.providerTransactionId) &&
    verification.mpesaReceiptNumber === null &&
    verification.verifiedAmountMinor === payment.amountMinor &&
    verification.verifiedCurrency === payment.currency &&
    verification.verifiedCurrency === "KES" &&
    validDate(verification.verifiedAt) &&
    validDate(payment.verifiedAt) &&
    validDate(payment.paidAt) &&
    sameId(purchase.paymentId, payment._id) &&
    sameId(purchase.buyerId, payment.payerId) &&
    sameId(purchase.creatorId, payment.creatorId) &&
    purchase.amountMinor === payment.amountMinor &&
    purchase.currency === payment.currency &&
    validDate(purchase.activatedAt)
  );
};

const buildAlreadySettledResult = ({
  payment,
  purchase,
}) => ({
  settled: true,
  alreadySettled: true,
  paymentId: payment._id.toString(),
  purchaseId: purchase._id.toString(),
  mediaAccessGranted: true,
});

/**
 * Locate the callback already matched to this payment.
 *
 * The callback is only used to establish that Safaricom
 * returned a callback for this exact checkout. Its result
 * code, amount, receipt and phone are not trusted as
 * financial verification.
 */
const findMatchingCallback = async ({
  payment,
}) => {
  const callbackEvent = await MpesaCallbackEvent.findOne({
    paymentId: payment._id,
    checkoutRequestId: payment.providerTransactionId,
    hasConflict: false,
  }).lean();

  if (!callbackEvent) {
    fail("MATCHING_MPESA_CALLBACK_NOT_FOUND", 409);
  }

  if (
    validString(payment.merchantRequestId) &&
    validString(callbackEvent.merchantRequestId) &&
    callbackEvent.merchantRequestId !== payment.merchantRequestId
  ) {
    fail("MPESA_CALLBACK_MERCHANT_REFERENCE_MISMATCH", 409);
  }

  return callbackEvent;
};

/**
 * Query Safaricom directly for the exact CheckoutRequestID.
 *
 * Only a successful authenticated STK Query response for
 * the same checkout can proceed to settlement.
 */
const verifyStkQuery = async ({
  payment,
}) => {
  const checkoutRequestId = payment.providerTransactionId;

  const query = await queryMpesaStkStatus({
    checkoutRequestId,
  });

  if (
    !query ||
    query.checkoutRequestId !== checkoutRequestId ||
    query.responseCode !== "0" ||
    query.resultCode !== "0" ||
    query.providerReportsSuccess !== true
  ) {
    fail("MPESA_STK_QUERY_HAS_NOT_CONFIRMED_SUCCESS", 409);
  }

  if (
    validString(payment.merchantRequestId) &&
    validString(query.merchantRequestId) &&
    query.merchantRequestId !== payment.merchantRequestId
  ) {
    fail("MPESA_STK_QUERY_MERCHANT_REFERENCE_MISMATCH", 409);
  }

  return {
    evidenceReference:
      `daraja-stk-query:${checkoutRequestId}`,
    verifiedAt: new Date(),
  };
};

/**
 * Atomically record the STK Query verification and activate
 * the linked media purchase.
 *
 * The financial verification record, payment update and
 * purchase activation commit together or not at all.
 */
const commitMediaPurchaseSettlement = async ({
  paymentId,
  evidenceReference,
  verifiedAt,
}) => {
  if (!validObjectId(paymentId)) {
    fail("INVALID_PAYMENT_ID");
  }

  if (!validString(evidenceReference) || !validDate(verifiedAt)) {
    fail("INVALID_STK_QUERY_EVIDENCE");
  }

  const session = await mongoose.startSession();

  try {
    let result;

    await session.withTransaction(async () => {
      const payment = await PaymentTransaction.findById(
        paymentId
      ).session(session);

      if (!payment) {
        fail("PAYMENT_NOT_FOUND", 404);
      }

      const purchase = await MediaPurchase.findOne({
        paymentId: payment._id,
      }).session(session);

      if (!purchase) {
        fail("MEDIA_PURCHASE_NOT_FOUND", 404);
      }

      /**
       * Exact replay is safe. Do not query Safaricom again
       * or create another financial verification record.
       */
      if (
        payment.status === PAYMENT_STATUSES.SUCCEEDED &&
        payment.verificationStatus ===
          PAYMENT_VERIFICATION_STATUSES.VERIFIED &&
        purchase.status === MEDIA_PURCHASE_STATUSES.ACTIVE
      ) {
        const existingVerification =
          await MpesaFinancialVerification.findOne({
            paymentId: payment._id,
          }).session(session);

        if (
          isExactCommittedMediaSettlement({
            payment,
            purchase,
            verification: existingVerification,
          })
        ) {
          result = buildAlreadySettledResult({
            payment,
            purchase,
          });

          return;
        }

        fail("CONFLICTING_EXISTING_MEDIA_SETTLEMENT", 409);
      }

      validateMediaPaymentRelationship({
        payment,
        purchase,
      });

      const existingVerification =
        await MpesaFinancialVerification.findOne({
          paymentId: payment._id,
        }).session(session);

      if (existingVerification) {
        fail(
          "FINANCIAL_VERIFICATION_RECORD_ALREADY_EXISTS",
          409
        );
      }

      await MpesaFinancialVerification.create(
        [
          {
            paymentId: payment._id,
            subscriptionId: null,
            provider: PAYMENT_PROVIDERS.MPESA,
            status: FINANCIAL_VERIFICATION_STATUSES.VERIFIED,
            evidenceSource:
              FINANCIAL_EVIDENCE_SOURCES.DARAJA_STK_QUERY,
            providerTransactionId:
              payment.providerTransactionId,
            mpesaReceiptNumber: null,
            verifiedAmountMinor: payment.amountMinor,
            verifiedCurrency: payment.currency,
            verifiedAt,
            evidenceReference,
            requiresManualReview: false,
            manualReviewReason: null,
          },
        ],
        { session }
      );

      const paymentUpdate =
        await PaymentTransaction.updateOne(
          {
            _id: payment._id,
            __v: payment.__v,
            purpose: PAYMENT_PURPOSES.MEDIA_PURCHASE,
            provider: PAYMENT_PROVIDERS.MPESA,
            status: {
              $in: [
                PAYMENT_STATUSES.PENDING,
                PAYMENT_STATUSES.PROCESSING,
              ],
            },
            verificationStatus:
              PAYMENT_VERIFICATION_STATUSES.UNVERIFIED,
            providerReceipt: null,
            verifiedAt: null,
            paidAt: null,
            entitlementAppliedAt: null,
          },
          {
            $set: {
              status: PAYMENT_STATUSES.SUCCEEDED,
              verificationStatus:
                PAYMENT_VERIFICATION_STATUSES.VERIFIED,
              providerReceipt: null,
              verifiedAt,
              paidAt: verifiedAt,
            },
            $inc: { __v: 1 },
          },
          { session }
        );

      if (paymentUpdate.modifiedCount !== 1) {
        fail("MEDIA_PAYMENT_CONCURRENTLY_MODIFIED", 409);
      }

      const purchaseUpdate =
        await MediaPurchase.updateOne(
          {
            _id: purchase._id,
            paymentId: payment._id,
            buyerId: payment.payerId,
            creatorId: payment.creatorId,
            status: MEDIA_PURCHASE_STATUSES.PENDING,
          },
          {
            $set: {
              status: MEDIA_PURCHASE_STATUSES.ACTIVE,
              activatedAt: verifiedAt,
            },
          },
          { session }
        );

      if (purchaseUpdate.modifiedCount !== 1) {
        fail("MEDIA_PURCHASE_CONCURRENTLY_MODIFIED", 409);
      }

      result = {
        settled: true,
        alreadySettled: false,
        paymentId: payment._id.toString(),
        purchaseId: purchase._id.toString(),
        mediaAccessGranted: true,
      };
    });

    return result;
  } finally {
    await session.endSession();
  }
};

/**
 * Main paid-media settlement entry point.
 *
 * Kept under the existing export name so existing imports
 * do not break. It now uses Daraja STK Query, not merchant
 * settlement reconciliation.
 */
export const recordMediaPurchaseSettlement = async ({
  paymentId,
} = {}) => {
  if (!validObjectId(paymentId)) {
    fail("INVALID_PAYMENT_ID");
  }

  const payment = await PaymentTransaction.findById(paymentId);

  if (!payment) {
    fail("PAYMENT_NOT_FOUND", 404);
  }

  if (
    payment.purpose !== PAYMENT_PURPOSES.MEDIA_PURCHASE ||
    payment.provider !== PAYMENT_PROVIDERS.MPESA ||
    payment.subscriptionId
  ) {
    fail("NOT_A_VALID_MPESA_MEDIA_PURCHASE_PAYMENT");
  }

  const purchase = await MediaPurchase.findOne({
    paymentId: payment._id,
  });

  if (!purchase) {
    fail("MEDIA_PURCHASE_NOT_FOUND", 404);
  }

  /**
   * Do not make another provider request for an exact
   * previously committed settlement.
   */
  if (
    payment.status === PAYMENT_STATUSES.SUCCEEDED &&
    payment.verificationStatus ===
      PAYMENT_VERIFICATION_STATUSES.VERIFIED &&
    purchase.status === MEDIA_PURCHASE_STATUSES.ACTIVE
  ) {
    const existingVerification =
      await MpesaFinancialVerification.findOne({
        paymentId: payment._id,
      });

    if (
      isExactCommittedMediaSettlement({
        payment,
        purchase,
        verification: existingVerification,
      })
    ) {
      return buildAlreadySettledResult({
        payment,
        purchase,
      });
    }

    fail("CONFLICTING_EXISTING_MEDIA_SETTLEMENT", 409);
  }

  validateMediaPaymentRelationship({
    payment,
    purchase,
  });

  /**
   * A callback must already have been correlated to this
   * payment and checkout before STK Query is attempted.
   */
  await findMatchingCallback({ payment });

  const queryEvidence = await verifyStkQuery({ payment });

  return commitMediaPurchaseSettlement({
    paymentId: payment._id,
    evidenceReference: queryEvidence.evidenceReference,
    verifiedAt: queryEvidence.verifiedAt,
  });
};

/**
 * Backward-compatible export for callers that previously
 * supplied callback IDs and settlement lease owners.
 *
 * Those lease arguments are deliberately ignored. The
 * service now performs its own callback match and STK Query.
 */
export const recordMediaPurchaseStkQuerySettlement = async ({
  paymentId,
} = {}) =>
  recordMediaPurchaseSettlement({ paymentId });

export default {
  recordMediaPurchaseSettlement,
  recordMediaPurchaseStkQuerySettlement,
};
