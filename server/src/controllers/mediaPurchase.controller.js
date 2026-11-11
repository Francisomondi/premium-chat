import AppError from "../utils/AppError.js";

import {
  reserveMediaPurchase,
} from "../services/mediaPurchase.service.js";

import {
  initiateMediaMpesaPayment,
} from "../services/mediaPaymentInitiation.service.js";

/**
 * ============================================================
 * CREATE MEDIA PURCHASE AND INITIATE M-PESA
 * ============================================================
 *
 * - Buyer identity comes from authentication.
 * - Media price and creator are resolved by the service.
 * - Purchase reservation is idempotent.
 * - Payment initiation is idempotent.
 * - STK acceptance never grants media access.
 * - Settlement remains controlled by backend reconciliation.
 */

export const createMediaPurchaseController = async (
  req,
  res,
  next
) => {
  try {
    const { mediaId } = req.params;

    const buyerId = req.user?.id ?? req.user?._id;

    const {
      phoneNumber,
      clientRequestId,
    } = req.body;

    if (!buyerId) {
      throw new AppError(
        "Authentication is required.",
        401,
        "UNAUTHENTICATED"
      );
    }

    const reservation = await reserveMediaPurchase({
      buyerId: buyerId.toString(),
      mediaId,
      clientRequestId,
    });

    const purchase = reservation?.purchase;

    if (!purchase?._id) {
      throw new AppError(
        "The media purchase could not be reserved.",
        500,
        "MEDIA_PURCHASE_RESERVATION_FAILED"
      );
    }

    /*
     * A deterministic, separate identifier is used
     * for payment initiation retries.
     */
    const paymentClientRequestId =
      `media_${clientRequestId}`;

    const paymentResult =
      await initiateMediaMpesaPayment({
        buyerId: buyerId.toString(),
        purchaseId: purchase._id.toString(),
        phoneNumber,
        clientRequestId: paymentClientRequestId,
      });

    return res.status(reservation.created ? 201 : 200).json({
      success: true,
      message: paymentResult?.message ||
        "Media purchase reserved. Check your phone for the M-Pesa prompt.",
      data: {
        purchaseId: purchase._id.toString(),
        mediaId: purchase.mediaId.toString(),
        amountMinor: purchase.amountMinor,
        currency: purchase.currency,
        purchaseStatus: purchase.status,
        payment: paymentResult,
        paymentVerified: false,
        mediaAccessGranted: false,
      },
    });
  } catch (error) {
    return next(error);
  }
};

export default {
  createMediaPurchaseController,
};