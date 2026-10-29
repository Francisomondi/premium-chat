import mongoose from "mongoose";

import PaymentTransaction from "../models/PaymentTransaction.model.js";

import {
  PAYMENT_PROVIDERS,
  PAYMENT_PURPOSES,
  PAYMENT_STATUSES,
  PAYMENT_VERIFICATION_STATUSES,
} from "../constants/payment.constants.js";

import {
  recordMpesaFinancialSettlement,
} from "./mpesaSettlementRecording.service.js";

import {
  applyVerifiedSubscriptionPayment,
} from "./verifiedSubscriptionPayment.service.js";

import {
  getMpesaMerchantSourceConfig,
} from "../payments/mpesa/mpesaMerchantSource.config.js";

/**
 * ============================================================
 * PREMIUMCHAT — PAYMENT RECOVERY SERVICE
 * ============================================================
 *
 * STEP 18.31
 *
 * Recovery is resumable and idempotent.
 *
 * It never:
 * - Starts a new customer payment
 * - Trusts an M-Pesa callback as settlement proof
 * - Marks payment verification as VERIFIED
 * - Directly activates a subscription
 * - Bypasses authoritative verification
 *
 * Multiple workers may discover the same payment.
 * The settlement and activation services must
 * enforce idempotency using database transactions.
 */

const MAX_BATCH_SIZE = 100;
const DEFAULT_BATCH_SIZE = 25;

const validId = (value) =>
  typeof value === "string" &&
  mongoose.isObjectIdOrHexString(value);

const normalizeBatchSize = (value) => {
  const size = Number(value);

  if (!Number.isInteger(size) || size < 1) {
    return DEFAULT_BATCH_SIZE;
  }

  return Math.min(size, MAX_BATCH_SIZE);
};

const isTransientMongoError = (error) => {
  if (!error) return false;

  if (
    typeof error.hasErrorLabel === "function" &&
    (
      error.hasErrorLabel("TransientTransactionError") ||
      error.hasErrorLabel("UnknownTransactionCommitResult")
    )
  ) {
    return true;
  }

  return [
    112, // WriteConflict
    251, // NoSuchTransaction
  ].includes(error.code);
};

const outcome = ({
  paymentId,
  action,
  status,
  reason,
}) => ({
  paymentId,
  action,
  status,
  reason,
});

/**
 * ============================================================
 * RECOVER ONE PAYMENT
 * ============================================================
 */

