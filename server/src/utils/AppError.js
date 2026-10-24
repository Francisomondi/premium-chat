export default class AppError extends Error {
  constructor(
    message,
    statusCode = 500,
    code = "APPLICATION_ERROR"
  ) {
    super(message);

    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;

    Error.captureStackTrace?.(this, this.constructor);
  }
}