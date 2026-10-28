import MpesaUnmatchedCallback, {
  MPESA_QUARANTINE_STATUSES,
} from "../models/MpesaUnmatchedCallback.model.js";

/**
 * ============================================================
 * PREMIUMCHAT — UNMATCHED CALLBACK QUARANTINE
 * ============================================================
 *
 * Callback data is untrusted.
 *
 * Never:
 * - Create a successful payment.
 * - Activate a subscription.
 * - Treat a receipt as independently verified.
 */

const toMinor = (amount) => {
  if (
    typeof amount !== "number" ||
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    return null;
  }

  const minor = Math.round(amount * 100);

  return Number.isSafeInteger(minor)
    ? minor
    : null;
};

export const quarantineMpesaCallback = async (
  callback
) => {
  const {
    checkoutRequestId,
    merchantRequestId,
    resultCode,
    amount,
    receipt,
  } = callback;

  const incoming = {
    checkoutRequestId,
    merchantRequestId,
    resultCode,
    reportedAmountMinor: toMinor(amount),
    reportedReceipt: receipt ?? null,
  };

  const existing =
    await MpesaUnmatchedCallback.findOneAndUpdate(
      { checkoutRequestId },
      {
        $setOnInsert: incoming,
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      }
    ).catch(async (error) => {
      if (error?.code !== 11000) {
        throw error;
      }

      return MpesaUnmatchedCallback.findOne({
        checkoutRequestId,
      });
    });

  if (!existing) {
    throw new Error(
      "Unable to persist unmatched M-Pesa callback."
    );
  }

  const conflictDetected =
    existing.merchantRequestId !== merchantRequestId ||
    existing.resultCode !== resultCode ||
    existing.reportedAmountMinor !==
      incoming.reportedAmountMinor ||
    existing.reportedReceipt !==
      incoming.reportedReceipt;

  const update = {
    $set: {
      lastReceivedAt: new Date(),
    },
    $inc: {
      deliveryCount: 1,
    },
  };

  if (conflictDetected) {
    update.$set.conflictDetected = true;
    update.$set.status =
      MPESA_QUARANTINE_STATUSES.MANUAL_REVIEW;
    update.$set.manualReviewReason =
      "CONFLICTING_UNMATCHED_CALLBACK";
  }

  await MpesaUnmatchedCallback.updateOne(
    {
      _id: existing._id,
      status: {
        $ne: MPESA_QUARANTINE_STATUSES.MATCHED,
      },
    },
    update
  );

  return {
    quarantined: true,
    conflictDetected,
    checkoutRequestId,
  };
};