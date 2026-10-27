import {
  initiateSubscriptionMpesaPayment,
} from "../services/mpesaPaymentInitiation.service.js";

/**
 * ============================================================
 * PREMIUMCHAT — M-PESA PAYMENT CONTROLLER
 * ============================================================
 *
 * Authentication is enforced by the router.
 *
 * Subscriber identity comes from req.auth.userId.
 *
 * No amount, currency, creatorId, or payment
 * status is accepted from the request body.
 */

export const initiateMySubscriptionMpesaPayment =
  async (req, res, next) => {
    try {
      const subscriberId =
        req.auth.userId;

      const {
        subscriptionId,
        phoneNumber,
        clientRequestId,
      } = req.body || {};

      const result =
        await initiateSubscriptionMpesaPayment({
          subscriberId,

          subscriptionId,

          phoneNumber,

          clientRequestId,
        });

      return res.status(
        result.created ? 202 : 200
      ).json({
        success: true,

        message:
          "Payment request recorded. Awaiting payment confirmation.",

        data: result,
      });
    } catch (error) {
      return next(error);
    }
  };