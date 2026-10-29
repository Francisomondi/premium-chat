/**
 * ============================================================
 * PREMIUMCHAT — AUTHENTICATED MERCHANT SOURCE CONFIG
 * ============================================================
 *
 * Controls integration with an independently
 * authenticated merchant transaction source.
 *
 * SECURITY:
 *
 * - Disabled by default.
 * - No arbitrary merchant API URLs.
 * - No fallback to STK callbacks.
 * - No fallback to client-submitted receipts.
 * - No automatic settlement without a verified source.
 */

export const MERCHANT_SOURCE_TYPES = Object.freeze({
  SAFARICOM_BUSINESS_API: "SAFARICOM_BUSINESS_API",
});

export const getMpesaMerchantSourceConfig = () => {
  const enabled =
    process.env.MPESA_MERCHANT_RECONCILIATION_ENABLED ===
    "true";

  const sourceType =
    process.env.MPESA_MERCHANT_SOURCE_TYPE ||
    MERCHANT_SOURCE_TYPES.SAFARICOM_BUSINESS_API;

  if (
    !Object.values(MERCHANT_SOURCE_TYPES).includes(
      sourceType
    )
  ) {
    throw new Error(
      "Unsupported M-Pesa merchant source type."
    );
  }

  const automaticSettlementEnabled =
    process.env.MPESA_AUTOMATIC_SETTLEMENT_ENABLED ===
    "true";

  /*
   * An authenticated reporting integration must
   * be explicitly approved and implemented before
   * automatic settlement can be enabled.
   */

  const providerContractImplemented = false;

  if (enabled && !providerContractImplemented) {
    return Object.freeze({
      enabled: false,
      requestedEnabled: true,
      sourceType,
      providerContractImplemented: false,
      automaticSettlementEnabled: false,
      reason: "MERCHANT_PROVIDER_CONTRACT_NOT_IMPLEMENTED",
    });
  }

  return Object.freeze({
    enabled: false,
    requestedEnabled: enabled,
    sourceType,
    providerContractImplemented,
    automaticSettlementEnabled: false,
    reason: automaticSettlementEnabled
      ? "AUTOMATIC_SETTLEMENT_REQUIRES_TRUSTED_SOURCE"
      : "MERCHANT_SOURCE_DISABLED",
  });
};