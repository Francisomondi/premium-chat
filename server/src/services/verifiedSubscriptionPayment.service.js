import mongoose from "mongoose";

import PaymentTransaction from "../models/PaymentTransaction.model.js";

import SubscriberSubscription, {
  SUBSCRIPTION_STATUSES,
  SUBSCRIPTION_BILLING_INTERVALS,
} from "../models/SubscriberSubscription.model.js";

import MpesaFinancialVerification, {
  FINANCIAL_VERIFICATION_STATUSES,
} from "../models/MpesaFinancialVerification.model.js";

import {
  PAYMENT_PROVIDERS,
  PAYMENT_PURPOSES,
  PAYMENT_STATUSES,
  PAYMENT_VERIFICATION_STATUSES,
} from "../constants/payment.constants.js";

import {
  verifyPaymentTransaction,
} from "./paymentVerification.service.js";

/**
 * ============================================================
 * PREMIUMCHAT — VERIFIED SUBSCRIPTION PAYMENT SERVICE
 * ============================================================
 *
 * STEP 18.30
 *
 * Responsibilities:
 *
 * - Apply an independently verified payment.
 * - Activate an eligible pending subscription.
 * - Calculate the initial monthly billing period.
 * - Prevent duplicate entitlement application.
 * - Prevent cancellation/activation races.
 * - Update payment and subscription atomically.
 *
 * SECURITY:
 *
 * - No client-supplied verification evidence.
 * - No client-supplied billing periods.
 * - No activation from callbacks alone.
 * - No activation from database flags alone.
 * - No external API requests inside transactions.
 *
 * CURRENT STATE:
 *
 * The authoritative verification service is
 * fail-closed until a trusted provider integration
 * has been configured.
 */

const validId = (value) =>
  typeof value === "string" &&
  mongoose.isObjectIdOrHexString(value);

const sameId = (left, right) =>
  Boolean(left && right) &&
  left.toString() === right.toString();

const validDate = (value) =>
  value instanceof Date &&
  !Number.isNaN(value.getTime());

const rejected = (
  reason,
  paymentId = null
) => ({
  applied: false,
  alreadyApplied: false,
  paymentId,
  subscriptionId: null,
  subscriptionActivated: false,
  reason,
});

const accepted = ({
  payment,
  subscription,
  alreadyApplied = false,
}) => ({
  applied: true,
  alreadyApplied,

  paymentId: payment._id.toString(),

  subscriptionId:
    subscription._id.toString(),

  subscriptionActivated: true,

  status: subscription.status,

  currentPeriodStart:
    subscription.currentPeriodStart,

  currentPeriodEnd:
    subscription.currentPeriodEnd,

  reason: alreadyApplied
    ? "SUBSCRIPTION_PAYMENT_ALREADY_APPLIED"
    : "SUBSCRIPTION_PAYMENT_APPLIED",
});

/**
 * ============================================================
 * MONTHLY BILLING PERIOD
 * ============================================================
 *
 * Calendar-month calculation in UTC.
 *
 * Examples:
 *
 * January 15 -> February 15
 * January 31 -> February 28/29
 *
 * The original billing anchor is retained.
 */

export const calculateInitialBillingPeriod = (
  start
) => {
  if (!validDate(start)) {
    throw new Error("INVALID_BILLING_START");
  }

  const year = start.getUTCFullYear();
  const month = start.getUTCMonth();
  const day = start.getUTCDate();

  const nextMonthStart = new Date(
    Date.UTC(year, month + 1, 1)
  );

  const followingMonthStart = new Date(
    Date.UTC(year, month + 2, 1)
  );

  const lastDayOfNextMonth = new Date(
    followingMonthStart.getTime() - 1
  ).getUTCDate();

  const targetDay = Math.min(
    day,
    lastDayOfNextMonth
  );

  const end = new Date(
    Date.UTC(
      nextMonthStart.getUTCFullYear(),
      nextMonthStart.getUTCMonth(),
      targetDay,
      start.getUTCHours(),
      start.getUTCMinutes(),
      start.getUTCSeconds(),
      start.getUTCMilliseconds()
    )
  );

  return {
    periodStart: new Date(start),
    periodEnd: end,
    billingAnchorDay: day,
  };
};

/**
 * ============================================================
 * VALIDATE STORED FINANCIAL RECORDS
 * ============================================================
 *
 * This function checks consistency only.
 *
 * It is NOT the authoritative provider
 * verification gate.
 */

