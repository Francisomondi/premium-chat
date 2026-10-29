/**
 * ============================================================
 * PREMIUMCHAT — MERCHANT TRANSACTION EVIDENCE VALIDATION
 * ============================================================
 *
 * Validates transaction details.
 *
 * IMPORTANT:
 * Matching details do not establish authenticity.
 */

const reject = (reason) => ({
  valid: false,
  reason,
});

export const validateMerchantTransactionEvidence = ({
  payment,
  transaction,
  expectedMerchantShortcode,
} = {}) => {
  if (!payment || !transaction) {
    return reject("EVIDENCE_MISSING");
  }

  const expectedReceipt =
    payment.transactionStatusEnquiry?.receiptNumber;

  if (
    typeof expectedReceipt !== "string" ||
    !/^[A-Za-z0-9]{8,30}$/.test(expectedReceipt)
  ) {
    return reject("EXPECTED_RECEIPT_MISSING");
  }

  if (
    transaction.receiptNumber !== expectedReceipt
  ) {
    return reject("RECEIPT_MISMATCH");
  }

  if (
    !Number.isSafeInteger(transaction.amountMinor) ||
    transaction.amountMinor <= 0 ||
    transaction.amountMinor !== payment.amountMinor
  ) {
    return reject("AMOUNT_MISMATCH");
  }

  if (
    transaction.currency !== "KES" ||
    transaction.currency !== payment.currency
  ) {
    return reject("CURRENCY_MISMATCH");
  }

  if (
    typeof expectedMerchantShortcode !== "string" ||
    !/^\d{5,10}$/.test(expectedMerchantShortcode) ||
    String(transaction.merchantShortcode) !==
      expectedMerchantShortcode
  ) {
    return reject("MERCHANT_MISMATCH");
  }

  if (transaction.status !== "COMPLETED") {
    return reject("TRANSACTION_NOT_COMPLETED");
  }

  if (transaction.direction !== "CREDIT") {
    return reject("TRANSACTION_NOT_INCOMING");
  }

  /**
   * Explicit confirmation is required.
   * An omitted reversal field is not proof
   * that the payment has not been reversed.
   */

  if (transaction.reversed !== false) {
    return reject("REVERSAL_STATUS_NOT_CONFIRMED");
  }

  return {
    valid: true,
    reason: "TRANSACTION_DETAILS_MATCH",
  };
};