export const recoverPayment = async ({
  paymentId,
} = {}) => {
  if (!validId(paymentId)) {
    return outcome({
      paymentId: null,
      action: "NONE",
      status: "REJECTED",
      reason: "INVALID_PAYMENT_ID",
    });
  }

  const payment =
    await PaymentTransaction.findById(paymentId)
      .select(
        "_id provider purpose status verificationStatus " +
        "entitlementAppliedAt subscriptionId"
      )
      .lean();

  if (!payment) {
    return outcome({
      paymentId,
      action: "NONE",
      status: "REJECTED",
      reason: "PAYMENT_NOT_FOUND",
    });
  }

  if (
    payment.provider !== PAYMENT_PROVIDERS.MPESA ||
    payment.purpose !==
      PAYMENT_PURPOSES.SUBSCRIPTION_INITIAL
  ) {
    return outcome({
      paymentId,
      action: "NONE",
      status: "SKIPPED",
      reason: "UNSUPPORTED_PAYMENT_TYPE",
    });
  }

  if (payment.entitlementAppliedAt) {
    return outcome({
      paymentId,
      action: "NONE",
      status: "SKIPPED",
      reason: "ENTITLEMENT_ALREADY_APPLIED",
    });
  }

  /**
   * A verified successful payment may have been
   * recorded before a process interruption.
   *
   * Re-enter the activation service. It performs
   * authoritative verification and conditional
   * database writes.
   */

  if (
    payment.status === PAYMENT_STATUSES.SUCCEEDED &&
    payment.verificationStatus ===
      PAYMENT_VERIFICATION_STATUSES.VERIFIED
  ) {
    try {
      const result =
        await applyVerifiedSubscriptionPayment({
          paymentId,
        });

      return outcome({
        paymentId,
        action: "APPLY_ENTITLEMENT",
        status: result.applied
          ? "RECOVERED"
          : "BLOCKED",
        reason: result.reason,
      });
    } catch (error) {
      return outcome({
        paymentId,
        action: "APPLY_ENTITLEMENT",
        status: isTransientMongoError(error)
          ? "RETRYABLE"
          : "ERROR",
        reason: isTransientMongoError(error)
          ? "TRANSIENT_DATABASE_CONFLICT"
          : "ENTITLEMENT_APPLICATION_ERROR",
      });
    }
  }

  /**
   * Only an unverified, outstanding payment may
   * enter the settlement recovery path.
   */

  const awaitingSettlement =
    [
      PAYMENT_STATUSES.PENDING,
      PAYMENT_STATUSES.PROCESSING,
    ].includes(payment.status) &&
    payment.verificationStatus ===
      PAYMENT_VERIFICATION_STATUSES.UNVERIFIED;

  if (!awaitingSettlement) {
    return outcome({
      paymentId,
      action: "NONE",
      status: "BLOCKED",
      reason: "PAYMENT_STATE_REQUIRES_REVIEW",
    });
  }

  const merchantConfig =
    getMpesaMerchantSourceConfig();

  if (
    !merchantConfig.enabled ||
    !merchantConfig.automaticSettlementEnabled
  ) {
    return outcome({
      paymentId,
      action: "RECORD_SETTLEMENT",
      status: "BLOCKED",
      reason:
        merchantConfig.reason ||
        "AUTOMATIC_SETTLEMENT_DISABLED",
    });
  }

  try {
    const settlement =
      await recordMpesaFinancialSettlement({
        paymentId,
      });

    if (!settlement.recorded) {
      return outcome({
        paymentId,
        action: "RECORD_SETTLEMENT",
        status: "BLOCKED",
        reason:
          settlement.reason ||
          "SETTLEMENT_NOT_RECORDED",
      });
    }

    /**
     * Settlement recording and entitlement
     * application are separate transactions.
     *
     * If activation fails, a later recovery
     * attempt can resume from SUCCEEDED.
     */

    const application =
      await applyVerifiedSubscriptionPayment({
        paymentId,
      });

    return outcome({
      paymentId,
      action: "SETTLE_AND_APPLY",
      status: application.applied
        ? "RECOVERED"
        : "BLOCKED",
      reason: application.reason,
    });
  } catch (error) {
    const transient = isTransientMongoError(error);

    return outcome({
      paymentId,
      action: "SETTLE_AND_APPLY",
      status: transient ? "RETRYABLE" : "ERROR",
      reason: transient
        ? "TRANSIENT_DATABASE_CONFLICT"
        : "PAYMENT_RECOVERY_ERROR",
    });
  }
};

/**
 * ============================================================
 * RECOVER OUTSTANDING PAYMENTS
 * ============================================================
 *
 * Uses a bounded batch and a stable ordering.
 *
 * The cutoff avoids repeatedly processing
 * payments created moments ago.
 */

export const recoverOutstandingPayments = async ({
  batchSize = DEFAULT_BATCH_SIZE,
  minAgeMinutes = 5,
} = {}) => {
  const limit = normalizeBatchSize(batchSize);

  if (
    !Number.isInteger(minAgeMinutes) ||
    minAgeMinutes < 0 ||
    minAgeMinutes > 1440
  ) {
    throw new Error("INVALID_RECOVERY_MIN_AGE");
  }

  const cutoff = new Date(
    Date.now() - minAgeMinutes * 60_000
  );

  const payments =
    await PaymentTransaction.find({
      provider: PAYMENT_PROVIDERS.MPESA,

      purpose:
        PAYMENT_PURPOSES.SUBSCRIPTION_INITIAL,

      entitlementAppliedAt: null,

      createdAt: {
        $lte: cutoff,
      },

      $or: [
        {
          status: PAYMENT_STATUSES.SUCCEEDED,
          verificationStatus:
            PAYMENT_VERIFICATION_STATUSES.VERIFIED,
        },
        {
          status: {
            $in: [
              PAYMENT_STATUSES.PENDING,
              PAYMENT_STATUSES.PROCESSING,
            ],
          },
          verificationStatus:
            PAYMENT_VERIFICATION_STATUSES.UNVERIFIED,
        },
      ],
    })
      .select("_id")
      .sort({
        createdAt: 1,
        _id: 1,
      })
      .limit(limit)
      .lean();

  const results = [];

  for (const payment of payments) {
    const result = await recoverPayment({
      paymentId: payment._id.toString(),
    });

    results.push(result);
  }

  return {
    examined: results.length,

    recovered: results.filter(
      (item) => item.status === "RECOVERED"
    ).length,

    blocked: results.filter(
      (item) => item.status === "BLOCKED"
    ).length,

    retryable: results.filter(
      (item) => item.status === "RETRYABLE"
    ).length,

    errors: results.filter(
      (item) => item.status === "ERROR"
    ).length,

    results,
  };
};

export default {
  recoverPayment,
  recoverOutstandingPayments,
};