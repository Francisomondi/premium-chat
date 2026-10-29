import MpesaPaymentEvidence from "../models/MpesaPaymentEvidence.model.js";

/**
 * ============================================================
 * PREMIUMCHAT — IDEMPOTENT EVIDENCE RECORDING
 * ============================================================
 *
 * MODULE 4.3.5.7.8.13.17.6.12
 *
 * RESPONSIBILITIES:
 *
 * - Persist provider-query evidence.
 * - Enforce operation-level idempotency.
 * - Preserve existing evidence history.
 * - Reject conflicting operation identities.
 *
 * SECURITY:
 *
 * - No payment verification.
 * - No payment success assignment.
 * - No subscription activation.
 */

const validString = (value) =>
  typeof value === "string" &&
  value.trim().length > 0;

/**
 * ============================================================
 * RECORD PROVIDER-QUERY EVIDENCE
 * ============================================================
 */

export const recordMpesaQueryEvidence =
  async ({
    reconciliationOperationId,
    paymentId,
    checkoutRequestId,
    merchantRequestId,
    status,
    responseCode,
    resultCode,
    queriedAt = new Date(),
  } = {}) => {
    if (
      !validString(
        reconciliationOperationId
      )
    ) {
      throw new Error(
        "RECONCILIATION_OPERATION_ID_REQUIRED"
      );
    }

    const evidenceData = {
      reconciliationOperationId,

      paymentId,

      checkoutRequestId,

      merchantRequestId,

      source:
        "DARAJA_STK_QUERY",

      status,

      responseCode:
        responseCode == null
          ? null
          : String(responseCode),

      resultCode:
        resultCode == null
          ? null
          : String(resultCode),

      queriedAt,

      financialDetailsVerified:
        false,

      entitlementAuthorized:
        false,
    };

    /**
     * First attempt to insert.
     */

    try {
      const evidence =
        await MpesaPaymentEvidence.create(
          evidenceData
        );

      return {
        evidence,

        created: true,

        duplicate: false,
      };
    } catch (error) {
      /**
       * Only duplicate-key errors may
       * indicate an existing operation.
       */

      if (
        error?.code !== 11000
      ) {
        throw error;
      }

      /**
       * Retrieve the existing operation.
       */

      const existing =
        await MpesaPaymentEvidence.findOne({
          reconciliationOperationId,
        });

      if (!existing) {
        throw new Error(
          "RECONCILIATION_OPERATION_CONFLICT"
        );
      }

      /**
       * The operation ID must not be reused
       * for another payment or provider identity.
       */

      if (
        existing.paymentId.toString() !==
          paymentId.toString() ||
        existing.checkoutRequestId !==
          checkoutRequestId ||
        existing.merchantRequestId !==
          merchantRequestId
      ) {
        throw new Error(
          "RECONCILIATION_OPERATION_IDENTITY_CONFLICT"
        );
      }

      /**
       * An operation ID must also not be
       * reused for contradictory query outcomes.
       */

      if (
        existing.status !== status ||
        existing.responseCode !==
          evidenceData.responseCode ||
        existing.resultCode !==
          evidenceData.resultCode
      ) {
        throw new Error(
          "RECONCILIATION_OPERATION_RESULT_CONFLICT"
        );
      }

      return {
        evidence: existing,

        created: false,

        duplicate: true,
      };
    }
  };