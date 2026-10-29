import {
  constants,
  publicEncrypt,
} from "node:crypto";

import {
  getMpesaConfig,
} from "./mpesa.config.js";

import {
  getMpesaAccessToken,
} from "./mpesa.client.js";

/**
 * ============================================================
 * PREMIUMCHAT — M-PESA TRANSACTION STATUS CLIENT
 * ============================================================
 *
 * MODULE 4.3.5.7.8.13.17.6.14.4
 *
 * SECURITY:
 *
 * - Server-side only.
 * - Requires an authorized API Initiator.
 * - Does not verify financial settlement.
 * - Does not update payment records.
 * - Does not activate subscriptions.
 * - Does not grant paid access.
 *
 * A successful API acknowledgement means only
 * that Safaricom accepted the status query.
 */

const REQUEST_TIMEOUT_MS = 15_000;

const TRANSACTION_STATUS_PATH =
  "/mpesa/transactionstatus/v1/query";

const TRANSACTION_STATUS_COMMAND =
  "TransactionStatusQuery";

const PAYBILL_IDENTIFIER_TYPE = "4";

/**
 * Validate a configured HTTPS callback URL.
 */
const validateCallbackUrl = (value, fieldName) => {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${fieldName}_MISSING`);
  }

  let parsed;

  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${fieldName}_INVALID`);
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.hash
  ) {
    throw new Error(`${fieldName}_INVALID`);
  }

  return parsed.toString();
};

/**
 * Validate the M-Pesa receipt number.
 *
 * Receipt format validation is deliberately
 * conservative. The exact accepted format
 * should be checked against your real
 * Safaricom transaction records.
 */
const validateReceipt = (receipt) => {
  if (
    typeof receipt !== "string" ||
    !/^[A-Za-z0-9]{8,30}$/.test(receipt)
  ) {
    throw new Error("INVALID_MPESA_RECEIPT");
  }

  return receipt;
};

/**
 * Generate the SecurityCredential.
 *
 * The API Initiator password is encrypted
 * using Safaricom's configured public key.
 *
 * Never use the STK Passkey here.
 */
export const generateMpesaSecurityCredential = ({
  initiatorPassword,
  publicCertificate,
} = {}) => {
  if (
    typeof initiatorPassword !== "string" ||
    !initiatorPassword
  ) {
    throw new Error("MPESA_INITIATOR_PASSWORD_MISSING");
  }

  if (
    typeof publicCertificate !== "string" ||
    !publicCertificate.includes(
      "-----BEGIN CERTIFICATE-----"
    )
  ) {
    throw new Error("MPESA_PUBLIC_CERTIFICATE_INVALID");
  }

  const encrypted = publicEncrypt(
    {
      key: publicCertificate,
      padding: constants.RSA_PKCS1_PADDING,
    },
    Buffer.from(initiatorPassword, "utf8")
  );

  return encrypted.toString("base64");
};

/**
 * Submit an asynchronous Transaction Status query.
 *
 * IMPORTANT:
 * The returned response is an acknowledgement,
 * not authenticated financial settlement proof.
 */
export const requestMpesaTransactionStatus = async ({
  mpesaReceiptNumber,
} = {}) => {
  if (
    process.env.MPESA_TRANSACTION_STATUS_ENABLED !==
    "true"
  ) {
    throw new Error(
      "MPESA_TRANSACTION_STATUS_NOT_ENABLED"
    );
  }

  const config = getMpesaConfig();

  const receipt = validateReceipt(
    mpesaReceiptNumber
  );

  const initiatorName =
    process.env.MPESA_INITIATOR_NAME;

  const initiatorPassword =
    process.env.MPESA_INITIATOR_PASSWORD;

  const publicCertificate =
    process.env.MPESA_PUBLIC_CERTIFICATE?.replace(
      /\\n/g,
      "\n"
    );

  const resultUrl = validateCallbackUrl(
    process.env.MPESA_TRANSACTION_STATUS_RESULT_URL,
    "MPESA_TRANSACTION_STATUS_RESULT_URL"
  );

  const timeoutUrl = validateCallbackUrl(
    process.env.MPESA_TRANSACTION_STATUS_TIMEOUT_URL,
    "MPESA_TRANSACTION_STATUS_TIMEOUT_URL"
  );

  if (
    typeof initiatorName !== "string" ||
    !initiatorName.trim()
  ) {
    throw new Error("MPESA_INITIATOR_NAME_MISSING");
  }

  if (
    !/^\d{5,7}$/.test(String(config.shortcode))
  ) {
    throw new Error("INVALID_MPESA_PAYBILL_SHORTCODE");
  }

  const securityCredential =
    generateMpesaSecurityCredential({
      initiatorPassword,
      publicCertificate,
    });

  const accessToken =
    await getMpesaAccessToken();

  const payload = {
    Initiator: initiatorName.trim(),

    SecurityCredential: securityCredential,

    CommandID: TRANSACTION_STATUS_COMMAND,

    TransactionID: receipt,

    PartyA: String(config.shortcode),

    IdentifierType: PAYBILL_IDENTIFIER_TYPE,

    ResultURL: resultUrl,

    QueueTimeOutURL: timeoutUrl,

    Remarks: "PremiumChat payment verification",

    Occasion: "Subscription payment",
  };

  const response = await fetch(
    `${config.baseUrl}${TRANSACTION_STATUS_PATH}`,
    {
      method: "POST",

      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },

      body: JSON.stringify(payload),

      signal: AbortSignal.timeout(
        REQUEST_TIMEOUT_MS
      ),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    const error = new Error(
      "MPESA_TRANSACTION_STATUS_REQUEST_FAILED"
    );

    error.statusCode = response.status;

    throw error;
  }

  const responseCode = String(
    data?.ResponseCode ?? ""
  );

  if (responseCode !== "0") {
    return {
      accepted: false,

      responseCode,

      reason:
        "MPESA_TRANSACTION_STATUS_REQUEST_REJECTED",

      financialDetailsVerified: false,

      paymentVerified: false,
    };
  }

  if (
    !data?.ConversationID ||
    !data?.OriginatorConversationID
  ) {
    throw new Error(
      "MPESA_TRANSACTION_STATUS_ACKNOWLEDGEMENT_INCOMPLETE"
    );
  }

  return {
    accepted: true,

    responseCode,

    conversationId:
      data.ConversationID,

    originatorConversationId:
      data.OriginatorConversationID,

    mpesaReceiptNumber: receipt,

    /**
     * Acknowledgement is not settlement.
     */
    financialDetailsVerified: false,

    paymentVerified: false,

    subscriptionActivated: false,
  };
};