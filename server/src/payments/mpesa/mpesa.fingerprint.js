import {
  createHmac,
} from "node:crypto";

/**
 * ============================================================
 * PREMIUMCHAT — M-PESA PHONE FINGERPRINT
 * ============================================================
 *
 * HMAC-SHA256 prevents straightforward
 * offline guessing of stored phone numbers.
 */

export const fingerprintMpesaPhone = (
  normalizedPhone
) => {
  if (
    typeof normalizedPhone !== "string" ||
    !/^254[17]\d{8}$/.test(normalizedPhone)
  ) {
    throw new Error(
      "Invalid normalized M-Pesa phone."
    );
  }

  const secret =
    process.env.MPESA_PHONE_HMAC_KEY;

  if (
    typeof secret !== "string" ||
    secret.length < 32
  ) {
    throw new Error(
      "MPESA_PHONE_HMAC_KEY must be configured."
    );
  }

  return createHmac(
    "sha256",
    secret
  )
    .update(normalizedPhone)
    .digest("hex");
};