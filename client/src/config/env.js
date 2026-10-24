/**
 * ============================================================
 * FRONTEND ENVIRONMENT CONFIGURATION
 * ============================================================
 */

const rawApiUrl =
  import.meta.env.VITE_API_BASE_URL ||
  "http://localhost:5000/api";

const rawTimeout =
  import.meta.env.VITE_API_TIMEOUT || "30000";

const timeout = Number(rawTimeout);

if (
  !Number.isSafeInteger(timeout) ||
  timeout <= 0
) {
  throw new Error(
    "VITE_API_TIMEOUT must be a positive integer."
  );
}

let apiUrl;

try {
  apiUrl = new URL(rawApiUrl);
} catch {
  throw new Error(
    "VITE_API_BASE_URL must be a valid URL."
  );
}

if (!["http:", "https:"].includes(apiUrl.protocol)) {
  throw new Error(
    "API URL must use HTTP or HTTPS."
  );
}

if (
  import.meta.env.PROD &&
  apiUrl.protocol !== "https:"
) {
  throw new Error(
    "Production API URL must use HTTPS."
  );
}

const normalizedApiUrl =
  apiUrl.toString().replace(/\/+$/, "");

export const env = Object.freeze({
  API_BASE_URL: normalizedApiUrl,

  API_TIMEOUT: timeout,

  IS_PRODUCTION: import.meta.env.PROD,

  IS_DEVELOPMENT: import.meta.env.DEV,
});