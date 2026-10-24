import axios from "axios";

import { env } from "../config/env.js";

import { normalizeApiError } from "./apiError.js";

/**
 * ============================================================
 * PREMIUMCHAT AXIOS INSTANCE
 * ============================================================
 */

const axiosInstance = axios.create({
  baseURL: env.API_BASE_URL,

  timeout: env.API_TIMEOUT,

  withCredentials: true,

  headers: {
    Accept: "application/json",
  },
});

/*
 * ============================================================
 * REQUEST INTERCEPTOR
 * ============================================================
 */

axiosInstance.interceptors.request.use(
  (config) => {
    /*
     * HTTP-only authentication cookies will be sent
     * automatically when applicable.
     *
     * Do not read JWT tokens from localStorage here.
     */

    if (import.meta.env.DEV) {
      console.debug(
        `[API Request] ${config.method?.toUpperCase()} ${config.url}`
      );
    }

    return config;
  },

  (error) => {
    return Promise.reject(error);
  }
);

/*
 * ============================================================
 * RESPONSE INTERCEPTOR
 * ============================================================
 */

axiosInstance.interceptors.response.use(
  (response) => {
    return response;
  },

  (error) => {
    const normalized = normalizeApiError(error);

    /*
     * Preserve the original Axios error while attaching
     * normalized details for the service layer.
     */

    error.apiError = normalized;

    if (
      import.meta.env.DEV &&
      error.code !== "ERR_CANCELED"
    ) {
      console.warn("[API Error]", {
        status: normalized.status,
        code: normalized.code,
        message: normalized.message,
      });
    }

    /*
     * Authentication refresh and redirect logic will be
     * added in Module 2 after the auth API is implemented.
     *
     * We deliberately do not redirect every 401 here.
     */

    return Promise.reject(error);
  }
);

export default axiosInstance;