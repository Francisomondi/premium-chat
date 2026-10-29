import {
  MPESA_EVIDENCE_STATUSES,
} from "../models/MpesaPaymentEvidence.model.js";

/**
 * ============================================================
 * PREMIUMCHAT — M-PESA EVIDENCE VALIDATION
 * ============================================================
 *
 * MODULE 4.3.5.7.8.13.17.6.11
 *
 * RESPONSIBILITIES:
 *
 * - Validate provider-query identity.
 * - Compare provider results with callback claims.
 * - Detect contradictory evidence.
 * - Distinguish incomplete evidence from conflicts.
 * - Preserve existing callback conflict decisions.
 *
 * SECURITY:
 *
 * - Callback claims are untrusted.
 * - STK query success is not financial settlement.
 * - No payment success assignment.
 * - No payment verification.
 * - No subscription activation.
 * - No premium content authorization.
 */

const validString = (value) =>
  typeof value === "string" &&
  value.trim().length > 0;

/**
 * ============================================================
 * BUILD EVIDENCE RESULT
 * ============================================================
 */

const evidenceResult = ({
  status,
  reason,
  providerReportsSuccess = false,
}) => ({
  status,

  reason,

  providerReportsSuccess,

  financialDetailsVerified: false,

  entitlementAuthorized: false,
});

/**
 * ============================================================
 * NORMALIZE PROVIDER RESULT CODE
 * ============================================================
 *
 * Accept numeric or string representations.
 *
 * Reject missing, empty, or malformed codes.
 */

const normalizeResultCode = (value) => {
  if (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
  ) {
    return String(value);
  }

  if (
    typeof value === "string" &&
    /^\d+$/.test(value)
  ) {
    return value;
  }

  return null;
};

/**
 * ============================================================
 * EVALUATE M-PESA EVIDENCE
 * ============================================================
 */

export const evaluateMpesaEvidence = ({
  payment,
  queryResult,
  callbackEvent = null,
} = {}) => {
  /**
   * STEP 1:
   * Require payment and provider-query data.
   */

  if (
    !payment ||
    !queryResult ||
    !validString(
      payment.providerTransactionId
    ) ||
    !validString(
      payment.merchantRequestId
    )
  ) {
    return evidenceResult({
      status:
        MPESA_EVIDENCE_STATUSES.QUERY_INCONCLUSIVE,

      reason:
        "MISSING_TRANSACTION_IDENTITY",
    });
  }

  /**
   * STEP 2:
   * Require provider checkout identity.
   *
   * Missing identity is inconclusive,
   * not automatically contradictory.
   */

  if (
    !validString(
      queryResult.checkoutRequestId
    )
  ) {
    return evidenceResult({
      status:
        MPESA_EVIDENCE_STATUSES.QUERY_INCONCLUSIVE,

      reason:
        "PROVIDER_CHECKOUT_ID_MISSING",
    });
  }

  /**
   * STEP 3:
   * Verify checkout identity.
   */

  if (
    queryResult.checkoutRequestId !==
    payment.providerTransactionId
  ) {
    return evidenceResult({
      status:
        MPESA_EVIDENCE_STATUSES.CONFLICT,

      reason:
        "PROVIDER_CHECKOUT_ID_MISMATCH",
    });
  }

  /**
   * STEP 4:
   * Require provider merchant identity.
   *
   * Do not manufacture a mismatch when
   * the provider omitted the identifier.
   */

  if (
    !validString(
      queryResult.merchantRequestId
    )
  ) {
    return evidenceResult({
      status:
        MPESA_EVIDENCE_STATUSES.QUERY_INCONCLUSIVE,

      reason:
        "PROVIDER_MERCHANT_ID_MISSING",
    });
  }

  /**
   * STEP 5:
   * Verify merchant identity.
   */

  if (
    queryResult.merchantRequestId !==
    payment.merchantRequestId
  ) {
    return evidenceResult({
      status:
        MPESA_EVIDENCE_STATUSES.CONFLICT,

      reason:
        "PROVIDER_MERCHANT_ID_MISMATCH",
    });
  }

  /**
   * STEP 6:
   * Check callback identity independently.
   */

  if (callbackEvent) {
    if (
      callbackEvent.checkoutRequestId !==
        payment.providerTransactionId ||
      callbackEvent.merchantRequestId !==
        payment.merchantRequestId ||
      callbackEvent.paymentId?.toString() !==
        payment._id.toString()
    ) {
      return evidenceResult({
        status:
          MPESA_EVIDENCE_STATUSES.CONFLICT,

        reason:
          "CALLBACK_IDENTITY_MISMATCH",
      });
    }

    /**
     * An already-conflicted callback
     * must not be treated as resolved.
     */

    if (
      callbackEvent.hasConflict === true
    ) {
      return evidenceResult({
        status:
          MPESA_EVIDENCE_STATUSES.CONFLICT,

        reason:
          "CALLBACK_ALREADY_CONFLICTED",
      });
    }
  }

  /**
   * STEP 7:
   * Validate provider response codes.
   */

  const responseCode =
    normalizeResultCode(
      queryResult.responseCode
    );

  const resultCode =
    normalizeResultCode(
      queryResult.resultCode
    );

  if (
    responseCode !== "0" ||
    resultCode === null
  ) {
    return evidenceResult({
      status:
        MPESA_EVIDENCE_STATUSES.QUERY_INCONCLUSIVE,

      reason:
        "PROVIDER_RESULT_INCOMPLETE",
    });
  }

  /**
   * STEP 8:
   * Determine provider-reported outcome.
   */

  const providerReportsSuccess =
    resultCode === "0";

  /**
   * STEP 9:
   * Compare callback outcome with provider.
   *
   * The callback result is a claim,
   * not independent payment verification.
   */

  if (callbackEvent) {
    if (
      !Number.isSafeInteger(
        callbackEvent.resultCode
      )
    ) {
      return evidenceResult({
        status:
          MPESA_EVIDENCE_STATUSES.QUERY_INCONCLUSIVE,

        reason:
          "CALLBACK_RESULT_INVALID",
      });
    }

    const callbackReportsSuccess =
      callbackEvent.resultCode === 0;

    if (
      callbackReportsSuccess !==
      providerReportsSuccess
    ) {
      return evidenceResult({
        status:
          MPESA_EVIDENCE_STATUSES.CONFLICT,

        reason:
          "CALLBACK_PROVIDER_CONFLICT",

        providerReportsSuccess,
      });
    }
  }

  /**
   * STEP 10:
   * Provider reports unsuccessful STK outcome.
   */

  if (!providerReportsSuccess) {
    return evidenceResult({
      status:
        MPESA_EVIDENCE_STATUSES.QUERY_FAILURE,

      reason:
        "PROVIDER_REPORTS_FAILURE",
    });
  }

  /**
   * STEP 11:
   * Provider reports successful STK outcome.
   *
   * This does not verify:
   *
   * - Settled amount.
   * - Receipt authenticity.
   * - Payer identity.
   * - Financial settlement.
   */

  return evidenceResult({
    status:
      MPESA_EVIDENCE_STATUSES.QUERY_SUCCESS,

    reason:
      "FINANCIAL_DETAILS_NOT_VERIFIED",

    providerReportsSuccess: true,
  });
};