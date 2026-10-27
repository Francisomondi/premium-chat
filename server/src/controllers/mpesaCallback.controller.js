import {
  ingestMpesaCallback,
} from "../services/mpesaCallback.service.js";

/**
 * ============================================================
 * PREMIUMCHAT — M-PESA CALLBACK CONTROLLER
 * ============================================================
 *
 * Public provider callback endpoint.
 *
 * IMPORTANT:
 *
 * - Does not require subscriber JWT.
 * - Does not trust callback payment status.
 * - Does not activate subscriptions.
 * - Does not expose internal payment details.
 */

export const receiveMpesaStkCallback =
  async (req, res, next) => {
    try {
      await ingestMpesaCallback(
        req.body
      );

      /**
       * Acknowledge callback receipt.
       *
       * This response does not confirm
       * successful payment.
       */

      return res.status(200).json({
        ResultCode: 0,

        ResultDesc:
          "Callback received.",
      });
    } catch (error) {
      return next(error);
    }
  };