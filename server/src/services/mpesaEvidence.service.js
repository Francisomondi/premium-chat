import {
  MPESA_EVIDENCE_STATUSES,
} from "../models/MpesaPaymentEvidence.model.js";

/**
 * ============================================================
 * PREMIUMCHAT — M-PESA EVIDENCE VALIDATION
 * ============================================================
 *
 * Evaluates provider-query results.
 *
 * Does not:
 * - Mark payments successful.
 * - Mark payments verified.
 * - Activate subscriptions.
 * - Authorize paid content.
 */

const validString = (value) =>
  typeof value === "string" &&
  value.trim().length > 0;

export const evaluateMpesaEvidence = ({
  payment,
  queryResult,
  callbackEvent = null,
} = {}) => {
  if (
    !payment ||
    !queryResult ||
    !validString(payment.providerTransactionId) ||
    !validString(payment.merchantRequestId)
  ) {
    return {
      status:
        MPESA_EVIDENCE_STATUSES.QUERY_INCONCLUSIVE,
      reason: "MISSING_TRANSACTION_IDENTITY",
      providerReportsSuccess: false,
      financialDetailsVerified: false,
    };
  }

  /**
   * A successful HTTP request to the Daraja
   * client does not mean the STK transaction
   * itself succeeded.
   *
   * Require the query to return both IDs.
   */

  if (
    queryResult.checkoutRequestId !==
      payment.providerTransactionId ||
    queryResult.merchantRequestId !==
      payment.merchantRequestId
  ) {
    return {
      status: MPESA_EVIDENCE_STATUSES.CONFLICT,
      reason: "PROVIDER_IDENTITY_MISMATCH",
      providerReportsSuccess: false,
      financialDetailsVerified: false,
    };
  }

  /**
   * Check callback identity independently.
   */

  if (
    callbackEvent &&
    (
      callbackEvent.checkoutRequestId !==
        payment.providerTransactionId ||
      callbackEvent.merchantRequestId !==
        payment.merchantRequestId ||
      callbackEvent.paymentId?.toString() !==
        payment._id.toString()
    )
  ) {
    return {
      status: MPESA_EVIDENCE_STATUSES.CONFLICT,
      reason: "CALLBACK_IDENTITY_MISMATCH",
      providerReportsSuccess: false,
      financialDetailsVerified: false,
    };
  }

  const responseCode =
    queryResult.responseCode == null
      ? null
      : String(queryResult.responseCode);

  const resultCode =
    queryResult.resultCode == null
      ? null
      : String(queryResult.resultCode);

  /**
   * An absent final result is inconclusive.
   */

  if (
    responseCode !== "0" ||
    resultCode === null
  ) {
    return {
      status:
        MPESA_EVIDENCE_STATUSES.QUERY_INCONCLUSIVE,
      reason: "PROVIDER_RESULT_INCOMPLETE",
      providerReportsSuccess: false,
      financialDetailsVerified: false,
    };
  }

  const providerReportsSuccess =
    resultCode === "0";

  /**
   * A conflicting callback must not
   * be silently treated as resolved.
   */

  if (
    callbackEvent &&
    (callbackEvent.resultCode === 0) !==
      providerReportsSuccess
  ) {
    return {
      status: MPESA_EVIDENCE_STATUSES.CONFLICT,
      reason: "CALLBACK_PROVIDER_CONFLICT",
      providerReportsSuccess,
      financialDetailsVerified: false,
    };
  }

  if (!providerReportsSuccess) {
    return {
      status: MPESA_EVIDENCE_STATUSES.QUERY_FAILURE,
      reason: "PROVIDER_REPORTS_FAILURE",
      providerReportsSuccess: false,
      financialDetailsVerified: false,
    };
  }

  /**
   * Successful STK query:
   *
   * Provider reports success, but financial
   * details remain unverified.
   */

  return {
    status: MPESA_EVIDENCE_STATUSES.QUERY_SUCCESS,
    reason: "FINANCIAL_DETAILS_NOT_VERIFIED",
    providerReportsSuccess: true,
    financialDetailsVerified: false,
  };
};