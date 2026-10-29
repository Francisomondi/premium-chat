import mongoose from "mongoose";
import { randomUUID } from "node:crypto";

import PaymentTransaction from "../models/PaymentTransaction.model.js";

import MpesaCallbackEvent from "../models/MpesaCallbackEvent.model.js";

import {
  PAYMENT_PROVIDERS,
  PAYMENT_STATUSES,
  PAYMENT_VERIFICATION_STATUSES,
} from "../constants/payment.constants.js";

import {
  queryMpesaTransactionStatus,
} from "../payments/mpesa/mpesa.client.js";

/**
 * ============================================================
 * PREMIUMCHAT — M-PESA TRANSACTION STATUS ENQUIRY SERVICE
 * ============================================================
 *
 * Module 4.3.5.7.8.13.24
 *
 * Responsibilities:
 *
 * - Identify payments eligible for financial enquiries.
 * - Obtain the receipt from a stored STK callback.
 * - Prevent concurrent enquiries.
 * - Persist Safaricom conversation identifiers.
 * - Prevent automatic duplicate external requests.
 * - Preserve payment verification security.
 *
 * SECURITY:
 *
 * - STK callbacks are not authoritative settlement proof.
 * - Enquiry acceptance is not settlement verification.
 * - No payment is marked SUCCEEDED here.
 * - No subscription is activated here.
 * - Ambiguous external outcomes remain fail-closed.
 */

const CLAIM_DURATION_MS = 90_000;

const isValidPaymentId = (value) =>
  typeof value === "string" &&
  mongoose.isObjectIdOrHexString(value);

const validReceipt = (value) =>
  typeof value === "string" &&
  /^[A-Za-z0-9]{8,30}$/.test(value);

const validConversationId = (value) =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= 255;

/**
 * ============================================================
 * RESULT HELPER
 * ============================================================
 */

const result = ({
  initiated = false,
  reason,
  paymentId,
  conversationId = null,
  originatorConversationId = null,
}) => ({
  initiated,
  reason,
  paymentId,
  conversationId,
  originatorConversationId,
  paymentVerified: false,
  subscriptionActivated: false,
});

/**
 * ============================================================
 * LOAD ELIGIBLE CALLBACK
 * ============================================================
 *
 * The callback provides a candidate receipt.
 *
 * It does not independently establish settlement.
 */

const loadEligibleCallback = async (payment) => {
  const callback = await MpesaCallbackEvent.findOne({
    paymentId: payment._id,
    checkoutRequestId: payment.providerTransactionId,
    merchantRequestId: payment.merchantRequestId,
    resultCode: 0,
  }).lean();

  if (!callback) {
    return {
      eligible: false,
      reason: "SUCCESS_CALLBACK_NOT_FOUND",
    };
  }

  if (!validReceipt(callback.reportedReceipt)) {
    return {
      eligible: false,
      reason: "INVALID_CALLBACK_RECEIPT",
    };
  }

  if (
    !Number.isSafeInteger(callback.reportedAmountMinor) ||
    callback.reportedAmountMinor !== payment.amountMinor
  ) {
    return {
      eligible: false,
      reason: "CALLBACK_AMOUNT_MISMATCH",
    };
  }

  /*
   * The callback must not already be under review.
   *
   * The exact conflict fields must match the
   * existing MpesaCallbackEvent schema.
   */

  if (
    callback.requiresManualReview === true ||
    callback.conflictDetected === true
  ) {
    return {
      eligible: false,
      reason: "CALLBACK_REQUIRES_REVIEW",
    };
  }

  return {
    eligible: true,
    receiptNumber: callback.reportedReceipt,
  };
};

/**
 * ============================================================
 * ATOMIC ENQUIRY CLAIM
 * ============================================================
 *
 * Only one worker can claim a payment whose
 * enquiry has not previously been requested.
 *
 * Do not automatically retry an expired claim:
 * the original request may have reached Safaricom.
 */

const claimEnquiry = async ({
  paymentId,
  receiptNumber,
}) => {
  const now = new Date();

  const claimToken = randomUUID();

  const claimExpiresAt = new Date(
    now.getTime() + CLAIM_DURATION_MS
  );

  const payment =
    await PaymentTransaction.findOneAndUpdate(
      {
        _id: paymentId,

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

        entitlementAppliedAt: null,

        $or: [
          {
            "transactionStatusEnquiry.requestedAt": null,
          },
          {
            transactionStatusEnquiry: {
              $exists: false,
            },
          },
        ],
      },

      {
        $set: {
          "transactionStatusEnquiry.receiptNumber":
            receiptNumber,

          "transactionStatusEnquiry.status":
            "PENDING",

          "transactionStatusEnquiry.requestedAt":
            now,

          "transactionStatusEnquiry.claimToken":
            claimToken,

          "transactionStatusEnquiry.claimExpiresAt":
            claimExpiresAt,

          "transactionStatusEnquiry.lastErrorCode":
            null,
        },
      },

      {
        new: true,
        runValidators: true,
      }
    );

  if (!payment) {
    return null;
  }

  return {
    payment,
    claimToken,
  };
};

/**
 * ============================================================
 * INITIATE TRANSACTION STATUS ENQUIRY
 * ============================================================
 */

