import {
  processMpesaTransactionStatusResult,
  processMpesaTransactionStatusTimeout,
} from "../services/mpesaTransactionStatusResult.service.js";

/**
 * ============================================================
 * PREMIUMCHAT — M-PESA TRANSACTION STATUS CONTROLLER
 * ============================================================
 *
 * Public provider-facing endpoints.
 *
 * No payment verification or subscription
 * activation is permitted here.
 */

const handleNotification = (processor) =>
  async (req, res) => {
    try {
      const result = await processor(req.body);

      if (!result.processed) {
        /*
         * Acknowledge structurally valid but
         * unmatched/conflicting notifications
         * without disclosing payment details.
         *
         * Operational monitoring must capture
         * these outcomes separately.
         */

        return res.status(200).json({
          ResultCode: 0,
          ResultDesc: "Notification received.",
        });
      }

      return res.status(200).json({
        ResultCode: 0,
        ResultDesc: "Notification received.",
      });
    } catch (error) {
      /*
       * A database failure is not a successful
       * notification-processing operation.
       *
       * Return a temporary error so the
       * delivery system may retry if supported.
       */

      console.error(
        "M-Pesa Transaction Status notification error:",
        error?.message || "Unknown error"
      );

      return res.status(503).json({
        ResultCode: 1,
        ResultDesc: "Temporarily unavailable.",
      });
    }
  };

export const mpesaTransactionStatusResultController =
  handleNotification(
    processMpesaTransactionStatusResult
  );

export const mpesaTransactionStatusTimeoutController =
  handleNotification(
    processMpesaTransactionStatusTimeout
  );