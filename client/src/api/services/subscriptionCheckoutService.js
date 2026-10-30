import api from "../axiosInstance.js";

/**
 * ============================================================
 * PREMIUMCHAT — SUBSCRIPTION CHECKOUT API
 * ============================================================
 */

/**
 * CREATE PENDING SUBSCRIPTION
 *
 * POST /api/subscriptions
 */

export const createPendingSubscription = async ({
  planId,
  clientRequestId,
}) => {
  if (!planId || !clientRequestId) {
    throw new Error(
      "Plan ID and request ID are required."
    );
  }

  const response = await api.post(
    "/subscriptions",
    {
      planId,
      clientRequestId,
    }
  );

  return response.data;
};

/**
 * INITIATE M-PESA PAYMENT
 *
 * POST /api/payments/mpesa/stk-push
 */

export const initiateMpesaSubscriptionPayment =
  async ({
    subscriptionId,
    phoneNumber,
    clientRequestId,
  }) => {
    if (
      !subscriptionId ||
      !phoneNumber ||
      !clientRequestId
    ) {
      throw new Error(
        "Incomplete M-Pesa payment request."
      );
    }

    const response = await api.post(
      "/payments/mpesa/stk-push",
      {
        subscriptionId,
        phoneNumber,
        clientRequestId,
      }
    );

    return response.data;
  };

/**
 * RECOVER EXISTING PAYMENT
 *
 * GET /api/payments/mpesa/requests/:clientRequestId
 */

export const recoverMpesaPayment = async (
  clientRequestId,
  options = {}
) => {
  if (!clientRequestId) {
    throw new Error(
      "Payment request ID is required."
    );
  }

  const response = await api.get(
    `/payments/mpesa/requests/${encodeURIComponent(
      clientRequestId
    )}`,
    {
      signal: options.signal,
    }
  );

  return response.data;
};