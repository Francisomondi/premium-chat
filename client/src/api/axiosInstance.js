import axios from "axios";

import { env } from "../config/env.js";

import { normalizeApiError } from "./apiError.js";

/**
 * ============================================================
 * PREMIUMCHAT — AXIOS INSTANCE
 * ============================================================
 *
 * Features:
 *
 * - Centralized API configuration
 * - HTTP-only cookie authentication
 * - Request timeout
 * - Normalized API errors
 * - Development request logging
 * - Expected authentication error handling
 *
 * Security:
 *
 * Never store JWTs in localStorage,
 * sessionStorage, or Zustand.
 */

const axiosInstance = axios.create({
  baseURL: env.API_BASE_URL,

  timeout: env.API_TIMEOUT,

  withCredentials: true,

  headers: {
    Accept: "application/json",
  },
});

/**
 * ============================================================
 * REQUEST INTERCEPTOR
 * ============================================================
 */

axiosInstance.interceptors.request.use(
  (config) => {
    /**
     * HTTP-only cookies are automatically
     * attached by the browser when allowed.
     */

    if (import.meta.env.DEV) {
      console.debug(
        `[API Request] ${config.method?.toUpperCase()} ${config.url}`
      );
    }

    return config;
  },

  (error) => Promise.reject(error)
);

/**
 * ============================================================
 * RESPONSE INTERCEPTOR
 * ============================================================
 */

axiosInstance.interceptors.response.use(
  (response) => response,

  (error) => {
    /**
     * ========================================================
     * NORMALIZE ERROR
     * ========================================================
     */

    const normalized =
      normalizeApiError(error);

    /**
     * Preserve the original Axios error.
     */

    error.apiError = normalized;

    /**
     * ========================================================
     * EXPECTED UNAUTHENTICATED SESSION CHECK
     * ========================================================
     *
     * GET /auth/me may return 401 when the
     * visitor is not logged in.
     *
     * Do not warn for this specific case.
     *
     * The original rejection still reaches
     * the authentication store.
     */

    const requestUrl =
      error.config?.url ?? "";

    const requestMethod =
      error.config?.method?.toUpperCase();

    const isAuthMeRequest =
      requestMethod === "GET" &&
      /^\/auth\/me\/?(?:\?.*)?$/.test(requestUrl);

    const isExpectedAuthError =
      isAuthMeRequest &&
      error.response?.status === 401 &&
      error.response?.data?.code ===
        "AUTH_REQUIRED";

    /**
     * ========================================================
     * DEVELOPMENT LOGGING
     * ========================================================
     */

    if (
      import.meta.env.DEV &&
      error.code !== "ERR_CANCELED" &&
      !isExpectedAuthError
    ) {
      console.warn("[API Error]", {
        status: normalized.status,
        code: normalized.code,
        message: normalized.message,
      });
    }

    /**
     * ========================================================
     * RETURN ORIGINAL ERROR
     * ========================================================
     *
     * Do not redirect on every 401.
     *
     * The authentication store remains
     * responsible for authentication state.
     */

    return Promise.reject(error);
  }
);

export default axiosInstance;