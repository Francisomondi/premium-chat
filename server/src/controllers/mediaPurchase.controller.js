
import { createHash } from "node:crypto";

import AppError from "../utils/AppError.js";

import {
  reserveMediaPurchase,
} from "../services/mediaPurchase.service.js";

import {
  initiateMediaMpesaPayment,
} from "../services/mediaPaymentInitiation.service.js";

import MediaPurchase from "../models/MediaPurchase.model.js";
import MpesaCallbackEvent from "../models/MpesaCallbackEvent.model.js";

import {
  recordMediaPurchaseSettlement,
} from "../services/mediaPurchaseSettlement.service.js";

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


/**
 * GET /api/media/purchases/:purchaseId/status
 *
 * Refreshes the status of an authenticated buyer's
 * paid-media purchase.
 *
 * Financial verification:
 * 1. The purchase must belong to the authenticated buyer.
 * 2. A linked M-Pesa payment must exist.
 * 3. A callback must be correlated to that exact checkout.
 * 4. Daraja STK Query must independently confirm success.
 *
 * STK Push is NEVER initiated from this endpoint.
 */
export const getMediaPurchaseStatusController = async (
  req,
  res,
  next
) => {
  try {
    const buyerId = req.user?.id ?? req.user?._id;
    const { purchaseId } = req.params;

    if (!buyerId) {
      throw new AppError(
        "Authentication is required.",
        401,
        "UNAUTHENTICATED"
      );
    }

    const loadPurchase = () =>
      MediaPurchase.findOne({
        _id: purchaseId,
        buyerId,
      })
        .populate({
          path: "paymentId",
          select: [
            "purpose",
            "provider",
            "status",
            "verificationStatus",
            "providerTransactionId",
            "merchantRequestId",
            "initiationStatus",
          ].join(" "),
        })
        .lean();

    let purchase = await loadPurchase();

    if (!purchase) {
      throw new AppError(
        "Media purchase was not found.",
        404,
        "MEDIA_PURCHASE_NOT_FOUND"
      );
    }

    let payment = purchase.paymentId;

    const buildResponse = () => {
      const paymentVerified =
        payment?.status === "SUCCEEDED" &&
        payment?.verificationStatus === "VERIFIED";

      const mediaAccessGranted =
        purchase.status === "ACTIVE" &&
        paymentVerified;

      return {
        success: true,
        data: {
          purchaseId: purchase._id.toString(),
          mediaId: purchase.mediaId.toString(),

          purchaseStatus: purchase.status,

          paymentStatus: payment?.status ?? "PENDING",

          verificationStatus:
            payment?.verificationStatus ?? "UNVERIFIED",

          initiationStatus:
            payment?.initiationStatus ?? null,

          paymentVerified,
          mediaAccessGranted,
        },
      };
    };

    /*
     * No linked payment means there is nothing to query.
     */
    if (!payment) {
      return res.status(200).json(buildResponse());
    }

    /*
     * Reject unrelated or incorrectly linked payments.
     */
    if (
      payment.purpose !== "MEDIA_PURCHASE" ||
      payment.provider !== "MPESA"
    ) {
      throw new AppError(
        "The linked payment is not a valid M-Pesa media purchase.",
        409,
        "INVALID_MEDIA_PURCHASE_PAYMENT"
      );
    }

    /*
     * Already active and verified: return without
     * making another Daraja request.
     */
    if (
      purchase.status === "ACTIVE" &&
      payment.status === "SUCCEEDED" &&
      payment.verificationStatus === "VERIFIED"
    ) {
      return res.status(200).json(buildResponse());
    }

    /*
     * An unknown initiation without a CheckoutRequestID
     * cannot be queried or safely retried.
     */
    if (
      typeof payment.providerTransactionId !== "string" ||
      !payment.providerTransactionId.trim()
    ) {
      return res.status(200).json(buildResponse());
    }

    /*
     * The callback worker must first correlate the callback
     * with this exact payment and CheckoutRequestID.
     *
     * No callback means no STK Query and no activation.
     */
    const matchingCallback =
      await MpesaCallbackEvent.findOne({
        paymentId: purchase.paymentId._id,
        checkoutRequestId: payment.providerTransactionId,
        hasConflict: false,
      }).lean();

    if (!matchingCallback) {
      return res.status(200).json(buildResponse());
    }

    /*
     * This performs the authenticated Daraja STK Query
     * and activates the purchase only after confirmed
     * financial success.
     */
    try {
      await recordMediaPurchaseSettlement({
        paymentId: purchase.paymentId._id.toString(),
      });
    } catch (error) {
      /*
       * A non-successful or not-yet-confirmed STK Query
       * is a pending payment, not a successful purchase.
       */
      if (
        error.code ===
        "MPESA_STK_QUERY_HAS_NOT_CONFIRMED_SUCCESS"
      ) {
        return res.status(200).json(buildResponse());
      }

      throw error;
    }

    /*
     * Reload after settlement so the response reflects
     * the committed payment and purchase states.
     */
    purchase = await loadPurchase();

    if (!purchase) {
      throw new AppError(
        "Media purchase was not found.",
        404,
        "MEDIA_PURCHASE_NOT_FOUND"
      );
    }

    payment = purchase.paymentId;

    return res.status(200).json(buildResponse());
  } catch (error) {
    return next(error);
  }
};