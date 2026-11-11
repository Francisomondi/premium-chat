
import { createHash } from "node:crypto";

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

    if (
      typeof clientRequestId !== "string" ||
      !/^[A-Za-z0-9_-]{8,128}$/.test(clientRequestId.trim())
    ) {
      throw new AppError(
        "A valid client request ID is required.",
        400,
        "INVALID_CLIENT_REQUEST_ID"
      );
    }

    const normalizedRequestId = clientRequestId.trim();

    const reservation = await reserveMediaPurchase({
      buyerId: buyerId.toString(),
      mediaId,
      clientRequestId: normalizedRequestId,
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
     * Payment idempotency:
     *
     * - The same clientRequestId always produces the same key.
     * - A new clientRequestId produces a new key.
     * - The initiation service decides whether a new attempt
     *   is permitted based on the previous dispatch outcome.
     *
     * In particular, UNKNOWN attempts must remain blocked.
     */
    const requestFingerprint = createHash("sha256")
      .update(normalizedRequestId)
      .digest("hex")
      .slice(0, 16);

    const paymentClientRequestId =
      `media_${purchase._id.toString()}_${requestFingerprint}`;

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
