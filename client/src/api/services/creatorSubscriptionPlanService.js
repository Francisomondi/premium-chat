import api from "../axiosInstance.js";

/**
 * ============================================================
 * PREMIUMCHAT — PUBLIC CREATOR SUBSCRIPTION PLANS API
 * ============================================================
 *
 * STEP 19.8.20
 *
 * Responsibilities:
 *
 * - Retrieve public subscription plans.
 * - Support request cancellation.
 *
 * SECURITY:
 *
 * - Does not create subscriptions.
 * - Does not initiate payments.
 * - Does not modify subscription pricing.
 * - Does not grant premium access.
 *
 * Pricing and plan availability are controlled
 * exclusively by the backend.
 */

/**
 * ============================================================
 * GET PUBLIC CREATOR SUBSCRIPTION PLANS
 * ============================================================
 *
 * GET /api/creators/:creatorId/subscription-plans
 */

export const getPublicCreatorSubscriptionPlans =
  async (creatorId, options = {}) => {
    if (
      typeof creatorId !== "string" ||
      !creatorId.trim()
    ) {
      throw new Error(
        "A valid creator ID is required."
      );
    }

    const response = await api.get(
      `/creators/${encodeURIComponent(
        creatorId.trim()
      )}/subscription-plans`,
      {
        signal: options.signal,
      }
    );

    if (
      response.data?.success !== true ||
      !Array.isArray(response.data?.data?.plans)
    ) {
      throw new Error(
        "Invalid creator subscription plans response."
      );
    }

    return response.data;
  };

export default {
  getPublicCreatorSubscriptionPlans,
};