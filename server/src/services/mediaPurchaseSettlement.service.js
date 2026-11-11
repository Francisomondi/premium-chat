
import mongoose from "mongoose";

import PaymentTransaction from "../models/PaymentTransaction.model.js";
import MpesaCallbackEvent, {
  MPESA_CALLBACK_EVENT_STATUSES,
  MPESA_CALLBACK_SETTLEMENT_STATUSES,
} from "../models/MpesaCallbackEvent.model.js";

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
  fetchAuthenticatedMerchantTransaction,
  MERCHANT_RECONCILIATION_STATUSES,
} from "../payments/mpesa/mpesaMerchantReconciliation.adapter.js";

import {
  getMpesaConfig,
} from "../payments/mpesa/mpesa.config.js";

import {
  validateMerchantTransactionEvidence,
} from "./mpesaMerchantEvidenceValidation.service.js";

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
 * Validate the payment and purchase relationship.
 * This function does not trust client-supplied evidence.
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

  if (
    purchase.status !== MEDIA_PURCHASE_STATUSES.PENDING
  ) {
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
  expectedEvidenceSource =
    FINANCIAL_EVIDENCE_SOURCES.PROVIDER_SETTLEMENT,
  expectedReceiptNumber,
  expectedEvidenceReference,
}) => {
  if (!payment || !purchase || !verification) {
    return false;
  }

  const isStkQueryEvidence =
    expectedEvidenceSource ===
    FINANCIAL_EVIDENCE_SOURCES.DARAJA_STK_QUERY;

  const receiptMatches = isStkQueryEvidence
    ? payment.providerReceipt === null &&
      verification.mpesaReceiptNumber === null
    : validString(payment.providerReceipt) &&
      verification.mpesaReceiptNumber ===
        payment.providerReceipt;

  const evidenceReferenceMatches =
    !expectedEvidenceReference ||
    verification.evidenceReference ===
      expectedEvidenceReference;

  const expectedReceiptMatches =
    expectedReceiptNumber === undefined ||
    verification.mpesaReceiptNumber ===
      expectedReceiptNumber;

  return Boolean(
    payment.purpose === PAYMENT_PURPOSES.MEDIA_PURCHASE &&
    payment.provider === PAYMENT_PROVIDERS.MPESA &&
    !payment.subscriptionId &&
    payment.status === PAYMENT_STATUSES.SUCCEEDED &&
    payment.verificationStatus ===
      PAYMENT_VERIFICATION_STATUSES.VERIFIED &&
    purchase.status === MEDIA_PURCHASE_STATUSES.ACTIVE &&
    verification.status ===
      FINANCIAL_VERIFICATION_STATUSES.VERIFIED &&
    verification.evidenceSource ===
      expectedEvidenceSource &&
    verification.provider === PAYMENT_PROVIDERS.MPESA &&
    verification.subscriptionId === null &&
    verification.providerTransactionId ===
      payment.providerTransactionId &&
    validString(payment.providerTransactionId) &&
    receiptMatches &&
    expectedReceiptMatches &&
    evidenceReferenceMatches &&
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


/**
 * Build the standard response for an already-settled purchase.
 */
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
 * Validate authenticated merchant evidence against
 * the exact payment being settled.
 */
const validateMerchantEvidence = ({
  payment,
  evidence,
}) => {
  if (
    !evidence ||
    evidence.status !== MERCHANT_RECONCILIATION_STATUSES.VERIFIED ||
    evidence.authenticated !== true ||
    !evidence.transaction ||
    !validString(evidence.evidenceReference)
  ) {
    fail(
      "AUTHORITATIVE_FINANCIAL_VERIFICATION_UNAVAILABLE",
      503
    );
  }

  const config = getMpesaConfig();

  const validation = validateMerchantTransactionEvidence({
    payment,
    transaction: evidence.transaction,
    expectedMerchantShortcode: config.shortcode,
  });

  if (!validation.valid) {
    fail(validation.reason, 422);
  }

  return {
    receiptNumber: evidence.transaction.receiptNumber,
    amountMinor: evidence.transaction.amountMinor,
    currency: evidence.transaction.currency,
    evidenceReference: evidence.evidenceReference.trim(),
  };
};

const commitMediaPurchaseSettlement = async ({
  paymentId,
  settlement,
  evidenceSource =
    FINANCIAL_EVIDENCE_SOURCES.PROVIDER_SETTLEMENT,
  callbackEventId = null,
  settlementLeaseOwner = null,
}) => {
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

            let callbackEvent = null;

      if (
        evidenceSource ===
        FINANCIAL_EVIDENCE_SOURCES.DARAJA_STK_QUERY
      ) {
          if (!validObjectId(callbackEventId)) {
            fail("INVALID_CALLBACK_EVENT_ID");
          }

          if (!validString(settlementLeaseOwner)) {
            fail("INVALID_SETTLEMENT_LEASE_OWNER");
          }

        callbackEvent =
          await MpesaCallbackEvent.findOne({
            _id: callbackEventId,
            status: MPESA_CALLBACK_EVENT_STATUSES.RECONCILED,
            settlementStatus: {
              $in: [
                MPESA_CALLBACK_SETTLEMENT_STATUSES.PENDING,
                MPESA_CALLBACK_SETTLEMENT_STATUSES.PROCESSING,
                MPESA_CALLBACK_SETTLEMENT_STATUSES.RETRY_SCHEDULED,
              ],
            },

            settlementLeaseOwner,

              settlementLeaseExpiresAt: {
                $gt: new Date(),
            },
            hasConflict: false,
            manualReviewRequiredAt: null,
            paymentId: payment._id,
            checkoutRequestId:
              payment.providerTransactionId,
            "stkQueryEvidence.authenticatedQuery": true,
            "stkQueryEvidence.checkoutRequestId":
              payment.providerTransactionId,
            "stkQueryEvidence.resultCode": "0",
          }).session(session);

        if (!callbackEvent) {
          fail(
            "RECONCILED_STK_QUERY_CALLBACK_EVIDENCE_NOT_FOUND",
            409
          );
        }

        if (
          !validString(
            callbackEvent.stkQueryEvidence.evidenceReference
          )
        ) {
          fail("STK_QUERY_EVIDENCE_REFERENCE_MISSING", 409);
        }

        if (
          settlement.evidenceReference !==
          callbackEvent.stkQueryEvidence.evidenceReference
        ) {
          fail("STK_QUERY_EVIDENCE_REFERENCE_MISMATCH", 409);
        }
      }

      /**
       * Idempotent replay:
       * accept only an exact previously committed settlement.
       */
      if (
        payment.status === PAYMENT_STATUSES.SUCCEEDED &&
        payment.verificationStatus ===
          PAYMENT_VERIFICATION_STATUSES.VERIFIED &&
        purchase.status === MEDIA_PURCHASE_STATUSES.ACTIVE
      ) {
        const existing =
          await MpesaFinancialVerification.findOne({
            paymentId: payment._id,
          }).session(session);

        if (
          isExactCommittedMediaSettlement({
            payment,
            purchase,
            verification: existing,
            expectedEvidenceSource: evidenceSource,
            expectedReceiptNumber: settlement.receiptNumber,
            expectedEvidenceReference:
              settlement.evidenceReference,
          }) &&
          existing.verifiedAmountMinor === settlement.amountMinor &&
          existing.verifiedCurrency === settlement.currency
        ) {
          result = buildAlreadySettledResult({
            payment,
            purchase,
          });

          return;
        }

        fail("CONFLICTING_EXISTING_MEDIA_SETTLEMENT", 409);
      }



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

            const now =
        evidenceSource ===
        FINANCIAL_EVIDENCE_SOURCES.DARAJA_STK_QUERY
          ? callbackEvent.stkQueryEvidence.queriedAt
          : new Date();

      if (!validDate(now)) {
        fail("INVALID_SETTLEMENT_VERIFICATION_TIMESTAMP", 409);
      }

      await MpesaFinancialVerification.create(
        [
          {
            paymentId: payment._id,
            subscriptionId: null,
            provider: PAYMENT_PROVIDERS.MPESA,
            status: FINANCIAL_VERIFICATION_STATUSES.VERIFIED,
            evidenceSource,
            providerTransactionId:
              payment.providerTransactionId,
            mpesaReceiptNumber: settlement.receiptNumber,
            verifiedAmountMinor: settlement.amountMinor,
            verifiedCurrency: settlement.currency,
            verifiedAt: now,
            evidenceReference: settlement.evidenceReference,
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
              providerReceipt: settlement.receiptNumber,
              verifiedAt: now,
              paidAt: now,
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
              activatedAt: now,
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
 * Record a media-purchase settlement using only the
 * authenticated merchant reconciliation adapter.
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

  const isAlreadySettled =
    payment.status === PAYMENT_STATUSES.SUCCEEDED &&
    payment.verificationStatus ===
      PAYMENT_VERIFICATION_STATUSES.VERIFIED &&
    purchase.status === MEDIA_PURCHASE_STATUSES.ACTIVE;

  /**
   * Handle an exact replay before contacting the provider.
   * This allows safe retries even when the provider adapter
   * is temporarily unavailable.
   */
  if (isAlreadySettled) {
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


  /**
   * This adapter currently fails closed until the
   * authenticated Safaricom merchant integration exists.
   */
  const evidence =
    await fetchAuthenticatedMerchantTransaction({
      receiptNumber:
        payment.transactionStatusEnquiry?.receiptNumber,
    });

  const settlement = validateMerchantEvidence({
    payment,
    evidence,
  });

  return commitMediaPurchaseSettlement({
    paymentId: payment._id,
    settlement,
  });
};

/**
 * Record a media-purchase settlement using authenticated
 * Daraja STK Query evidence.
 *
 * Callback financial metadata is never used as proof
 * of amount or receipt.
 */
export const recordMediaPurchaseStkQuerySettlement = async ({
  paymentId,
  callbackEventId,
  settlementLeaseOwner,
} = {}) => {
  if (!validObjectId(paymentId)) {
    fail("INVALID_PAYMENT_ID");
  }

  if (!validObjectId(callbackEventId)) {
    fail("INVALID_CALLBACK_EVENT_ID");
  }

  if (!validString(settlementLeaseOwner)) {
  fail("INVALID_SETTLEMENT_LEASE_OWNER");
}

  const payment =
    await PaymentTransaction.findById(paymentId);

  if (!payment) {
    fail("PAYMENT_NOT_FOUND", 404);
  }

  if (
    payment.purpose !== PAYMENT_PURPOSES.MEDIA_PURCHASE ||
    payment.provider !== PAYMENT_PROVIDERS.MPESA ||
    payment.subscriptionId ||
    !validString(payment.providerTransactionId)
  ) {
    fail("NOT_A_VALID_MPESA_MEDIA_PURCHASE_PAYMENT");
  }

  const purchase =
    await MediaPurchase.findOne({
      paymentId: payment._id,
    });

  if (!purchase) {
    fail("MEDIA_PURCHASE_NOT_FOUND", 404);
  }

  validateMediaPaymentRelationship({
    payment,
    purchase,
  });

  const callbackEvent =
    await MpesaCallbackEvent.findOne({
      _id: callbackEventId,
      paymentId: payment._id,
      checkoutRequestId:
        payment.providerTransactionId,
      status: MPESA_CALLBACK_EVENT_STATUSES.RECONCILED,
      settlementStatus: {
        $in: [
          MPESA_CALLBACK_SETTLEMENT_STATUSES.PENDING,
          MPESA_CALLBACK_SETTLEMENT_STATUSES.PROCESSING,
          MPESA_CALLBACK_SETTLEMENT_STATUSES.RETRY_SCHEDULED,
        ],
      },
      hasConflict: false,
      manualReviewRequiredAt: null,
      "stkQueryEvidence.authenticatedQuery": true,
      "stkQueryEvidence.checkoutRequestId":
        payment.providerTransactionId,
      "stkQueryEvidence.resultCode": "0",
    });

  if (!callbackEvent) {
    fail(
      "RECONCILED_STK_QUERY_CALLBACK_EVIDENCE_NOT_FOUND",
      409
    );
  }

  const queryEvidence =
    callbackEvent.stkQueryEvidence;

  if (
    !validString(queryEvidence.evidenceReference) ||
    !validDate(queryEvidence.queriedAt)
  ) {
    fail("INVALID_STK_QUERY_EVIDENCE", 409);
  }

  const settlement = {
    receiptNumber: null,
    amountMinor: payment.amountMinor,
    currency: payment.currency,
    evidenceReference:
      queryEvidence.evidenceReference,
  };

  return commitMediaPurchaseSettlement({
    paymentId: payment._id,
    settlement,
    evidenceSource:
      FINANCIAL_EVIDENCE_SOURCES.DARAJA_STK_QUERY,
    callbackEventId,
    settlementLeaseOwner,
  });
};

export default {
  recordMediaPurchaseSettlement,
  recordMediaPurchaseStkQuerySettlement,
};
