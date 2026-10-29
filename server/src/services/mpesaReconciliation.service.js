import mongoose from "mongoose";

import PaymentTransaction from "../models/PaymentTransaction.model.js";

import MpesaCallbackEvent from "../models/MpesaCallbackEvent.model.js";

import MpesaPaymentEvidence, {
  MPESA_EVIDENCE_STATUSES,
} from "../models/MpesaPaymentEvidence.model.js";

import {
  recordMpesaQueryEvidence,
} from "./mpesaEvidenceRecording.service.js";

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

import {
  escalateMpesaReconciliationConflict,
} from "./mpesaReconciliationConflict.service.js";

import AppError from "../utils/AppError.js";

/**
 * ============================================================
 * PREMIUMCHAT — HARDENED M-PESA RECONCILIATION
 * ============================================================
 *
 * MODULE 4.3.5.7.8.13.17.6.12
 *
 * RESPONSIBILITIES:
 *
 * - Validate reconciliation operation identity.
 * - Query Safaricom STK status.
 * - Validate provider transaction identity.
 * - Compare callback claims with provider results.
 * - Persist idempotent reconciliation evidence.
 * - Preserve legitimate evidence history.
 * - Escalate provider-query conflicts.
 *
 * SECURITY:
 *
 * - Callback claims remain untrusted.
 * - STK query success is not financial verification.
 * - No payment success assignment.
 * - No subscription activation.
 * - No premium content authorization.
 *
 * CONCURRENCY:
 *
 * - Does not finalize callback reconciliation.
 * - Does not claim callback reconciliation leases.
 * - Does not overwrite ordinary callback states.
 * - Provider conflicts invalidate existing leases.
 * - Evidence uniqueness is enforced by MongoDB.
 */

const MAX_OPERATION_ID_LENGTH = 180;

/**
 * ============================================================
 * VALIDATION HELPERS
 * ============================================================
 */

const isValidId = (value) =>
  typeof value === "string" &&
  mongoose.isObjectIdOrHexString(value);

const validString = (value) =>
  typeof value === "string" &&
  value.trim().length > 0;

/**
 * ============================================================
 * VALIDATE RECONCILIATION OPERATION ID
 * ============================================================
 */

const isValidOperationId = (value) =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= MAX_OPERATION_ID_LENGTH &&
  value === value.trim() &&
  /^[A-Za-z0-9:_-]+$/.test(value);

/**
 * ============================================================
 * VALIDATE EXISTING OPERATION IDENTITY
 * ============================================================
 *
 * A reconciliation operation ID must never
 * be reused for another payment or checkout.
 */

const validateExistingOperationIdentity = ({
  evidence,
  payment,
}) => {
  if (
    evidence.paymentId.toString() !==
      payment._id.toString() ||
    evidence.checkoutRequestId !==
      payment.providerTransactionId ||
    evidence.merchantRequestId !==
      payment.merchantRequestId
  ) {
    throw new AppError(
      "Reconciliation operation identity conflict.",
      409,
      "RECONCILIATION_OPERATION_IDENTITY_CONFLICT"
    );
  }
};

/**
 * ============================================================
 * RECONCILE PAYMENT
 * ============================================================
 */

