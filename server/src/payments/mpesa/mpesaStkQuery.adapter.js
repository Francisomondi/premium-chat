import crypto from "node:crypto";

/**
 * ============================================================
 * PREMIUMCHAT — DARAJA STK QUERY ADAPTER
 * ============================================================
 *
 * STEP 19.8.11
 *
 * Uses standard Safaricom Daraja credentials.
 *
 * SECURITY:
 *
 * - Server-side credentials only.
 * - Fixed Safaricom API hosts.
 * - No caller-controlled URLs.
 * - No payment or subscription database writes.
 * - No automatic entitlement activation.
 * - An accepted query is not a successful payment.
 */

const STK_QUERY_STATUSES = Object.freeze({
  SUCCESS: "SUCCESS",
  FAILED: "FAILED",
  PENDING: "PENDING",
  INCONCLUSIVE: "INCONCLUSIVE",
  UNAVAILABLE: "UNAVAILABLE",
});

const API_HOSTS = Object.freeze({
  sandbox: "https://sandbox.safaricom.co.ke",
  production: "https://api.safaricom.co.ke",
});

const validString = (value) =>
  typeof value === "string" &&
  value.trim().length > 0;

const unavailable = (reason) => ({
  status: STK_QUERY_STATUSES.UNAVAILABLE,
  reason,
  checkoutRequestId: null,
  resultCode: null,
  resultDescription: null,
  authenticatedQuery: false,
});

const getConfig = () => {
  const environment =
    process.env.MPESA_ENVIRONMENT || "sandbox";

  if (!Object.hasOwn(API_HOSTS, environment)) {
    throw new Error(
      "MPESA_ENVIRONMENT must be sandbox or production."
    );
  }

  const consumerKey = process.env.MPESA_CONSUMER_KEY;
  const consumerSecret = process.env.MPESA_CONSUMER_SECRET;
  const shortcode = process.env.MPESA_SHORTCODE;
  const passkey = process.env.MPESA_PASSKEY;

  if (
    !validString(consumerKey) ||
    !validString(consumerSecret) ||
    !validString(shortcode) ||
    !validString(passkey)
  ) {
    throw new Error(
      "Missing required Daraja STK Query credentials."
    );
  }

  return {
    baseUrl: API_HOSTS[environment],
    consumerKey,
    consumerSecret,
    shortcode,
    passkey,
  };
};

const getTimestamp = () => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value])
  );

  return (
    values.year +
    values.month +
    values.day +
    values.hour +
    values.minute +
    values.second
  );
};

const getAccessToken = async (config) => {
  const credentials = Buffer.from(
    `${config.consumerKey}:${config.consumerSecret}`
  ).toString("base64");

  const url =
    `${config.baseUrl}/oauth/v1/generate` +
    "?grant_type=client_credentials";

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Basic ${credentials}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(
      `Daraja OAuth request failed: ${response.status}`
    );
  }

  const data = await response.json();

  if (!validString(data.access_token)) {
    throw new Error(
      "Daraja did not return a valid access token."
    );
  }

  return data.access_token;
};

const normalizeResult = (
  response,
  checkoutRequestId
) => {
  if (
    response.CheckoutRequestID !== checkoutRequestId
  ) {
    return {
      status: STK_QUERY_STATUSES.INCONCLUSIVE,
      reason: "CHECKOUT_REQUEST_ID_MISMATCH",
      checkoutRequestId,
      resultCode: null,
      resultDescription: null,
      authenticatedQuery: true,
    };
  }

  if (String(response.ResponseCode) !== "0") {
    return {
      status: STK_QUERY_STATUSES.INCONCLUSIVE,
      reason: "STK_QUERY_NOT_ACCEPTED",
      checkoutRequestId,
      resultCode: null,
      resultDescription:
        response.ResponseDescription || null,
      authenticatedQuery: true,
    };
  }

  const resultCode = response.ResultCode;

  if (
    resultCode === undefined ||
    resultCode === null
  ) {
    return {
      status: STK_QUERY_STATUSES.PENDING,
      reason: "PAYMENT_RESULT_NOT_AVAILABLE",
      checkoutRequestId,
      resultCode: null,
      resultDescription: null,
      authenticatedQuery: true,
    };
  }

  const code = String(resultCode);

  return {
    status:
      code === "0"
        ? STK_QUERY_STATUSES.SUCCESS
        : STK_QUERY_STATUSES.FAILED,

    reason:
      code === "0"
        ? null
        : "STK_PAYMENT_NOT_SUCCESSFUL",

    checkoutRequestId,

    resultCode: code,

    resultDescription:
      response.ResultDesc || null,

    authenticatedQuery: true,
  };
};

/**
 * ============================================================
 * QUERY SAFARICOM STK PAYMENT RESULT
 * ============================================================
 */

export const queryMpesaStkPayment = async ({
  checkoutRequestId,
} = {}) => {
  if (
    !validString(checkoutRequestId) ||
    !/^[A-Za-z0-9_-]{8,150}$/.test(
      checkoutRequestId
    )
  ) {
    return unavailable(
      "INVALID_CHECKOUT_REQUEST_ID"
    );
  }

  try {
    const config = getConfig();

    const accessToken =
      await getAccessToken(config);

    const timestamp = getTimestamp();

    const password = Buffer.from(
      `${config.shortcode}${config.passkey}${timestamp}`
    ).toString("base64");

    const response = await fetch(
      `${config.baseUrl}/mpesa/stkpushquery/v1/query`,
      {
        method: "POST",

        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },

        body: JSON.stringify({
          BusinessShortCode: config.shortcode,
          Password: password,
          Timestamp: timestamp,
          CheckoutRequestID: checkoutRequestId,
        }),

        signal: AbortSignal.timeout(20000),
      }
    );

    if (!response.ok) {
      return unavailable(
        `DARAJA_STK_QUERY_HTTP_${response.status}`
      );
    }

    const data = await response.json();

    return normalizeResult(
      data,
      checkoutRequestId
    );
  } catch (error) {
    console.error(
      "[M-Pesa STK Query]",
      error instanceof Error
        ? error.message
        : "Unknown query error"
    );

    return unavailable(
      "DARAJA_STK_QUERY_UNAVAILABLE"
    );
  }
};

export {
  STK_QUERY_STATUSES,
};

export default {
  queryMpesaStkPayment,
  STK_QUERY_STATUSES,
};