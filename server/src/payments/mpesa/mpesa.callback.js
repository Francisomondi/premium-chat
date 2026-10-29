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
 * - Extracts payment metadata.
 * - Does not update database records.
 * - Does not activate subscriptions.
 */

const getMetadataValue = (
  items,
  name
) => {
  if (!Array.isArray(items)) {
    return null;
  }

  const item = items.find(
    (entry) =>
      entry &&
      entry.Name === name
  );

  return item?.Value ?? null;
};

/**
 * ============================================================
 * PARSE STK CALLBACK
 * ============================================================
 */

export const parseMpesaStkCallback =
  (payload) => {
    const callback =
      payload?.Body?.stkCallback;

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
      typeof checkoutRequestId !== "string" ||
      !/^[A-Za-z0-9_-]{8,255}$/.test(
        checkoutRequestId
      ) ||
      typeof merchantRequestId !== "string" ||
      merchantRequestId.length > 255 ||
      !merchantRequestId
    ) {
      throw new Error(
        "Invalid M-Pesa callback identifiers."
      );
    }

    const resultCode =
      callback.ResultCode;

    if (
      !Number.isSafeInteger(resultCode)
    ) {
      throw new Error(
        "Invalid M-Pesa result code."
      );
    }

    const items =
      callback.CallbackMetadata?.Item;

    const amount =
      getMetadataValue(
        items,
        "Amount"
      );

    const receipt =
      getMetadataValue(
        items,
        "MpesaReceiptNumber"
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

    const phoneNumber =
      getMetadataValue(
        items,
        "PhoneNumber"
      );

      if (
        resultCode === 0 &&
        (
          amount == null ||
          receipt == null
        )
      ) {
        throw new Error(
          "Successful M-Pesa callback is missing payment metadata."
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
          : String(receipt),

      phoneNumber:
        phoneNumber == null
          ? null
          : String(phoneNumber),
    };
  };