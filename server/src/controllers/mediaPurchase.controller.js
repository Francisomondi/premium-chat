
import AppError from "../utils/AppError.js";

import {
  reserveMediaPurchase,
} from "../services/mediaPurchase.service.js";

import {
  initiateMediaMpesaPayment,
} from "../services/mediaPaymentInitiation.service.js";

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
        "Authentication is required to purchase media.",
        401,
        "AUTHENTICATION_REQUIRED"
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
        "Media purchase could not be reserved.",
        500,
        "MEDIA_PURCHASE_RESERVATION_FAILED"
      );
    }

    /*
     * An ACTIVE purchase means settlement has already granted
     * access. Never initiate another payment for it.
     */
    if (purchase.status === "ACTIVE") {
      return res.status(200).json({
        success: true,
        message: "You already have access to this media.",
        data: {
          purchaseId: purchase._id,
          mediaId: purchase.mediaId,
          amountMinor: purchase.amountMinor,
          currency: purchase.currency,
          purchaseStatus: purchase.status,
          payment: null,
          paymentVerified: true,
          mediaAccessGranted: true,
        },
      });
    }

    /*
     * Use the purchase ID as the stable payment idempotency key.
     *
     * Browser retries may have different clientRequestIds, but
     * the same pending purchase must always resolve to the same
     * PaymentTransaction.
     */
    const paymentClientRequestId =
      `media_${purchase._id.toString()}`;

    const paymentResult = await initiateMediaMpesaPayment({
      buyerId: buyerId.toString(),
      purchaseId: purchase._id.toString(),
      phoneNumber,
      clientRequestId: paymentClientRequestId,
    });

    return res.status(
      reservation.created ? 201 : 200
    ).json({
      success: true,
      message:
        paymentResult?.message ||
        "Media purchase reserved. Check your phone for the M-Pesa prompt.",
      data: {
        purchaseId: purchase._id,
        mediaId: purchase.mediaId,
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