export const initiateMpesaTransactionStatusEnquiry =
  async ({ paymentId } = {}) => {
    if (!isValidPaymentId(paymentId)) {
      return result({
        reason: "INVALID_PAYMENT_ID",
        paymentId: null,
      });
    }

    const payment =
      await PaymentTransaction.findById(paymentId);

    if (!payment) {
      return result({
        reason: "PAYMENT_NOT_FOUND",
        paymentId,
      });
    }

    if (
      payment.provider !== PAYMENT_PROVIDERS.MPESA
    ) {
      return result({
        reason: "UNSUPPORTED_PAYMENT_PROVIDER",
        paymentId,
      });
    }

    if (
      ![
        PAYMENT_STATUSES.PENDING,
        PAYMENT_STATUSES.PROCESSING,
      ].includes(payment.status) ||
      payment.verificationStatus !==
        PAYMENT_VERIFICATION_STATUSES.UNVERIFIED
    ) {
      return result({
        reason: "PAYMENT_NOT_ELIGIBLE",
        paymentId,
      });
    }

    if (
      !payment.providerTransactionId ||
      !payment.merchantRequestId ||
      !payment.subscriptionId
    ) {
      return result({
        reason: "PAYMENT_PROVIDER_REFERENCES_MISSING",
        paymentId,
      });
    }

    /*
     * An enquiry that has already been attempted
     * must not be automatically sent again.
     */

    if (
      payment.transactionStatusEnquiry?.requestedAt
    ) {
      return result({
        reason: "ENQUIRY_ALREADY_REQUESTED",
        paymentId,
        conversationId:
          payment.transactionStatusEnquiry
            ?.conversationId || null,
        originatorConversationId:
          payment.transactionStatusEnquiry
            ?.originatorConversationId || null,
      });
    }

    /*
     * Locate the stored successful callback.
     */

    const callbackResult =
      await loadEligibleCallback(payment);

    if (!callbackResult.eligible) {
      return result({
        reason: callbackResult.reason,
        paymentId,
      });
    }

    /*
     * Atomically claim the enquiry.
     *
     * Only the successful claimant may call
     * Safaricom.
     */

    const claim = await claimEnquiry({
      paymentId,
      receiptNumber:
        callbackResult.receiptNumber,
    });

    if (!claim) {
      return result({
        reason: "ENQUIRY_ALREADY_CLAIMED",
        paymentId,
      });
    }

    const { claimToken } = claim;

    /*
     * Send the Transaction Status enquiry.
     */

    try {
      const response =
        await queryMpesaTransactionStatus({
          receiptNumber:
            callbackResult.receiptNumber,
        });

      if (
        !response.accepted ||
        !validConversationId(
          response.conversationId
        ) ||
        !validConversationId(
          response.originatorConversationId
        )
      ) {
        throw new Error(
          "INVALID_PROVIDER_ENQUIRY_RESPONSE"
        );
      }

      /*
       * Persist the accepted enquiry.
       *
       * The claim token prevents a stale worker
       * from overwriting another worker's data.
       */

      const updated =
        await PaymentTransaction.findOneAndUpdate(
          {
            _id: paymentId,

            "transactionStatusEnquiry.claimToken":
              claimToken,

            "transactionStatusEnquiry.status":
              "PENDING",
          },

          {
            $set: {
              "transactionStatusEnquiry.status":
                "ACCEPTED",

              "transactionStatusEnquiry.conversationId":
                response.conversationId,

              "transactionStatusEnquiry.originatorConversationId":
                response.originatorConversationId,

              "transactionStatusEnquiry.acceptedAt":
                new Date(),

              "transactionStatusEnquiry.lastErrorCode":
                null,
            },

            $unset: {
              "transactionStatusEnquiry.claimToken":
                "",

              "transactionStatusEnquiry.claimExpiresAt":
                "",
            },
          },

          {
            new: true,
            runValidators: true,
          }
        );

      if (!updated) {
        return result({
          reason: "ENQUIRY_RESULT_PERSISTENCE_CONFLICT",
          paymentId,
        });
      }

      return result({
        initiated: true,
        reason: "ENQUIRY_ACCEPTED",
        paymentId,
        conversationId:
          response.conversationId,
        originatorConversationId:
          response.originatorConversationId,
      });
    } catch {
      /*
       * A network timeout does not prove
       * Safaricom rejected the request.
       *
       * Do not automatically retry.
       */

      await PaymentTransaction.updateOne(
        {
          _id: paymentId,

          "transactionStatusEnquiry.claimToken":
            claimToken,

          "transactionStatusEnquiry.status":
            "PENDING",
        },

        {
          $set: {
            "transactionStatusEnquiry.status":
              "MANUAL_REVIEW",

            "transactionStatusEnquiry.lastErrorCode":
              "ENQUIRY_OUTCOME_UNKNOWN",
          },

          $unset: {
            "transactionStatusEnquiry.claimToken":
              "",

            "transactionStatusEnquiry.claimExpiresAt":
              "",
          },
        }
      );

      return result({
        reason: "ENQUIRY_OUTCOME_UNKNOWN",
        paymentId,
      });
    }
  };

export default {
  initiateMpesaTransactionStatusEnquiry,
};