const validateFinancialConsistency = ({
  payment,
  subscription,
  financialVerification,
}) => {
  if (
    payment.provider !==
    PAYMENT_PROVIDERS.MPESA
  ) {
    return "UNSUPPORTED_PAYMENT_PROVIDER";
  }

  if (
    payment.purpose !==
    PAYMENT_PURPOSES.SUBSCRIPTION_INITIAL
  ) {
    return "UNSUPPORTED_PAYMENT_PURPOSE";
  }

  if (
    payment.status !==
      PAYMENT_STATUSES.SUCCEEDED ||
    payment.verificationStatus !==
      PAYMENT_VERIFICATION_STATUSES.VERIFIED
  ) {
    return "PAYMENT_NOT_VERIFIED";
  }

  if (
    !validDate(payment.verifiedAt) ||
    !validDate(payment.paidAt)
  ) {
    return "PAYMENT_VERIFICATION_DATES_INVALID";
  }

  if (
    !sameId(
      payment.subscriptionId,
      subscription._id
    ) ||
    !sameId(
      payment.payerId,
      subscription.subscriberId
    ) ||
    !sameId(
      payment.creatorId,
      subscription.creatorId
    )
  ) {
    return "PAYMENT_SUBSCRIPTION_MISMATCH";
  }

  if (
    payment.amountMinor !==
      subscription.planSnapshot?.monthlyPriceMinor ||
    payment.currency !==
      subscription.planSnapshot?.currency
  ) {
    return "SUBSCRIPTION_PRICE_MISMATCH";
  }

  if (
    !financialVerification ||
    financialVerification.status !==
      FINANCIAL_VERIFICATION_STATUSES.VERIFIED ||
    financialVerification.requiresManualReview
  ) {
    return "FINANCIAL_VERIFICATION_INVALID";
  }

  if (
    !sameId(
      financialVerification.paymentId,
      payment._id
    ) ||
    !sameId(
      financialVerification.subscriptionId,
      subscription._id
    )
  ) {
    return "FINANCIAL_VERIFICATION_OWNERSHIP_MISMATCH";
  }

  if (
    financialVerification.provider !==
      PAYMENT_PROVIDERS.MPESA ||
    financialVerification.providerTransactionId !==
      payment.providerTransactionId ||
    financialVerification.mpesaReceiptNumber !==
      payment.providerReceipt
  ) {
    return "FINANCIAL_VERIFICATION_REFERENCE_MISMATCH";
  }

  if (
    financialVerification.verifiedAmountMinor !==
      payment.amountMinor ||
    financialVerification.verifiedCurrency !==
      payment.currency
  ) {
    return "FINANCIAL_VERIFICATION_AMOUNT_MISMATCH";
  }

  if (
    !validDate(financialVerification.verifiedAt)
  ) {
    return "FINANCIAL_VERIFICATION_DATE_INVALID";
  }

  return null;
};

/**
 * ============================================================
 * CHECK IDEMPOTENT APPLICATION
 * ============================================================
 *
 * Only an active subscription with the same
 * payment and complete period is considered
 * successfully applied.
 */

const isAlreadyApplied = (
  payment,
  subscription
) =>
  validDate(payment.entitlementAppliedAt) &&
  sameId(
    subscription.lastPaymentId,
    payment._id
  ) &&
  subscription.status ===
    SUBSCRIPTION_STATUSES.ACTIVE &&
  validDate(subscription.currentPeriodStart) &&
  validDate(subscription.currentPeriodEnd) &&
  subscription.currentPeriodEnd >
    subscription.currentPeriodStart;

/**
 * ============================================================
 * APPLY VERIFIED SUBSCRIPTION PAYMENT
 * ============================================================
 */

