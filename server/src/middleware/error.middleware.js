import { env } from "../config/env.js";

/**
 * ============================================================
 * PREMIUMCHAT — CENTRALIZED API ERROR HANDLER
 * ============================================================
 *
 * Improvements:
 *
 * 1. Preserve existing API error responses.
 * 2. Preserve request IDs.
 * 3. Preserve validation error handling.
 * 4. Avoid unnecessary stack traces for expected
 *    unauthenticated session checks.
 * 5. Continue logging unexpected errors.
 * 6. Never expose sensitive production stack traces.
 */

/**
 * ============================================================
 * EXPECTED AUTHENTICATION ERRORS
 * ============================================================
 */

const isExpectedAuthCheck = (
  req,
  statusCode,
  code
) => {
  const isAuthMeRequest =
    req.method === "GET" &&
    req.originalUrl.split("?")[0] === "/api/auth/me";

  const isMissingSession =
    statusCode === 401 &&
    code === "AUTH_REQUIRED";

  return isAuthMeRequest && isMissingSession;
};

/**
 * ============================================================
 * CENTRALIZED ERROR HANDLER
 * ============================================================
 */

export const errorHandler = (
  err,
  req,
  res,
  next
) => {
  if (res.headersSent) {
    return next(err);
  }

  let statusCode =
    err.statusCode ?? err.status ?? 500;

  let code =
    typeof err.code === "string"
      ? err.code
      : "INTERNAL_SERVER_ERROR";

  let message =
    err.message || "Something went wrong.";

  let errors;

  /**
   * ==========================================================
   * INVALID JSON
   * ==========================================================
   */

  if (err.type === "entity.parse.failed") {
    statusCode = 400;
    code = "INVALID_JSON";
    message = "Invalid JSON request body.";
  }

  /**
   * ==========================================================
   * OVERSIZED REQUEST BODY
   * ==========================================================
   */

  if (err.type === "entity.too.large") {
    statusCode = 413;
    code = "PAYLOAD_TOO_LARGE";
    message = "Request body is too large.";
  }

  /**
   * ==========================================================
   * DUPLICATE EMAIL
   * ==========================================================
   */

  if (
    err.code === 11000 &&
    (err.keyPattern?.email || err.keyValue?.email)
  ) {
    statusCode = 409;
    code = "EMAIL_ALREADY_EXISTS";

    message =
      "An account with this email already exists.";
  }

  /**
   * ==========================================================
   * MONGOOSE VALIDATION
   * ==========================================================
   */

  if (err.name === "ValidationError") {
    statusCode = 400;
    code = "VALIDATION_ERROR";

    message = "Request validation failed.";

    errors = Object.values(
      err.errors || {}
    ).map((error) => ({
      field: error.path,
      message: error.message,
    }));
  }

  /**
   * ==========================================================
   * INVALID MONGODB OBJECTID
   * ==========================================================
   */

  if (err.name === "CastError") {
    statusCode = 400;
    code = "INVALID_IDENTIFIER";

    message = "Invalid resource identifier.";
  }

  /**
   * ==========================================================
   * VALIDATE HTTP STATUS
   * ==========================================================
   */

  if (
    !Number.isInteger(statusCode) ||
    statusCode < 400 ||
    statusCode > 599
  ) {
    statusCode = 500;
  }

  /**
   * ==========================================================
   * SERVER ERRORS
   * ==========================================================
   */

  if (statusCode >= 500) {
    code = "INTERNAL_SERVER_ERROR";

    if (env.IS_PRODUCTION) {
      message = "Internal server error.";
      errors = undefined;
    }
  }

  /**
   * ==========================================================
   * LOGGING
   * ==========================================================
   *
   * Missing authentication on GET /api/auth/me
   * is expected when a visitor is logged out.
   *
   * Do not log that particular case as an error.
   *
   * All other errors retain existing logging.
   */

  const expectedAuthCheck =
    isExpectedAuthCheck(
      req,
      statusCode,
      code
    );

  if (!expectedAuthCheck) {
    console.error("API Error:", {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode,
      code,

      ...(env.IS_PRODUCTION
        ? {}
        : {
            message: err.message,
            stack: err.stack,
          }),
    });
  }

  /**
   * ==========================================================
   * API RESPONSE
   * ==========================================================
   *
   * Always return the correct HTTP status.
   *
   * Suppressing an expected log does not
   * bypass authentication.
   */

  return res.status(statusCode).json({
    success: false,

    message,

    code,

    requestId: req.requestId,

    ...(errors ? { errors } : {}),

    ...(!env.IS_PRODUCTION && statusCode >= 500
      ? { stack: err.stack }
      : {}),
  });
};