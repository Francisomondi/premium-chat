import mongoose from "mongoose";

import PaymentTransaction from "../models/PaymentTransaction.model.js";

import SubscriberSubscription, {
  SUBSCRIPTION_STATUSES,
  SUBSCRIPTION_BILLING_INTERVALS,
} from "../models/SubscriberSubscription.model.js";

import {
  PAYMENT_PURPOSES,
  PAYMENT_STATUSES,
  PAYMENT_VERIFICATION_STATUSES,
} from "../constants/payment.constants.js";

import {
  verifyPaymentTransaction,
} from "./paymentVerification.service.js";

import {
  calculateInitialBillingPeriod,
} from "../utils/subscriptionBillingPeriod.js";

import AppError from "../utils/AppError.js";

/**
 * ============================================================
 * PREMIUMCHAT — VERIFIED SUBSCRIPTION PAYMENT APPLICATION
 * ============================================================
 *
 * MODULE 4.3.5.7.8.13.12
 *
 * Responsibilities:
 *
 * - Require trusted provider verification.
 * - Validate payment and subscription ownership.
 * - Validate amount and currency.
 * - Atomically activate an initial subscription.
 * - Atomically record entitlement application.
 * - Prevent duplicate payment application.
 *
 * SECURITY:
 *
 * - No client-controlled activation.
 * - No callback-controlled activation.
 * - No activation from stored payment status alone.
 * - No partial database application.
 *
 * IMPORTANT:
 *
 * The current paymentVerification.service.js
 * always rejects verification.
 *
 * Therefore, this service remains fail-closed
 * until a complete provider verifier exists.
 */

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

const isValidId = (value) =>
  typeof value === "string" &&
  mongoose.isObjectIdOrHexString(value);

const sameId = (left, right) =>
  Boolean(left && right) &&
  left.toString() === right.toString();

const validDate = (value) =>
  value instanceof Date &&
  !Number.isNaN(value.getTime());

const fail = (message, code, status = 409) => {
  throw new AppError(message, status, code);
};

/**
 * ============================================================
 * VALIDATE PROVIDER EVIDENCE
 * ============================================================
 *
 * A future verifier must return:
 *
 * {
 *   verified: true,
 *   payment: {
 *     id,
 *     provider,
 *     providerTransactionId,
 *     providerReceipt,
 *     amountMinor,
 *     currency
 *   }
 * }
 *
 * This must be independently obtained
 * from the provider by trusted backend code.
 *
 * The verifier must NOT build this object
 * by copying untrusted callback fields or
 * merely reading PaymentTransaction.
 */

const validateProviderEvidence = (
  verification,
  payment
) => {
  if (
    verification?.verified !== true ||
    !verification.payment
  ) {
    fail(
      "Trusted provider verification is required.",
      "PAYMENT_PROVIDER_VERIFICATION_REQUIRED",
      403
    );
  }

  const evidence = verification.payment;

  if (
    !sameId(evidence.id, payment._id) ||
    evidence.provider !== payment.provider ||
    evidence.providerTransactionId !==
      payment.providerTransactionId ||
    evidence.providerReceipt !==
      payment.providerReceipt ||
    evidence.amountMinor !==
      payment.amountMinor ||
    evidence.currency !==
      payment.currency
  ) {
    fail(
      "Provider evidence does not match the payment.",
      "PAYMENT_EVIDENCE_MISMATCH"
    );
  }

  if (
    typeof evidence.providerReceipt !== "string" ||
    evidence.providerReceipt.length === 0
  ) {
    fail(
      "A verified provider receipt is required.",
      "PAYMENT_RECEIPT_REQUIRED"
    );
  }
};

/**
 * ============================================================
 * VALIDATE PAYMENT STATE
 * ============================================================
 */

