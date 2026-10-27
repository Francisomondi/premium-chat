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
  });
};