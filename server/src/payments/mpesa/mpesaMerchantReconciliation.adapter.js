import {
  getMpesaMerchantSourceConfig,
} from "./mpesaMerchantSource.config.js";

import {
  normalizeMerchantTransaction,
} from "./mpesaMerchantTransaction.normalizer.js";

/**
 * ============================================================
 * PREMIUMCHAT — AUTHENTICATED MERCHANT RECONCILIATION ADAPTER
 * ============================================================
 *
 * Responsibilities:
 *
 * - Validate reconciliation requests.
 * - Enforce merchant source configuration.
 * - Reject unsupported provider integrations.
 * - Normalize authenticated merchant transactions.
 * - Return a consistent reconciliation result.
 *
 * SECURITY:
 *
 * This adapter must never manufacture transaction
 * evidence from unauthenticated callback data.
 *
 * No payment or subscription writes occur here.
 */

export const MERCHANT_RECONCILIATION_STATUSES =
  Object.freeze({
    VERIFIED: "VERIFIED",
    NOT_FOUND: "NOT_FOUND",
    INCONCLUSIVE: "INCONCLUSIVE",
    UNAVAILABLE: "UNAVAILABLE",
  });

const unavailable = (reason) => ({
  status:
    MERCHANT_RECONCILIATION_STATUSES.UNAVAILABLE,

  reason,

  authenticated: false,

  transaction: null,

  evidenceReference: null,
});

/**
 * ============================================================
 * AUTHENTICATED PROVIDER TRANSACTION FETCH
 * ============================================================
 *
 * The provider-specific API implementation
 * must be added only after its documented
 * contract has been established.
 */

const fetchSafaricomBusinessTransaction =
  async () => {
    return unavailable(
      "SAFARICOM_BUSINESS_REPORTING_API_NOT_INTEGRATED"
    );
  };

/**
 * ============================================================
 * PUBLIC MERCHANT ADAPTER
 * ============================================================
 */

export const fetchAuthenticatedMerchantTransaction =
  async ({ receiptNumber } = {}) => {
    if (
      typeof receiptNumber !== "string" ||
      !/^[A-Za-z0-9]{8,30}$/.test(receiptNumber)
    ) {
      return unavailable("INVALID_RECEIPT_NUMBER");
    }

    const config =
      getMpesaMerchantSourceConfig();

    if (!config.enabled) {
      return unavailable(config.reason);
    }

    const result =
      await fetchSafaricomBusinessTransaction({
        receiptNumber,
      });

    /*
     * Do not trust a VERIFIED label alone.
     *
     * The provider implementation must first
     * establish authenticated provenance.
     */

    if (
      result.status !==
        MERCHANT_RECONCILIATION_STATUSES.VERIFIED ||
      result.authenticated !== true ||
      typeof result.evidenceReference !== "string" ||
      !result.evidenceReference.trim()
    ) {
      return unavailable(
        result.reason ||
          "AUTHENTICATED_MERCHANT_EVIDENCE_UNAVAILABLE"
      );
    }

    const normalized =
      normalizeMerchantTransaction(
        result.transaction
      );

    if (!normalized.valid) {
      return {
        status:
          MERCHANT_RECONCILIATION_STATUSES.INCONCLUSIVE,

        reason: normalized.reason,

        authenticated: false,

        transaction: null,

        evidenceReference: null,
      };
    }

    return {
      status:
        MERCHANT_RECONCILIATION_STATUSES.VERIFIED,

      reason: null,

      authenticated: true,

      transaction: normalized.transaction,

      evidenceReference:
        result.evidenceReference.trim(),
    };
  };