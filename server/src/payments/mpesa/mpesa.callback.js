
/**
 * ============================================================
 * PREMIUMCHAT — M-PESA CALLBACK PARSER
 * ============================================================
 *
 * SECURITY:
 *
 * A callback is untrusted input.
 *
 * Parsing a callback does not verify payment.
 *
 * This module:
 *
 * - Validates callback structure.
 * - Extracts transaction identifiers.
 * - Validates callback metadata.
 * - Does not update database records.
 * - Does not activate subscriptions.
 */

const isValidRequestId = (value) =>
  typeof value === "string" &&
  value.length >= 8 &&
  value.length <= 255 &&
  /^[A-Za-z0-9_-]+$/.test(value);

const getMetadataValue = (items, name) => {
  if (!Array.isArray(items)) {
    return null;
  }

  const item = items.find(
    (entry) =>
      entry &&
      typeof entry === "object" &&
      !Array.isArray(entry) &&
      entry.Name === name
  );

  return item?.Value ?? null;
};

/**
 * ============================================================
 * PARSE STK CALLBACK
 * ============================================================
 */

export const parseMpesaStkCallback = (payload) => {
  const callback = payload?.Body?.stkCallback;

  if (
    !callback ||
    typeof callback !== "object" ||
    Array.isArray(callback)
  ) {
    throw new Error(
      "Invalid M-Pesa callback structure."
    );
  }

  const checkoutRequestId =
    callback.CheckoutRequestID;

  const merchantRequestId =
    callback.MerchantRequestID;

  if (
    !isValidRequestId(checkoutRequestId) ||
    !isValidRequestId(merchantRequestId)
  ) {
    throw new Error(
      "Invalid M-Pesa callback identifiers."
    );
  }

  const resultCode = callback.ResultCode;

  if (!Number.isSafeInteger(resultCode)) {
    throw new Error(
      "Invalid M-Pesa result code."
    );
  }

  const items = callback.CallbackMetadata?.Item;

  const amount = getMetadataValue(
    items,
    "Amount"
  );

  const receipt = getMetadataValue(
    items,
    "MpesaReceiptNumber"
  );

  const phoneNumber = getMetadataValue(
    items,
    "PhoneNumber"
  );

  if (
    receipt != null &&
    (
      typeof receipt !== "string" ||
      !/^[A-Za-z0-9]{8,30}$/.test(receipt)
    )
  ) {
    throw new Error(
      "Invalid M-Pesa receipt number."
    );
  }

  if (resultCode === 0) {
    if (
      typeof amount !== "number" ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      !Number.isSafeInteger(amount * 100) ||
      receipt == null
    ) {
      throw new Error(
        "Successful M-Pesa callback is missing valid payment metadata."
      );
    }
  }

  if (
    phoneNumber != null &&
    (
      typeof phoneNumber !== "number" ||
      !Number.isSafeInteger(phoneNumber) ||
      phoneNumber <= 0
    )
  ) {
    throw new Error(
      "Invalid M-Pesa callback phone number."
    );
  }

  return {
    checkoutRequestId,

    merchantRequestId,

    resultCode,

    providerReportsSuccess:
      resultCode === 0,

    amount,

    receipt:
      receipt == null
        ? null
        : receipt,

    phoneNumber:
      phoneNumber == null
        ? null
        : String(phoneNumber),
  };
};
