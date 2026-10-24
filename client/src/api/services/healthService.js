import axiosInstance from "../axiosInstance.js";

/**
 * ============================================================
 * HEALTH API SERVICE
 * ============================================================
 */

export const healthService = {
  /**
   * GET /api
   */
  async getApiInfo(signal) {
    const response = await axiosInstance.get("/", {
      signal,
    });

    return response.data;
  },

  /**
   * GET /api/health
   */
  async checkServer(signal) {
    const response = await axiosInstance.get("/health", {
      signal,
    });

    return response.data;
  },

  /**
   * GET /api/health/db
   */
  async checkDatabase(signal) {
    const response = await axiosInstance.get("/health/db", {
      signal,
    });

    return response.data;
  },
};