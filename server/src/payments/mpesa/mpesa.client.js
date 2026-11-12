
import {
  getMpesaConfig,
} from "./mpesa.config.js";

export const MPESA_QUERY_OPERATION_TIMEOUT_MS = 45_000;

/**
 * ============================================================
 * PREMIUMCHAT — SAFARICOM DARAJA CLIENT
 * ============================================================
 *
 * Responsibilities:
 *
 * 1. Obtain OAuth access tokens.
 * 2. Initiate STK Push requests.
 * 3. Query STK Push transaction outcomes.
 * 4. Query M-Pesa transaction status.
 *
 * SECURITY:
 *
 * - Never exposes credentials.
 * - Never logs phone numbers or payment passwords.
 * - Never modifies payment or subscription records.
 * - Never marks payments verified.
 * - Never activates subscriptions.
 *
 * Node.js 22+ built-in fetch is used.
 */

const REQUEST_TIMEOUT_MS = 15000;

let cachedToken = null;

let tokenExpiresAt = 0;

/**
 * ============================================================
 * STRUCTURED M-PESA DIAGNOSTIC LOGGING
 * ============================================================
 *
 * Never pass credentials, request payloads, phone numbers,
 * access tokens, passwords or security credentials here.
 */

const logMpesaDiagnostic = (
  event,
  details = {}
) => {
  const entry = {
    timestamp: new Date().toISOString(),
    event,
    ...details,
  };

  console.info(
    "[MPESA_DIAGNOSTIC]",
    JSON.stringify(entry)
  );
};

/**
 * ============================================================
 * HTTP REQUEST HELPER
 * ============================================================
 *
 * stkRequestSubmitted means whether the actual STK Push
 * request may have been submitted.
 *
 * It is deliberately false for OAuth and reconciliation
 * requests because those are not the original STK Push.
 *
 * For an STK POST, it is true as soon as fetch is attempted.
 * This is conservative: a network failure does not prove
 * whether Safaricom received the request.
 */

const requestJson = async (
  url,
  options = {},
  context = {}
) => {
  const {
    stage = "UNKNOWN",
    stkRequestSubmitted = false,
  } = context;

  logMpesaDiagnostic("REQUEST_STARTED", {
    stage,
    stkRequestSubmitted,
  });

  let response;

  try {
    response = await fetch(url, {
      ...options,

      signal: AbortSignal.timeout(
        REQUEST_TIMEOUT_MS
      ),
    });
  } catch (cause) {
    const error = new Error(
      `Daraja ${stage} network request failed.`
    );

    error.code = "MPESA_NETWORK_ERROR";
    error.stage = stage;
    error.requestSubmitted =
      stkRequestSubmitted;
    error.cause = cause;

    console.error(
      "[MPESA_DIAGNOSTIC]",
      {
        event: "REQUEST_NETWORK_FAILURE",
        stage,
        stkRequestSubmitted,
        errorName:
          cause?.name || "UnknownError",
        errorCode:
          cause?.code || null,
      }
    );

    throw error;
  }

  let raw;

  try {
    raw = await response.text();
  } catch (cause) {
    const error = new Error(
      `Daraja ${stage} response could not be read.`
    );

    error.code =
      "MPESA_RESPONSE_READ_FAILED";

    error.stage = stage;

    error.requestSubmitted =
      stkRequestSubmitted;

    error.cause = cause;

    console.error(
      "[MPESA_DIAGNOSTIC]",
      {
        event: "RESPONSE_READ_FAILURE",
        stage,
        stkRequestSubmitted,
        httpStatus: response.status,
        errorName:
          cause?.name || "UnknownError",
      }
    );

    throw error;
  }

  let data;

  try {
    data = JSON.parse(raw);
  } catch (cause) {
    const error = new Error(
      "Daraja returned an invalid JSON response."
    );

    error.code = "MPESA_INVALID_JSON";
    error.stage = stage;

    error.requestSubmitted =
      stkRequestSubmitted;

    error.cause = cause;

    console.error(
      "[MPESA_DIAGNOSTIC]",
      {
        event: "INVALID_JSON_RESPONSE",
        stage,
        stkRequestSubmitted,
        httpStatus: response.status,
      }
    );

    throw error;
  }

  if (!response.ok) {
    const error = new Error(
      "Daraja API request failed."
    );

    error.statusCode = response.status;

    error.providerErrorCode =
      data?.errorCode || null;

    error.stage = stage;

    error.requestSubmitted =
      stkRequestSubmitted;

    console.error(
      "[MPESA_DIAGNOSTIC]",
      {
        event: "HTTP_FAILURE",
        stage,
        stkRequestSubmitted,
        httpStatus: response.status,
        providerErrorCode:
          error.providerErrorCode,
      }
    );

    throw error;
  }

  logMpesaDiagnostic(
    "REQUEST_RESPONSE_RECEIVED",
    {
      stage,
      stkRequestSubmitted,
      httpStatus: response.status,

      providerResponseCode:
        data?.ResponseCode ?? null,

      checkoutRequestIdPresent:
        Boolean(data?.CheckoutRequestID),

      merchantRequestIdPresent:
        Boolean(data?.MerchantRequestID),

      conversationIdPresent:
        Boolean(data?.ConversationID),

      originatorConversationIdPresent:
        Boolean(
          data?.OriginatorConversationID
        ),
    }
  );

  return data;
};

