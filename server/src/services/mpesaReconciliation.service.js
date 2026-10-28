import mongoose from "mongoose";

import PaymentTransaction from "../models/PaymentTransaction.model.js";

import MpesaCallbackEvent, {
  MPESA_CALLBACK_EVENT_STATUSES,
} from "../models/MpesaCallbackEvent.model.js";

import MpesaPaymentEvidence, {
  MPESA_EVIDENCE_STATUSES,
} from "../models/MpesaPaymentEvidence.model.js";

import {
  PAYMENT_PROVIDERS,
  PAYMENT_STATUSES,
} from "../constants/payment.constants.js";

import {
  queryMpesaStkStatus,
} from "../payments/mpesa/mpesa.client.js";

import {
  evaluateMpesaEvidence,
} from "./mpesaEvidence.service.js";

import AppError from "../utils/AppError.js";

/**
 * ============================================================
 * PREMIUMCHAT — HARDENED M-PESA RECONCILIATION
 * ============================================================
 *
 * MODULE 4.3.5.7.8.13.13
 *
 * SECURITY:
 *
 * - Only server-to-server provider queries
 *   can establish provider-query outcomes.
 *
 * - Callback claims are compared, not trusted.
 *
 * - Payment success is never assigned here.
 *
 * - Financial verification remains disabled.
 *
 * - Subscription activation remains disabled.
 */

const isValidId = (value) =>
  typeof value === "string" &&
  mongoose.isObjectIdOrHexString(value);

const validString = (value) =>
  typeof value === "string" &&
  value.trim().length > 0;

/**
 * ============================================================
 * RECONCILE PAYMENT
 * ============================================================
 */

export const reconcileMpesaPayment =
  async ({
    paymentId,
  } = {}) => {
    /**
     * STEP 1:
     * Validate payment identifier.
     */

    if (!isValidId(paymentId)) {
      throw new AppError(
        "Invalid payment identifier.",
        400,
        "INVALID_PAYMENT_ID"
      );
    }

    /**
     * STEP 2:
     * Load payment.
     */

    const payment =
      await PaymentTransaction.findById(
        paymentId
      );

    if (!payment) {
      throw new AppError(
        "Payment not found.",
        404,
        "PAYMENT_NOT_FOUND"
      );
    }

    /**
     * STEP 3:
     * Validate provider.
     */

    if (
      payment.provider !==
      PAYMENT_PROVIDERS.MPESA
    ) {
      throw new AppError(
        "Payment provider mismatch.",
        409,
        "INVALID_PAYMENT_PROVIDER"
      );
    }

    /**
     * STEP 4:
     * Do not reconcile terminal payments
     * through this pending-payment workflow.
     */

    if (
      ![
        PAYMENT_STATUSES.PENDING,
        PAYMENT_STATUSES.PROCESSING,
      ].includes(payment.status)
    ) {
      return {
        checked: false,
        reason: "PAYMENT_NOT_PENDING",
        paymentVerified: false,
        entitlementApplied: false,
      };
    }

    /**
     * STEP 5:
     * Require original provider identifiers.
     */

    if (
      !validString(
        payment.providerTransactionId
      ) ||
      !validString(
        payment.merchantRequestId
      )
    ) {
      return {
        checked: false,
        reason: "PROVIDER_IDENTIFIERS_MISSING",
        paymentVerified: false,
        entitlementApplied: false,
      };
    }

    /**
     * STEP 6:
     * Load the callback, if available.
     *
     * A callback is not required to query
     * the provider.
     */

    const callbackEvent =
      await MpesaCallbackEvent.findOne({
        paymentId: payment._id,

        checkoutRequestId:
          payment.providerTransactionId,

        merchantRequestId:
          payment.merchantRequestId,
      });

    /**
     * STEP 7:
     * Query Safaricom directly.
     *
     * Errors propagate to the worker.
     * Do not manufacture a failure result
     * when the provider is unavailable.
     */

    const queryResult =
      await queryMpesaStkStatus({
        checkoutRequestId:
          payment.providerTransactionId,
      });

    /**
     * STEP 8:
     * Evaluate the provider evidence.
     */

    const evaluation =
      evaluateMpesaEvidence({
        payment,
        queryResult,
        callbackEvent,
      });

    /**
     * STEP 9:
     * Persist a bounded evidence summary.
     *
     * No raw provider payloads or credentials
     * are stored.
     */

    const queriedAt = new Date();

    const evidence =
      await MpesaPaymentEvidence.create({
        paymentId: payment._id,

        checkoutRequestId:
          payment.providerTransactionId,

        merchantRequestId:
          payment.merchantRequestId,

        source: "DARAJA_STK_QUERY",

        status:
          evaluation.status,

        responseCode:
          queryResult.responseCode == null
            ? null
            : String(queryResult.responseCode),

        resultCode:
          queryResult.resultCode == null
            ? null
            : String(queryResult.resultCode),

        queriedAt,

        financialDetailsVerified: false,

        entitlementAuthorized: false,
      });

    /**
     * STEP 10:
     * Update callback reconciliation state.
     *
     * A matching query outcome does not
     * establish full financial verification.
     */

    if (callbackEvent) {
      const isConflict =
        evaluation.status ===
        MPESA_EVIDENCE_STATUSES.CONFLICT;

      const isInconclusive =
        evaluation.status ===
        MPESA_EVIDENCE_STATUSES.QUERY_INCONCLUSIVE;

      const unresolved =
        isConflict || isInconclusive;


    }

    /**
     * STEP 11:
     * Return reconciliation outcome.
     *
     * The result is informational.
     */

    return {
      checked: true,

      paymentId:
        payment._id.toString(),

      evidenceId:
        evidence._id.toString(),

      checkoutRequestId:
        payment.providerTransactionId,

      providerReportsSuccess:
        evaluation.providerReportsSuccess,

      evidenceStatus:
        evaluation.status,

      reason:
        evaluation.reason,

      financialDetailsVerified: false,

      paymentVerified: false,

      entitlementApplied: false,

      subscriptionActivated: false,
    };
  };