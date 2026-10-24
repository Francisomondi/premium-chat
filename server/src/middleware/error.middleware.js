import { env } from "../config/env.js";

/**
 * ============================================================
 * CENTRALIZED API ERROR HANDLER
 * ============================================================
 */

export const errorHandler = (err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  let statusCode = err.statusCode ?? err.status ?? 500;
  let code =
    typeof err.code === "string"
      ? err.code
      : "INTERNAL_SERVER_ERROR";

  let message = err.message || "Something went wrong.";
  let errors;

  // Invalid JSON
  if (err.type === "entity.parse.failed") {
    statusCode = 400;
    code = "INVALID_JSON";
    message = "Invalid JSON request body.";
  }

  // Oversized request body
  if (err.type === "entity.too.large") {
    statusCode = 413;
    code = "PAYLOAD_TOO_LARGE";
    message = "Request body is too large.";
  }

  // MongoDB duplicate email
  if (
    err.code === 11000 &&
    (err.keyPattern?.email || err.keyValue?.email)
  ) {
    statusCode = 409;
    code = "EMAIL_ALREADY_EXISTS";
    message = "An account with this email already exists.";
  }

  // Mongoose validation
  if (err.name === "ValidationError") {
    statusCode = 400;
    code = "VALIDATION_ERROR";
    message = "Request validation failed.";

    errors = Object.values(err.errors || {}).map(
      (error) => ({
        field: error.path,
        message: error.message,
      })
    );
  }

  // Invalid MongoDB ObjectId
  if (err.name === "CastError") {
    statusCode = 400;
    code = "INVALID_IDENTIFIER";
    message = "Invalid resource identifier.";
  }

  if (
    !Number.isInteger(statusCode) ||
    statusCode < 400 ||
    statusCode > 599
  ) {
    statusCode = 500;
  }

  if (statusCode >= 500) {
    code = "INTERNAL_SERVER_ERROR";

    if (env.IS_PRODUCTION) {
      message = "Internal server error.";
      errors = undefined;
    }
  }

  // Do not log request bodies or credentials.
  console.error("API Error:", {
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    statusCode,
    code,
    ...(env.IS_PRODUCTION
      ? {}
      : { message: err.message, stack: err.stack }),
  });

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