export const reconcileMpesaPayment = async ({
  paymentId,
  reconciliationOperationId,
} = {}) => {
  /**
   * ============================================================
   * STEP 1: VALIDATE PAYMENT IDENTIFIER
   * ============================================================
   */

  if (!isValidId(paymentId)) {
    throw new AppError(
      "Invalid payment identifier.",
      400,
      "INVALID_PAYMENT_ID"
    );
  }

  /**
   * ============================================================
   * STEP 1.1: VALIDATE RECONCILIATION OPERATION ID
   * ============================================================
   *
   * This validation belongs immediately
   * after paymentId validation.
   */

  if (!isValidOperationId(reconciliationOperationId)) {
    throw new AppError(
      "A valid reconciliation operation ID is required (1–180 characters).",
      400,
      "INVALID_RECONCILIATION_OPERATION_ID"
    );
  }

  /**
   * ============================================================
   * STEP 2: LOAD PAYMENT
   * ============================================================
   */

  const payment =
    await PaymentTransaction.findById(paymentId);

  if (!payment) {
    throw new AppError(
      "Payment not found.",
      404,
      "PAYMENT_NOT_FOUND"
    );
  }

  /**
   * ============================================================
   * STEP 3: VALIDATE PAYMENT PROVIDER
   * ============================================================
   */

  if (payment.provider !== PAYMENT_PROVIDERS.MPESA) {
    throw new AppError(
      "Payment provider mismatch.",
      409,
      "INVALID_PAYMENT_PROVIDER"
    );
  }

  /**
   * ============================================================
   * STEP 4: VALIDATE PAYMENT STATUS
   * ============================================================
   *
   * Only pending or processing payments
   * can use this reconciliation workflow.
   */

  if (
    ![
      PAYMENT_STATUSES.PENDING,
      PAYMENT_STATUSES.PROCESSING,
    ].includes(payment.status)
  ) {
    return {
      checked: false,

      paymentId: payment._id.toString(),

      reconciliationOperationId,

      reason: "PAYMENT_NOT_PENDING",

      financialDetailsVerified: false,
      paymentVerified: false,
      entitlementApplied: false,
      subscriptionActivated: false,
    };
  }

  /**
   * ============================================================
   * STEP 5: VALIDATE ORIGINAL PROVIDER IDENTIFIERS
   * ============================================================
   */

  if (
    !validString(payment.providerTransactionId) ||
    !validString(payment.merchantRequestId)
  ) {
    return {
      checked: false,

      paymentId: payment._id.toString(),

      reconciliationOperationId,

      reason: "PROVIDER_IDENTIFIERS_MISSING",

      financialDetailsVerified: false,
      paymentVerified: false,
      entitlementApplied: false,
      subscriptionActivated: false,
    };
  }

  /**
   * ============================================================
   * STEP 6: LOAD MATCHING CALLBACK EVENT
   * ============================================================
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
   * ============================================================
   * STEP 7: CHECK EXISTING OPERATION EVIDENCE
   * ============================================================
   *
   * If this operation was previously recorded,
   * reuse its evidence instead of creating
   * another provider-query record.
   */

  const existingEvidence =
    await MpesaPaymentEvidence.findOne({
      reconciliationOperationId,
    });

  if (existingEvidence) {
    validateExistingOperationIdentity({
      evidence: existingEvidence,
      payment,
    });

    /**
     * Preserve conflict escalation.
     *
     * Reusing evidence must not silently
     * bypass a previously detected conflict.
     */

    let conflictEscalation = null;

    if (
      callbackEvent &&
      existingEvidence.status ===
        MPESA_EVIDENCE_STATUSES.CONFLICT
    ) {
      conflictEscalation =
        await escalateMpesaReconciliationConflict({
          callbackEventId:
            callbackEvent._id.toString(),

          evidenceStatus:
            existingEvidence.status,

          reason:
            "EXISTING_RECONCILIATION_CONFLICT",
        });

      if (!conflictEscalation?.escalated) {
        throw new AppError(
          "Existing reconciliation conflict could not be escalated.",
          409,
          "RECONCILIATION_CONFLICT_ESCALATION_FAILED"
        );
      }
    }

    return {
      checked: true,

      paymentId: payment._id.toString(),

      evidenceId:
        existingEvidence._id.toString(),

      reconciliationOperationId,

      checkoutRequestId:
        payment.providerTransactionId,

      providerReportsSuccess:
        existingEvidence.status ===
        MPESA_EVIDENCE_STATUSES.QUERY_SUCCESS,

      evidenceStatus:
        existingEvidence.status,

      reason:
        "EXISTING_RECONCILIATION_EVIDENCE",

      evidenceCreated: false,

      evidenceDuplicate: true,

      requiresManualReview:
        existingEvidence.status ===
          MPESA_EVIDENCE_STATUSES.CONFLICT ||
        Boolean(
          conflictEscalation?.requiresManualReview
        ),

      financialDetailsVerified: false,

      paymentVerified: false,

      entitlementApplied: false,

      subscriptionActivated: false,
    };
  }

  /**
   * ============================================================
   * STEP 8: QUERY SAFARICOM
   * ============================================================
   *
   * Transport errors propagate to the worker.
   *
   * A failed HTTP request must not be
   * recorded as a successful STK outcome.
   */

  const queryResult =
    await queryMpesaStkStatus({
      checkoutRequestId:
        payment.providerTransactionId,
    });

  /**
   * ============================================================
   * STEP 9: EVALUATE PROVIDER EVIDENCE
   * ============================================================
   */

  const evaluation =
    evaluateMpesaEvidence({
      payment,
      queryResult,
      callbackEvent,
    });

  /**
   * ============================================================
   * STEP 10: RECORD EVIDENCE IDEMPOTENTLY
   * ============================================================
   *
   * The recording service enforces
   * operation-level uniqueness.
   *
   * No raw provider payloads or credentials
   * are stored.
   */

  const queriedAt = new Date();

  const recording =
    await recordMpesaQueryEvidence({
      reconciliationOperationId,

      paymentId: payment._id,

      checkoutRequestId:
        payment.providerTransactionId,

      merchantRequestId:
        payment.merchantRequestId,

      status:
        evaluation.status,

      responseCode:
        queryResult.responseCode,

      resultCode:
        queryResult.resultCode,

      queriedAt,
    });

  const evidence = recording.evidence;

  /**
   * ============================================================
   * STEP 11: ESCALATE PROVIDER-QUERY CONFLICTS
   * ============================================================
   *
   * Normal callback reconciliation remains
   * the responsibility of the lease-owning
   * callback reconciliation worker.
   */

  let conflictEscalation = null;

  if (
    callbackEvent &&
    evidence.status ===
      MPESA_EVIDENCE_STATUSES.CONFLICT
  ) {
    conflictEscalation =
      await escalateMpesaReconciliationConflict({
        callbackEventId:
          callbackEvent._id.toString(),

        evidenceStatus:
          evidence.status,

        reason:
          evaluation.reason,
      });

    if (!conflictEscalation?.escalated) {
      throw new AppError(
        "Provider-query conflict could not be escalated.",
        409,
        "RECONCILIATION_CONFLICT_ESCALATION_FAILED"
      );
    }
  }

  /**
   * ============================================================
   * STEP 12: RETURN RECONCILIATION OUTCOME
   * ============================================================
   *
   * This result is informational.
   *
   * It does not verify financial settlement
   * or authorize paid subscription access.
   */

  return {
    checked: true,

    paymentId:
      payment._id.toString(),

    evidenceId:
      evidence._id.toString(),

    reconciliationOperationId,

    checkoutRequestId:
      payment.providerTransactionId,

    providerReportsSuccess:
      evidence.status ===
      MPESA_EVIDENCE_STATUSES.QUERY_SUCCESS,

    evidenceStatus:
      evidence.status,

    reason:
      recording.duplicate
        ? "EXISTING_RECONCILIATION_EVIDENCE"
        : evaluation.reason,

    evidenceCreated:
      recording.created,

    evidenceDuplicate:
      recording.duplicate,

    requiresManualReview:
      evidence.status ===
        MPESA_EVIDENCE_STATUSES.CONFLICT ||
      Boolean(
        conflictEscalation?.requiresManualReview
      ),

    financialDetailsVerified: false,

    paymentVerified: false,

    entitlementApplied: false,

    subscriptionActivated: false,
  };
};