const validatePaymentState = (payment) => {
  if (
    payment.status !==
      PAYMENT_STATUSES.SUCCEEDED ||
    payment.verificationStatus !==
      PAYMENT_VERIFICATION_STATUSES.VERIFIED
  ) {
    fail(
      "Payment is not in a verified successful state.",
      "PAYMENT_NOT_VERIFIED"
    );
  }

  if (
    !validDate(payment.verifiedAt) ||
    !validDate(payment.paidAt)
  ) {
    fail(
      "Payment verification timestamps are invalid.",
      "PAYMENT_VERIFICATION_INVALID"
    );
  }
};

/**
 * ============================================================
 * VALIDATE PAYMENT RELATIONSHIP
 * ============================================================
 */

const validateRelationship = (
  payment,
  subscription
) => {
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
    fail(
      "Payment and subscription ownership do not match.",
      "PAYMENT_SUBSCRIPTION_MISMATCH"
    );
  }

  if (
    payment.purpose !==
    PAYMENT_PURPOSES.SUBSCRIPTION_INITIAL
  ) {
    fail(
      "This operation requires an initial subscription payment.",
      "INVALID_PAYMENT_PURPOSE"
    );
  }

  if (
    payment.amountMinor !==
      subscription.planSnapshot?.monthlyPriceMinor ||
    payment.currency !==
      subscription.planSnapshot?.currency
  ) {
    fail(
      "Payment does not match the agreed subscription price.",
      "PAYMENT_PRICE_MISMATCH"
    );
  }

  if (
    subscription.billingInterval !==
    SUBSCRIPTION_BILLING_INTERVALS.MONTHLY
  ) {
    fail(
      "Unsupported subscription billing interval.",
      "UNSUPPORTED_BILLING_INTERVAL"
    );
  }
};

/**
 * ============================================================
 * APPLY VERIFIED INITIAL PAYMENT
 * ============================================================
 *
 * Trusted backend use only.
 *
 * No public HTTP route should call this
 * using arbitrary client-supplied payment IDs.
 */

