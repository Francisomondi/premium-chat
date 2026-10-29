/**
 * ============================================================
 * PREMIUMCHAT — MERCHANT TRANSACTION NORMALIZER
 * ============================================================
 *
 * Converts a transaction from a documented
 * merchant reporting adapter into the internal
 * PremiumChat transaction representation.
 *
 * IMPORTANT:
 *
 * This validates data structure only.
 *
 * It does not authenticate the source.
 */

const reject = (reason) => ({
  valid: false,
  reason,
  transaction: null,
});

const validReceipt = (value) =>
  typeof value === "string" &&
  /^[A-Za-z0-9]{8,30}$/.test(value);

const validAmount = (value) =>
  Number.isSafeInteger(value) &&
  value > 0;

const validShortcode = (value) =>
  typeof value === "string" &&
  /^\d{5,10}$/.test(value);

export const normalizeMerchantTransaction = (
  transaction
) => {
  if (
    !transaction ||
    typeof transaction !== "object" ||
    Array.isArray(transaction)
  ) {
    return reject("INVALID_TRANSACTION_OBJECT");
  }

  const {
    receiptNumber,
    amountMinor,
    currency,
    merchantShortcode,
    status,
    direction,
    reversed,
  } = transaction;

  if (!validReceipt(receiptNumber)) {
    return reject("INVALID_RECEIPT_NUMBER");
  }

  if (!validAmount(amountMinor)) {
    return reject("INVALID_TRANSACTION_AMOUNT");
  }

  if (currency !== "KES") {
    return reject("UNSUPPORTED_CURRENCY");
  }

  if (!validShortcode(merchantShortcode)) {
    return reject("INVALID_MERCHANT_SHORTCODE");
  }

  if (status !== "COMPLETED") {
    return reject("TRANSACTION_NOT_COMPLETED");
  }

  if (direction !== "CREDIT") {
    return reject("TRANSACTION_NOT_INCOMING");
  }

  if (reversed !== false) {
    return reject("REVERSAL_STATUS_UNCONFIRMED");
  }

  return {
    valid: true,

    reason: null,

    transaction: Object.freeze({
      receiptNumber,
      amountMinor,
      currency,
      merchantShortcode,
      status,
      direction,
      reversed,
    }),
  };
};