export const applyVerifiedSubscriptionPayment =
  async ({ paymentId } = {}) => {
    /**
     * STEP 1 — VALIDATE IDENTIFIER
     */

    if (!validId(paymentId)) {
      return rejected("INVALID_PAYMENT_ID");
    }

    /**
     * STEP 2 — CHECK AUTHORITATIVE VERIFICATION
     *
     * The verification service must independently
     * establish that settlement was authenticated.
     *
     * This call occurs before the transaction.
     */

    const verification =
      await verifyPaymentTransaction({
        paymentId,
      });

    if (
      verification?.verified !== true ||
      !verification.payment ||
      !sameId(
        verification.payment._id,
        paymentId
      )
    ) {
      return rejected(
        verification?.reason ||
          "AUTHORITATIVE_PAYMENT_VERIFICATION_REQUIRED",
        paymentId
      );
    }

    /**
     * STEP 3 — ATOMIC APPLICATION
     */

    let result = rejected(
      "SUBSCRIPTION_APPLICATION_NOT_COMPLETED",
      paymentId
    );

    await mongoose.connection.transaction(
      async (session) => {
        /**
         * Reload all records within the transaction.
         */

        const payment =
          await PaymentTransaction.findById(
            paymentId
          ).session(session);

        if (!payment) {
          result = rejected(
            "PAYMENT_NOT_FOUND",
            paymentId
          );

          return;
        }

        if (!payment.subscriptionId) {
          result = rejected(
            "PAYMENT_SUBSCRIPTION_MISSING",
            paymentId
          );

          return;
        }

        const subscription =
          await SubscriberSubscription.findById(
            payment.subscriptionId
          ).session(session);

        if (!subscription) {
          result = rejected(
            "SUBSCRIPTION_NOT_FOUND",
            paymentId
          );

          return;
        }

        const financialVerification =
          await MpesaFinancialVerification.findOne({
            paymentId: payment._id,
          }).session(session);

        /**
         * STEP 4 — REVALIDATE FINANCIAL CONSISTENCY
         */

        const consistencyError =
          validateFinancialConsistency({
            payment,
            subscription,
            financialVerification,
          });

        if (consistencyError) {
          result = rejected(
            consistencyError,
            paymentId
          );

          return;
        }

        /**
         * STEP 5 — IDEMPOTENCY
         */

        if (
        isAlreadyApplied(payment, subscription)
        ) {
        const periodsMatch =
            validDate(payment.periodStart) &&
            validDate(payment.periodEnd) &&
            payment.periodStart.getTime() ===
            subscription.currentPeriodStart.getTime() &&
            payment.periodEnd.getTime() ===
            subscription.currentPeriodEnd.getTime();

        if (!periodsMatch) {
            result = rejected(
            "APPLIED_PAYMENT_PERIOD_MISMATCH",
            paymentId
            );

            return;
        }

        result = accepted({
            payment,
            subscription,
            alreadyApplied: true,
        });

        return;
        }

        if (
          payment.entitlementAppliedAt ||
          subscription.lastPaymentId
        ) {
          result = rejected(
            "ENTITLEMENT_APPLICATION_STATE_CONFLICT",
            paymentId
          );

          return;
        }

        /**
         * STEP 6 — SUBSCRIPTION ELIGIBILITY
         */

        if (
          subscription.status !==
            SUBSCRIPTION_STATUSES.PENDING ||
          subscription.canceledAt ||
          subscription.cancelAtPeriodEnd ||
          subscription.suspendedAt ||
          subscription.expiredAt
        ) {
          result = rejected(
            "SUBSCRIPTION_NOT_ELIGIBLE_FOR_ACTIVATION",
            paymentId
          );

          return;
        }

        if (
          subscription.billingInterval !==
            SUBSCRIPTION_BILLING_INTERVALS.MONTHLY
        ) {
          result = rejected(
            "UNSUPPORTED_BILLING_INTERVAL",
            paymentId
          );

          return;
        }

        if (
          subscription.startedAt ||
          subscription.currentPeriodStart ||
          subscription.currentPeriodEnd
        ) {
          result = rejected(
            "SUBSCRIPTION_PERIOD_ALREADY_INITIALIZED",
            paymentId
          );

          return;
        }

        /**
         * STEP 7 — CALCULATE PAID PERIOD
         *
         * Use the application timestamp, not
         * a date supplied by the client.
         *
         * The verified payment may have been
         * settled earlier. This policy starts
         * access when activation is applied.
         */

        const now = new Date();

        const {
          periodStart,
          periodEnd,
          billingAnchorDay,
        } = calculateInitialBillingPeriod(now);

        /**
         * STEP 8 — CLAIM THE PAYMENT
         *
         * Conditional update ensures the payment
         * cannot be applied twice.
         */

        const paymentClaim =
          await PaymentTransaction.updateOne(
            {
              _id: payment._id,

              status:
                PAYMENT_STATUSES.SUCCEEDED,

              verificationStatus:
                PAYMENT_VERIFICATION_STATUSES.VERIFIED,

              entitlementAppliedAt: null,

              __v: payment.__v,
            },
            {
              $set: {
                entitlementAppliedAt: now,

                periodStart,
                periodEnd,
              },

              $inc: {
                __v: 1,
              },
            },
            { session }
          );

        if (
          paymentClaim.modifiedCount !== 1
        ) {
          throw new Error(
            "PAYMENT_ENTITLEMENT_CLAIM_CONFLICT"
          );
        }

        /**
         * STEP 9 — ACTIVATE SUBSCRIPTION
         *
         * Conditional update prevents concurrent
         * cancellation or activation from silently
         * succeeding.
         */

        const subscriptionClaim =
          await SubscriberSubscription.updateOne(
            {
              _id: subscription._id,

              __v: subscription.__v,

              status:
                SUBSCRIPTION_STATUSES.PENDING,

              canceledAt: null,
              cancelAtPeriodEnd: false,
              suspendedAt: null,
              expiredAt: null,

              lastPaymentId: null,

              startedAt: null,
              currentPeriodStart: null,
              currentPeriodEnd: null,
            },
            {
              $set: {
                status:
                  SUBSCRIPTION_STATUSES.ACTIVE,

                startedAt: periodStart,

                currentPeriodStart:
                  periodStart,

                currentPeriodEnd:
                  periodEnd,

                billingAnchorDay,

                lastPaymentId:
                  payment._id,
              },

              $inc: {
                __v: 1,
              },
            },
            { session }
          );

        if (
          subscriptionClaim.modifiedCount !== 1
        ) {
          throw new Error(
            "SUBSCRIPTION_ACTIVATION_CONFLICT"
          );
        }

        /**
         * STEP 10 — RETURN RESULT
         *
         * The transaction commits both changes
         * or rolls them back together.
         */

        result = accepted({
          payment,
          subscription: {
            ...subscription.toObject(),

            status:
              SUBSCRIPTION_STATUSES.ACTIVE,

            startedAt: periodStart,

            currentPeriodStart:
              periodStart,

            currentPeriodEnd:
              periodEnd,

            billingAnchorDay,

            lastPaymentId:
              payment._id,
          },
        });
      }
    );

    return result;
  };

export default {
  applyVerifiedSubscriptionPayment,
  calculateInitialBillingPeriod,
};