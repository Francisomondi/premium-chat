import PaymentTransaction from "../models/PaymentTransaction.model.js";

import MpesaUnmatchedCallback, {
  MPESA_QUARANTINE_STATUSES,
} from "../models/MpesaUnmatchedCallback.model.js";

import {
  PAYMENT_PROVIDERS,
} from "../constants/payment.constants.js";

import {
  ingestMpesaCallback,
} from "./mpesaCallback.service.js";

/**
 * ============================================================
 * PREMIUMCHAT — UNMATCHED CALLBACK RECOVERY
 * ============================================================
 *
 * Recovers callbacks after provider identifiers
 * have been persisted.
 *
 * No financial verification.
 * No subscription activation.
 */

export const recoverUnmatchedMpesaCallbacks =
  async ({
    limit = 50,
  } = {}) => {
    const safeLimit =
      Number.isSafeInteger(limit) &&
      limit >= 1 &&
      limit <= 100
        ? limit
        : 50;

    const callbacks =
      await MpesaUnmatchedCallback.find({
        status:
          MPESA_QUARANTINE_STATUSES.QUARANTINED,
        conflictDetected: false,
      })
        .sort({ firstReceivedAt: 1 })
        .limit(safeLimit);

    let matched = 0;
    let unmatched = 0;

    for (const callback of callbacks) {
      const payment =
        await PaymentTransaction.findOne({
          provider: PAYMENT_PROVIDERS.MPESA,
          providerTransactionId:
            callback.checkoutRequestId,
          merchantRequestId:
            callback.merchantRequestId,
        });

      if (!payment) {
        unmatched++;
        continue;
      }

      /**
       * Reuse the existing callback ingestion
       * service by reconstructing the expected
       * Daraja callback envelope.
       *
       * This remains untrusted callback data.
       */

      const callbackMetadata = [];

      if (callback.reportedAmountMinor != null) {
        callbackMetadata.push({
          Name: "Amount",
          Value:
            callback.reportedAmountMinor / 100,
        });
      }

      if (callback.reportedReceipt) {
        callbackMetadata.push({
          Name: "MpesaReceiptNumber",
          Value: callback.reportedReceipt,
        });
      }

      const payload = {
        Body: {
          stkCallback: {
            MerchantRequestID:
              callback.merchantRequestId,

            CheckoutRequestID:
              callback.checkoutRequestId,

            ResultCode:
              callback.resultCode,

            ResultDesc:
              "Recovered quarantined callback",

            CallbackMetadata: {
              Item: callbackMetadata,
            },
          },
        },
      };

      const result =
        await ingestMpesaCallback(payload);

      if (!result.accepted || result.conflict) {
        unmatched++;
        continue;
      }

      const updated =
        await MpesaUnmatchedCallback.updateOne(
          {
            _id: callback._id,
            status:
              MPESA_QUARANTINE_STATUSES.QUARANTINED,
            conflictDetected: false,
          },
          {
            $set: {
              status:
                MPESA_QUARANTINE_STATUSES.MATCHED,

              matchedPaymentId:
                payment._id,

              matchedAt:
                new Date(),
            },
          }
        );

      if (updated.modifiedCount === 1) {
        matched++;
      }
    }

    return {
      examined: callbacks.length,
      matched,
      unmatched,
    };
  };