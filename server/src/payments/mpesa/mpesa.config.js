    /**
 * ============================================================
 * PREMIUMCHAT — M-PESA CONFIGURATION
 * ============================================================
 *
 * Server-side configuration only.
 *
 * No credentials are exposed to the frontend.
 */

const getRequiredEnv = (name) => {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}`
    );
  }

  return value;
};

export const getMpesaConfig = () => {
  const environment =
    process.env.MPESA_ENV || "sandbox";

  if (
    !["sandbox", "production"].includes(environment)
  ) {
    throw new Error(
      "MPESA_ENV must be sandbox or production."
    );
  }

  const shortcode =
    getRequiredEnv("MPESA_SHORTCODE");

  if (!/^\d{5,10}$/.test(shortcode)) {
    throw new Error(
      "MPESA_SHORTCODE must contain 5–10 digits."
    );
  }

  const transactionType =
    process.env.MPESA_TRANSACTION_TYPE ||
    "CustomerPayBillOnline";

  if (
    ![
      "CustomerPayBillOnline",
      "CustomerBuyGoodsOnline",
    ].includes(transactionType)
  ) {
    throw new Error(
      "Invalid MPESA_TRANSACTION_TYPE."
    );
  }

  const callbackUrl =
    getRequiredEnv("MPESA_CALLBACK_URL");

  const transactionStatusEnabled =
  process.env.MPESA_TRANSACTION_STATUS_ENABLED === "true";

let transactionStatus = null;

if (transactionStatusEnabled) {
  const initiatorName =
    getRequiredEnv("MPESA_INITIATOR_NAME");

  const securityCredential =
    getRequiredEnv("MPESA_SECURITY_CREDENTIAL");

  const resultUrl =
    getRequiredEnv("MPESA_TRANSACTION_STATUS_RESULT_URL");

  const timeoutUrl =
    getRequiredEnv("MPESA_TRANSACTION_STATUS_TIMEOUT_URL");

  for (const [name, value] of [
    ["MPESA_TRANSACTION_STATUS_RESULT_URL", resultUrl],
    ["MPESA_TRANSACTION_STATUS_TIMEOUT_URL", timeoutUrl],
  ]) {
    let parsedUrl;

    try {
      parsedUrl = new URL(value);
    } catch {
      throw new Error(`${name} must be a valid URL.`);
    }

    if (parsedUrl.protocol !== "https:") {
      throw new Error(`${name} must use HTTPS.`);
    }
  }

  transactionStatus = Object.freeze({
    initiatorName,
    securityCredential,
    resultUrl,
    timeoutUrl,
  });
}

  const parsedCallbackUrl =
    new URL(callbackUrl);

  if (parsedCallbackUrl.protocol !== "https:") {
    throw new Error(
      "MPESA_CALLBACK_URL must use HTTPS."
    );
  }

  return Object.freeze({
    environment,

    baseUrl:
      environment === "production"
        ? "https://api.safaricom.co.ke"
        : "https://sandbox.safaricom.co.ke",

    consumerKey:
      getRequiredEnv("MPESA_CONSUMER_KEY"),

    consumerSecret:
      getRequiredEnv("MPESA_CONSUMER_SECRET"),

    shortcode,

    passkey:
      getRequiredEnv("MPESA_PASSKEY"),

    transactionType,

    callbackUrl,

    paymentsEnabled:
      process.env.MPESA_PAYMENTS_ENABLED === "true",

    transactionStatusEnabled,

    transactionStatus,
  });
};