export const applyVerifiedSubscriptionPayment =
  async ({
    paymentId,
    subscriptionId,
  } = {}) => {
    if (
      !isValidId(paymentId) ||
      !isValidId(subscriptionId)
    ) {
      fail(
        "Invalid payment or subscription identifier.",
        "INVALID_PAYMENT_APPLICATION_REQUEST",
        400
      );
    }

    /**
     * STEP 1:
     * Verify payment with the trusted provider.
     *
     * This currently fails closed.
     */

    const verification =
      await verifyPaymentTransaction({
        paymentId,
      });

    if (verification?.verified !== true) {
      fail(
        "Trusted provider verification is not available.",
        "PAYMENT_PROVIDER_VERIFICATION_REQUIRED",
        403
      );
    }

    /**
     * STEP 2:
     * Start the atomic database transaction.
     *
     * MongoDB must support transactions.
     */

    let applicationResult;

    await mongoose.connection.transaction(
      async (session) => {
        /**
         * STEP 3:
         * Load the latest payment state.
         */

        const payment =
          await PaymentTransaction.findById(
            paymentId
          ).session(session);

        if (!payment) {
          fail(
            "Payment not found.",
            "PAYMENT_NOT_FOUND",
            404
          );
        }

        /**
         * STEP 4:
         * Load the latest subscription state.
         */

        const subscription =
          await SubscriberSubscription.findById(
            subscriptionId
          ).session(session);

        if (!subscription) {
          fail(
            "Subscription not found.",
            "SUBSCRIPTION_NOT_FOUND",
            404
          );
        }

        /**
         * STEP 5:
         * Validate provider evidence against
         * the current database record.
         */

        validateProviderEvidence(
          verification,
          payment
        );

        /**
         * STEP 6:
         * Validate financial state and ownership.
         */

        validatePaymentState(payment);

        validateRelationship(
          payment,
          subscription
        );

        /**
         * STEP 7:
         * Handle an already-applied payment.
         *
         * No billing dates are changed.
         */

        if (payment.entitlementAppliedAt) {
          if (
            !sameId(
              subscription.lastPaymentId,
              payment._id
            ) ||
            !validDate(payment.periodStart) ||
            !validDate(payment.periodEnd)
          ) {
            fail(
              "Applied payment and subscription state disagree.",
              "PAYMENT_APPLICATION_INCONSISTENT"
            );
          }

          applicationResult = {
            applied: true,

            alreadyApplied: true,

            paymentId:
              payment._id.toString(),

            subscriptionId:
              subscription._id.toString(),

            periodStart:
              payment.periodStart,

            periodEnd:
              payment.periodEnd,
          };

          return;
        }

        /**
         * STEP 8:
         * Require an eligible pending subscription.
         *
         * Canceled subscriptions cannot be
         * reactivated by late callbacks.
         */

        if (
          subscription.status !==
            SUBSCRIPTION_STATUSES.PENDING ||
          subscription.canceledAt ||
          subscription.cancelAtPeriodEnd ||
          subscription.suspendedAt
        ) {
          fail(
            "Subscription is not eligible for initial activation.",
            "SUBSCRIPTION_NOT_ACTIVATABLE"
          );
        }

        if (
          subscription.startedAt ||
          subscription.currentPeriodStart ||
          subscription.currentPeriodEnd ||
          subscription.lastPaymentId
        ) {
          fail(
            "Pending subscription already contains paid entitlement data.",
            "SUBSCRIPTION_STATE_INCONSISTENT"
          );
        }

        /**
         * STEP 9:
         * Calculate the billing period.
         */

        const now = new Date();

        const {
          periodStart,
          periodEnd,
          anchorDay,
        } = calculateInitialBillingPeriod(now);

        /**
         * STEP 10:
         * Atomically claim this payment.
         *
         * A competing transaction cannot
         * successfully apply it twice.
         */

        const paymentUpdate =
          await PaymentTransaction.updateOne(
            {
              _id: payment._id,

              __v: payment.__v,

              status:
                PAYMENT_STATUSES.SUCCEEDED,

              verificationStatus:
                PAYMENT_VERIFICATION_STATUSES.VERIFIED,

              entitlementAppliedAt: null,
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
            {
              session,
            }
          );

        if (paymentUpdate.modifiedCount !== 1) {
          fail(
            "Payment was already claimed or modified.",
            "PAYMENT_APPLICATION_CONFLICT"
          );
        }

        /**
         * STEP 11:
         * Atomically activate subscription.
         *
         * Recheck state and version.
         */

        const subscriptionUpdate =
          await SubscriberSubscription.updateOne(
            {
              _id: subscription._id,

              __v: subscription.__v,

              status:
                SUBSCRIPTION_STATUSES.PENDING,

              canceledAt: null,

              cancelAtPeriodEnd: false,

              suspendedAt: null,

              startedAt: null,

              currentPeriodStart: null,

              currentPeriodEnd: null,

              lastPaymentId: null,
            },
            {
              $set: {
                status:
                  SUBSCRIPTION_STATUSES.ACTIVE,

                startedAt:
                  periodStart,

                currentPeriodStart:
                  periodStart,

                currentPeriodEnd:
                  periodEnd,

                billingAnchorDay:
                  anchorDay,

                lastPaymentId:
                  payment._id,

                expiredAt: null,
              },

              $inc: {
                __v: 1,
              },
            },
            {
              session,
            }
          );

        if (
          subscriptionUpdate.modifiedCount !== 1
        ) {
          fail(
            "Subscription changed during payment application.",
            "SUBSCRIPTION_APPLICATION_CONFLICT"
          );
        }

        /**
         * STEP 12:
         * Return the committed application result.
         *
         * The transaction commits only after
         * this callback completes successfully.
         */

        applicationResult = {
          applied: true,

          alreadyApplied: false,

          paymentId:
            payment._id.toString(),

          subscriptionId:
            subscription._id.toString(),

          periodStart,

          periodEnd,
        };
      }
    );

    return applicationResult;
  };

export default {
  applyVerifiedSubscriptionPayment,
};