import { create } from "zustand";

import { healthService } from "../api/services/healthService.js";

import { normalizeApiError } from "../api/apiError.js";

/**
 * ============================================================
 * API STATUS STORE
 * ============================================================
 */

export const useApiStatusStore = create((set) => ({
  serverStatus: "idle",

  databaseStatus: "idle",

  loading: false,

  error: null,

  lastChecked: null,

  checkConnectivity: async () => {
    set({
      loading: true,
      error: null,
      serverStatus: "checking",
      databaseStatus: "checking",
    });

    /*
     * Test the API process and database separately.
     *
     * Promise.allSettled ensures a database failure
     * does not hide the result of the server check.
     */

    const [serverResult, databaseResult] =
      await Promise.allSettled([
        healthService.checkServer(),
        healthService.checkDatabase(),
      ]);

    const serverHealthy =
      serverResult.status === "fulfilled" &&
      serverResult.value?.success === true;

    const databaseHealthy =
      databaseResult.status === "fulfilled" &&
      databaseResult.value?.success === true &&
      databaseResult.value?.data?.database ===
        "connected";

    let errorMessage = null;

    if (!serverHealthy) {
      errorMessage =
        serverResult.status === "rejected"
          ? normalizeApiError(
              serverResult.reason
            ).message
          : "The API health check failed.";
    } else if (!databaseHealthy) {
      errorMessage =
        databaseResult.status === "rejected"
          ? normalizeApiError(
              databaseResult.reason
            ).message
          : "The database health check failed.";
    }

    set({
      serverStatus: serverHealthy
        ? "online"
        : "offline",

      databaseStatus: databaseHealthy
        ? "connected"
        : "disconnected",

      loading: false,

      error: errorMessage,

      lastChecked: new Date().toISOString(),
    });

    return {
      serverHealthy,
      databaseHealthy,
    };
  },

  resetStatus: () => {
    set({
      serverStatus: "idle",
      databaseStatus: "idle",
      loading: false,
      error: null,
      lastChecked: null,
    });
  },
}));