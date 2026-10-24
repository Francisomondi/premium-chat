
import axios from "axios";

/**
 * ============================================================
 * NORMALIZE API ERRORS
 * ============================================================
 *
 * Converts Axios and JavaScript errors into a consistent
 * format for frontend components and Zustand stores.
 *
 * Backend validation errors are prioritized over generic
 * messages such as "Request validation failed."
 */

export const normalizeApiError = (error) => {
  if (!axios.isAxiosError(error)) {
    return {
      message:
        error instanceof Error
          ? error.message
          : "An unexpected error occurred.",

      status: null,
      code: "UNKNOWN_ERROR",
      errors: null,
      isNetworkError: false,
    };
  }

  const status = error.response?.status ?? null;
  const responseData = error.response?.data;

  const validationErrors = Array.isArray(responseData?.errors)
    ? responseData.errors
    : [];

  let message = "Something went wrong.";

  /**
   * ==========================================================
   * CONNECTION AND REQUEST ERRORS
   * ==========================================================
   */

  if (error.code === "ECONNABORTED") {
    message = "The request timed out. Please try again.";
  } else if (error.code === "ERR_CANCELED") {
    message = "The request was cancelled.";
  } else if (!error.response) {
    message =
      "Unable to connect to the server. Check your connection.";
  }

  /**
   * ==========================================================
   * BACKEND VALIDATION ERRORS
   * ==========================================================
   *
   * Example:
   *
   * errors: [
   *   {
   *     field: "password",
   *     message: "Password must contain at least 12 characters."
   *   }
   * ]
   *
   * Extract the individual messages so the user knows
   * exactly what needs correcting.
   */

  else if (validationErrors.length > 0) {
    const detailedMessages = validationErrors
      .map((item) => {
        if (typeof item === "string") {
          return item.trim();
        }

        if (
          item &&
          typeof item.message === "string"
        ) {
          return item.message.trim();
        }

        return null;
      })
      .filter(Boolean);

    message =
      [...new Set(detailedMessages)].join("\n") ||
      responseData?.message ||
      "Please correct the highlighted fields.";
  }

  /**
   * ==========================================================
   * STANDARD BACKEND ERRORS
   * ==========================================================
   */

  else if (typeof responseData?.message === "string") {
    message = responseData.message;
  } else if (status === 401) {
    message = "Authentication is required.";
  } else if (status === 403) {
    message = "You do not have permission.";
  } else if (status === 404) {
    message = "The requested resource was not found.";
  } else if (status === 429) {
    message = "Too many requests. Please try again later.";
  } else if (status >= 500) {
    message = "A server error occurred. Please try again.";
  }

  return {
    message,

    status,

    /**
     * Prefer the backend's application error code,
     * such as VALIDATION_ERROR or INVALID_CREDENTIALS.
     */
    code: responseData?.code || error.code || "API_ERROR",

    errors: validationErrors.length > 0
      ? validationErrors
      : null,

    isNetworkError: !error.response,
  };
};
