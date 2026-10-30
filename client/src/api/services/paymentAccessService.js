import api from "../axiosInstance.js";

/**
 * ============================================================
 * PREMIUMCHAT — PAYMENT ACCESS API
 * ============================================================
 *
 * STEP 19.8.19
 *
 * Responsibilities:
 *
 * - Retrieve authenticated M-Pesa payment status.
 * - Retrieve creator subscription entitlement.
 * - Support request cancellation.
 *
 * SECURITY:
 *
 * - Does not initiate payment.
 * - Does not verify financial settlement.
 * - Does not activate subscriptions.
 * - Does not grant premium access.
 *
 * Subscription authorization remains
 * exclusively controlled by the backend.
 */

/**
 * ============================================================
 * GET M-PESA PAYMENT STATUS
 * ============================================================
 *
 * GET /api/payments/mpesa/:paymentId/status
 */

export const getPaymentAccessStatus = async (
  paymentId,
  options = {}
) => {
  if (
    typeof paymentId !== "string" ||
    !paymentId.trim()
  ) {
    throw new Error(
      "A valid payment ID is required."
    );
  }

  const response = await api.get(
    `/payments/mpesa/${encodeURIComponent(
      paymentId.trim()
    )}/status`,
    {
      signal: options.signal,
    }
  );

  return response.data;
};

/**
 * ============================================================
 * GET CREATOR SUBSCRIPTION ACCESS
 * ============================================================
 *
 * GET /api/subscriptions/access/:creatorId
 */

export const getCreatorSubscriptionAccess = async (
  creatorId,
  options = {}
) => {
  if (
    typeof creatorId !== "string" ||
    !creatorId.trim()
  ) {
    throw new Error(
      "A valid creator ID is required."
    );
  }

  const response = await api.get(
    `/subscriptions/access/${encodeURIComponent(
      creatorId.trim()
    )}`,
    {
      signal: options.signal,
    }
  );

  return response.data;
};

export default {
  getPaymentAccessStatus,
  getCreatorSubscriptionAccess,
};