/**
 * ============================================================
 * GET ACCESS TOKEN
 * ============================================================
 */

export const getMpesaAccessToken =
  async () => {
    if (
      cachedToken &&
      Date.now() < tokenExpiresAt
    ) {
      logMpesaDiagnostic(
        "OAUTH_CACHED_TOKEN_USED"
      );

      return cachedToken;
    }

    const config = getMpesaConfig();

    const credentials = Buffer.from(
      `${config.consumerKey}:${config.consumerSecret}`
    ).toString("base64");

    const data = await requestJson(
      `${config.baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
      {
        method: "GET",

        headers: {
          Authorization:
            `Basic ${credentials}`,
        },
      },
      {
        stage: "OAUTH",
        stkRequestSubmitted: false,
      }
    );

    if (
      typeof data?.access_token !== "string" ||
      !data.access_token
    ) {
      logMpesaDiagnostic(
        "OAUTH_TOKEN_MISSING"
      );

      throw new Error(
        "Daraja did not return an access token."
      );
    }

    const expiresIn =
      Number(data.expires_in);

    if (
      !Number.isFinite(expiresIn) ||
      expiresIn <= 0
    ) {
      logMpesaDiagnostic(
        "OAUTH_INVALID_TOKEN_LIFETIME"
      );

      throw new Error(
        "Daraja returned an invalid token lifetime."
      );
    }

    cachedToken = data.access_token;

    tokenExpiresAt =
      Date.now() +
      Math.max(
        0,
        expiresIn - 60
      ) * 1000;

    logMpesaDiagnostic(
      "OAUTH_TOKEN_ACQUIRED",
      {
        expiresInSeconds: expiresIn,
      }
    );

    return cachedToken;
  };

/**
 * ============================================================
 * GENERATE DARAJA TIMESTAMP
 * ============================================================
 *
 * Uses Africa/Nairobi time.
 */

const getMpesaTimestamp = () => {
  const parts = new Intl.DateTimeFormat(
    "en-GB",
    {
      timeZone: "Africa/Nairobi",

      year: "numeric",
      month: "2-digit",
      day: "2-digit",

      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",

      hourCycle: "h23",
    }
  ).formatToParts(new Date());

  const values = Object.fromEntries(
    parts.map((part) => [
      part.type,
      part.value,
    ])
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

/**
 * ============================================================
 * GENERATE STK PASSWORD
 * ============================================================
 */

const generateMpesaPassword = (
  shortcode,
  passkey,
  timestamp
) => {
  return Buffer.from(
    `${shortcode}${passkey}${timestamp}`
  ).toString("base64");
};

/**
 * ============================================================
 * VALIDATE PHONE NUMBER
 * ============================================================
 *
 * Accepted:
 *
 * 0712345678
 * 0112345678
 * 254712345678
 * +254712345678
 *
 * Returns:
 *
 * 254712345678
 */

export const normalizeMpesaPhone = (
  value
) => {
  if (typeof value !== "string") {
    throw new Error(
      "Phone number must be a string."
    );
  }

  const input = value.trim();

  let normalized = input;

  if (/^0[17]\d{8}$/.test(input)) {
    normalized = `254${input.slice(1)}`;
  } else if (
    /^\+254[17]\d{8}$/.test(input)
  ) {
    normalized = input.slice(1);
  }

  if (
    !/^254[17]\d{8}$/.test(normalized)
  ) {
    throw new Error(
      "Invalid Kenyan mobile phone number."
    );
  }

  return normalized;
};

/**
 * ============================================================
 * CONVERT MINOR UNITS TO KES
 * ============================================================
 *
 * 50000 minor units = KES 500
 *
 * No rounding is permitted.
 */

export const convertMinorToKes = (
  amountMinor
) => {
  if (
    !Number.isSafeInteger(amountMinor) ||
    amountMinor <= 0 ||
    amountMinor % 100 !== 0
  ) {
    throw new Error(
      "M-Pesa amount must be a positive whole-shilling amount."
    );
  }

  const amountKes =
    amountMinor / 100;

  if (
    !Number.isSafeInteger(amountKes)
  ) {
    throw new Error(
      "M-Pesa amount exceeds the supported range."
    );
  }

  return amountKes;
};

/**
 * ============================================================
 * INITIATE STK PUSH
 * ============================================================
 *
 * IMPORTANT:
 *
 * This function is a provider client.
 *
 * It must only be called by a trusted payment
 * initiation service that has already:
 *
 * - Authenticated the subscriber.
 * - Validated the purchase.
 * - Calculated the payment amount.
 * - Created an idempotent payment attempt.
 *
 * ResponseCode 0 means accepted for processing,
 * NOT successfully paid.
 */

export const initiateMpesaStkPush =
  async ({
    phoneNumber,
    amountMinor,
    accountReference,
  }) => {
    const config = getMpesaConfig();

    if (!config.paymentsEnabled) {
      throw new Error(
        "M-Pesa payments are currently disabled."
      );
    }

    const phone =
      normalizeMpesaPhone(phoneNumber);

    const amount =
      convertMinorToKes(amountMinor);

    if (
      typeof accountReference !== "string" ||
      !/^[A-Za-z0-9]{1,12}$/.test(
        accountReference
      )
    ) {
      throw new Error(
        "Invalid M-Pesa account reference."
      );
    }

    const timestamp =
      getMpesaTimestamp();

    const password =
      generateMpesaPassword(
        config.shortcode,
        config.passkey,
        timestamp
      );

    let accessToken;

    try {
      accessToken =
        await getMpesaAccessToken();
    } catch (cause) {
      /*
       * OAuth happens before the STK POST.
       * This invocation has not submitted an STK request.
       */

      logMpesaDiagnostic(
        "STK_INITIATION_ABORTED_OAUTH",
        {
          stkRequestSubmitted: false,
          causeCode:
            cause?.code || null,
          causeStage:
            cause?.stage || "OAUTH",
        }
      );

      const error = new Error(
        "M-Pesa OAuth token acquisition failed."
      );

      error.code = "MPESA_OAUTH_FAILED";
      error.stage = "OAUTH";
      error.requestSubmitted = false;
      error.cause = cause;

      throw error;
    }

    const payload = {
      BusinessShortCode:
        config.shortcode,

      Password:
        password,

      Timestamp:
        timestamp,

      TransactionType:
        config.transactionType,

      Amount:
        amount,

      PartyA:
        phone,

      PartyB:
        config.shortcode,

      PhoneNumber:
        phone,

      CallBackURL:
        config.callbackUrl,

      AccountReference:
        accountReference,

      TransactionDesc:
        "PremiumChat",
    };

    logMpesaDiagnostic(
      "STK_POST_ABOUT_TO_SUBMIT",
      {
        stkRequestSubmitted: false,
      }
    );

    let data;

    try {
      data = await requestJson(
        `${config.baseUrl}/mpesa/stkpush/v1/processrequest`,
        {
          method: "POST",

          headers: {
            Authorization:
              `Bearer ${accessToken}`,

            "Content-Type":
              "application/json",
          },

          body:
            JSON.stringify(payload),
        },
        {
          stage: "STK_POST",
          stkRequestSubmitted: true,
        }
      );
    } catch (cause) {
      /*
       * Once the STK POST is attempted, a network,
       * timeout, HTTP or response parsing error does
       * not prove Safaricom failed to receive it.
       *
       * Do not classify this as a safe rejection.
       */

      logMpesaDiagnostic(
        "STK_POST_OUTCOME_UNCERTAIN",
        {
          stkRequestSubmitted: true,
          errorCode:
            cause?.code || null,
          errorStage:
            cause?.stage || "STK_POST",
          httpStatus:
            cause?.statusCode || null,
          providerErrorCode:
            cause?.providerErrorCode || null,
        }
      );

      throw cause;
    }

    if (
      String(data?.ResponseCode) !== "0" ||
      !data?.CheckoutRequestID ||
      !data?.MerchantRequestID
    ) {
      logMpesaDiagnostic(
        "STK_PROVIDER_ACCEPTANCE_NOT_CONFIRMED",
        {
          stkRequestSubmitted: true,
          providerResponseCode:
            data?.ResponseCode ?? null,
          checkoutRequestIdPresent:
            Boolean(data?.CheckoutRequestID),
          merchantRequestIdPresent:
            Boolean(data?.MerchantRequestID),
        }
      );

      throw new Error(
        "Daraja did not accept the STK Push request."
      );
    }

    logMpesaDiagnostic(
      "STK_PROVIDER_ACCEPTED",
      {
        stkRequestSubmitted: true,
        checkoutRequestIdPresent: true,
        merchantRequestIdPresent: true,
      }
    );

    return {
      accepted: true,

      checkoutRequestId:
        data.CheckoutRequestID,

      merchantRequestId:
        data.MerchantRequestID,

      responseCode:
        String(data.ResponseCode),
    };
  };

/**
 * ============================================================
 * QUERY STK PUSH STATUS
 * ============================================================
 *
 * This function makes a server-to-server
 * request to Safaricom.
 *
 * It does not mark the payment successful.
 */

export const queryMpesaStkStatus =
  async ({
    checkoutRequestId,
  }) => {
    if (
      typeof checkoutRequestId !== "string" ||
      !/^[A-Za-z0-9_-]{8,255}$/.test(
        checkoutRequestId
      )
    ) {
      throw new Error(
        "Invalid CheckoutRequestID."
      );
    }

    const config = getMpesaConfig();

    const timestamp =
      getMpesaTimestamp();

    const password =
      generateMpesaPassword(
        config.shortcode,
        config.passkey,
        timestamp
      );

    const accessToken =
      await getMpesaAccessToken();

    const data = await requestJson(
      `${config.baseUrl}/mpesa/stkpushquery/v1/query`,
      {
        method: "POST",

        headers: {
          Authorization:
            `Bearer ${accessToken}`,

          "Content-Type":
            "application/json",
        },

        body: JSON.stringify({
          BusinessShortCode:
            config.shortcode,

          Password:
            password,

          Timestamp:
            timestamp,

          CheckoutRequestID:
            checkoutRequestId,
        }),
      },
      {
        stage: "STK_QUERY",
        stkRequestSubmitted: false,
      }
    );

    const responseCode =
      String(data?.ResponseCode ?? "");

    const resultCode =
      data?.ResultCode == null
        ? null
        : String(data.ResultCode);

    return {
      checkoutRequestId,

      merchantRequestId:
        data?.MerchantRequestID || null,

      responseCode,

      resultCode,

      resultDescription:
        data?.ResultDesc || null,

      /**
       * ResultCode 0 indicates a successful
       * outcome reported by Daraja.
       *
       * The reconciliation service must
       * still match this result to the
       * original payment attempt.
       */

      providerReportsSuccess:
        responseCode === "0" &&
        resultCode === "0",

      rawResponse: data,
    };
  };

/**
 * ============================================================
 * PREMIUMCHAT — QUERY M-PESA TRANSACTION STATUS
 * ============================================================
 *
 * Initiates a Transaction Status enquiry.
 *
 * IMPORTANT:
 * - Requires an M-Pesa receipt number.
 * - Safaricom responds asynchronously.
 * - Request acceptance does not verify settlement.
 * - Does not update payment or subscription records.
 */

export const queryMpesaTransactionStatus =
  async ({
    receiptNumber,
    remarks = "PremiumChat payment verification",
  }) => {
    const config = getMpesaConfig();

    if (
      !config.transactionStatusEnabled ||
      !config.transactionStatus
    ) {
      throw new Error(
        "M-Pesa Transaction Status is not enabled."
      );
    }

    if (
      typeof receiptNumber !== "string" ||
      !/^[A-Za-z0-9]{8,30}$/.test(
        receiptNumber
      )
    ) {
      throw new Error(
        "Invalid M-Pesa receipt number."
      );
    }

    const accessToken =
      await getMpesaAccessToken();

    const {
      initiatorName,
      securityCredential,
      resultUrl,
      timeoutUrl,
    } = config.transactionStatus;

    const payload = {
      Initiator: initiatorName,

      SecurityCredential:
        securityCredential,

      CommandID:
        "TransactionStatusQuery",

      TransactionID:
        receiptNumber,

      PartyA:
        config.shortcode,

      IdentifierType:
        "4",

      ResultURL:
        resultUrl,

      QueueTimeOutURL:
        timeoutUrl,

      Remarks:
        remarks,

      Occasion:
        "PremiumChat",
    };

    const data = await requestJson(
      `${config.baseUrl}/mpesa/transactionstatus/v1/query`,
      {
        method: "POST",

        headers: {
          Authorization:
            `Bearer ${accessToken}`,

          "Content-Type":
            "application/json",
        },

        body:
          JSON.stringify(payload),
      },
      {
        stage: "TRANSACTION_STATUS",
        stkRequestSubmitted: false,
      }
    );

    const responseCode =
      String(data?.ResponseCode ?? "");

    if (
      responseCode !== "0" ||
      !data?.ConversationID ||
      !data?.OriginatorConversationID
    ) {
      logMpesaDiagnostic(
        "TRANSACTION_STATUS_NOT_ACCEPTED",
        {
          providerResponseCode:
            responseCode || null,
          conversationIdPresent:
            Boolean(data?.ConversationID),
          originatorConversationIdPresent:
            Boolean(
              data?.OriginatorConversationID
            ),
        }
      );

      throw new Error(
        "Safaricom did not accept the transaction status enquiry."
      );
    }

    logMpesaDiagnostic(
      "TRANSACTION_STATUS_ACCEPTED",
      {
        conversationIdPresent: true,
        originatorConversationIdPresent: true,
      }
    );

    return {
      accepted: true,

      receiptNumber,

      conversationId:
        data.ConversationID,

      originatorConversationId:
        data.OriginatorConversationID,

      responseCode,

      responseDescription:
        data.ResponseDescription || null,
    };
  };
