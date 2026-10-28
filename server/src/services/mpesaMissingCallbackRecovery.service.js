import PaymentTransaction from "../models/PaymentTransaction.model.js";

import MpesaCallbackEvent from "../models/MpesaCallbackEvent.model.js";

import {
  PAYMENT_PROVIDERS,
  PAYMENT_STATUSES,
} from "../constants/payment.constants.js";

import {
  reconcileMpesaPayment,
} from "./mpesaReconciliation.service.js";

/**
 * ============================================================
 * PREMIUMCHAT — MISSING CALLBACK RECOVERY
 * ============================================================
 *
 * Finds eligible M-Pesa payment attempts
 * that have provider identifiers but
 * no stored callback event.
 *
 * This is read-only with respect to
 * payment success and subscription access.
 */

export const recoverMissingMpesaCallbacks =
  async ({
    limit = 50,
    minimumAgeMs = 5 * 60 * 1000,
  } = {}) => {
    const safeLimit =
      Number.isSafeInteger(limit) &&
      limit >= 1 &&
      limit <= 100
        ? limit
        : 50;

    const cutoff = new Date(
      Date.now() - minimumAgeMs
    );

    const payments =
      await PaymentTransaction.find({
        provider: PAYMENT_PROVIDERS.MPESA,

        status: {
          $in: [
            PAYMENT_STATUSES.PENDING,
            PAYMENT_STATUSES.PROCESSING,
          ],
        },

        providerTransactionId: {
          $type: "string",
          $ne: "",
        },

        merchantRequestId: {
          $type: "string",
          $ne: "",
        },

        createdAt: {
          $lte: cutoff,
        },
      })
        .sort({ createdAt: 1 })
        .limit(safeLimit)
        .lean();

    let checked = 0;
    let skipped = 0;
    let failed = 0;

    for (const payment of payments) {
      const callbackExists =
        await MpesaCallbackEvent.exists({
          paymentId: payment._id,
          checkoutRequestId:
            payment.providerTransactionId,
          merchantRequestId:
            payment.merchantRequestId,
        });

      if (callbackExists) {
        skipped++;
        continue;
      }

      try {
        const result =
          await reconcileMpesaPayment({
            paymentId:
              payment._id.toString(),
          });

        if (result.checked) {
          checked++;
        } else {
          skipped++;
        }
      } catch {
        failed++;
      }
    }

    return {
      examined: payments.length,
      checked,
      skipped,
      failed,
    };
  };