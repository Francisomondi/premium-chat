import PaymentTransaction from "../models/PaymentTransaction.model.js";

import {
  PAYMENT_PROVIDERS,
  PAYMENT_PURPOSES,
} from "../constants/payment.constants.js";

/**
 * ============================================================
 * PREMIUMCHAT — M-PESA PAYMENT RECOVERY CONTROLLER
 * ============================================================
 *
 * GET /api/payments/mpesa/requests/:clientRequestId
 *
 * SECURITY:
 *
 * - Authentication required by router.
 * - Payment ownership enforced.
 * - Read-only database operation.
 * - No STK Push initiation.
 * - No payment verification or subscription activation.
 * - No payment phone numbers returned.
 */

const isValidRequestId = (value) =>
  typeof value === "string" &&
  value.length >= 8 &&
  value.length <= 100 &&
  /^[A-Za-z0-9_-]+$/.test(value);

export const recoverMyMpesaPayment = async (
  req,
  res,
  next
) => {
  try {
    const subscriberId = req.auth?.userId;

    const { clientRequestId } = req.params;

    if (!subscriberId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    if (!isValidRequestId(clientRequestId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment request identifier.",
      });
    }

    const payment = await PaymentTransaction.findOne({
      payerId: subscriberId,
      clientRequestId,
      provider: PAYMENT_PROVIDERS.MPESA,
      purpose: PAYMENT_PURPOSES.SUBSCRIPTION_INITIAL,
    })
      .select(
        "_id subscriptionId status initiationStatus amountMinor currency createdAt updatedAt"
      )
      .lean();

    if (!payment) {
      return res.status(404).json({
        success: false,
        message:
          "No payment was found for this request identifier.",
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        payment: {
          id: payment._id.toString(),

          subscriptionId:
            payment.subscriptionId?.toString() ??
            null,

          status: payment.status,

          initiationStatus:
            payment.initiationStatus,

          amountMinor:
            payment.amountMinor,

          currency:
            payment.currency,

          createdAt:
            payment.createdAt,

          updatedAt:
            payment.updatedAt,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};