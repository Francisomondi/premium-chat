
import mongoose from "mongoose";

import User from "../models/User.model.js";

import Media, {
  MEDIA_STATUSES,
  MEDIA_MODERATION_STATUSES,
} from "../models/Media.model.js";

import MediaPurchase, {
  MEDIA_PURCHASE_STATUSES,
} from "../models/MediaPurchase.model.js";

import PaymentTransaction from "../models/PaymentTransaction.model.js";

import {
  PAYMENT_PURPOSES,
  PAYMENT_STATUSES,
  PAYMENT_PROVIDERS,
  PAYMENT_VERIFICATION_STATUSES,
  PAYMENT_INITIATION_STATUSES,
} from "../constants/payment.constants.js";

import {
  MEDIA_ACCESS_POLICIES,
} from "../constants/mediaAccess.constants.js";

import AppError from "../utils/AppError.js";

const isValidId = (value) =>
  mongoose.isObjectIdOrHexString(value);

const validateClientRequestId = (value) => {
  if (
    typeof value !== "string" ||
    value.length < 8 ||
    value.length > 128 ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  ) {
    throw new AppError(
      "Invalid purchase request identifier.",
      400,
      "INVALID_PURCHASE_REQUEST_ID"
    );
  }
};

const reserveMediaPurchase = async ({
  buyerId,
  mediaId,
  clientRequestId,
}) => {
  if (!isValidId(buyerId)) {
    throw new AppError(
      "Invalid buyer.",
      401,
      "INVALID_BUYER"
    );
  }

  if (!isValidId(mediaId)) {
    throw new AppError(
      "Invalid media identifier.",
      400,
      "INVALID_MEDIA_ID"
    );
  }

  validateClientRequestId(clientRequestId);

  const buyer = await User.findById(buyerId);

  if (
    !buyer ||
    typeof buyer.canAccessRestrictedContent !== "function" ||
    !buyer.canAccessRestrictedContent()
  ) {
    throw new AppError(
      "You are not eligible to purchase restricted media.",
      403,
      "BUYER_NOT_ELIGIBLE"
    );
  }

  const media = await Media.findOne({
    _id: mediaId,
    status: MEDIA_STATUSES.READY,
    moderationStatus: MEDIA_MODERATION_STATUSES.APPROVED,
    deletedAt: null,
  }).select(
    "creatorId accessPolicy priceMinor currency status moderationStatus deletedAt"
  );

  if (!media) {
    throw new AppError(
      "Media is unavailable.",
      404,
      "MEDIA_NOT_AVAILABLE"
    );
  }

  const creatorId = media.creatorId.toString();

  if (creatorId === buyerId.toString()) {
    throw new AppError(
      "You cannot purchase your own media.",
      403,
      "CANNOT_PURCHASE_OWN_MEDIA"
    );
  }

  if (
    ![
      MEDIA_ACCESS_POLICIES.PURCHASE_ONLY,
      MEDIA_ACCESS_POLICIES.SUBSCRIPTION_OR_PURCHASE,
    ].includes(media.accessPolicy)
  ) {
    throw new AppError(
      "This media is not available for individual purchase.",
      409,
      "MEDIA_NOT_PURCHASABLE"
    );
  }

  if (
    !Number.isSafeInteger(media.priceMinor) ||
    media.priceMinor < 1 ||
    !["KES", "USD"].includes(media.currency)
  ) {
    throw new AppError(
      "Media pricing is invalid.",
      409,
      "INVALID_MEDIA_PRICE"
    );
  }

  if (media.currency !== "KES") {
    throw new AppError(
      "M-Pesa currently supports KES media purchases only.",
      409,
      "UNSUPPORTED_PAYMENT_CURRENCY"
    );
  }

  const existingRequest = await MediaPurchase.findOne({
    buyerId,
    clientRequestId,
  });

  if (existingRequest) {
    const sameRequest =
      existingRequest.mediaId.toString() === mediaId.toString() &&
      existingRequest.creatorId.toString() === creatorId &&
      existingRequest.amountMinor === media.priceMinor &&
      existingRequest.currency === media.currency;

    if (!sameRequest) {
      throw new AppError(
        "Purchase request identifier is already in use.",
        409,
        "PURCHASE_REQUEST_CONFLICT"
      );
    }

    return {
      created: false,
      purchase: existingRequest,
    };
  }

  const existingPurchase = await MediaPurchase.findOne({
    buyerId,
    mediaId,
    status: {
      $in: [
        MEDIA_PURCHASE_STATUSES.PENDING,
        MEDIA_PURCHASE_STATUSES.ACTIVE,
      ],
    },
  });

  if (existingPurchase) {
    return {
      created: false,
      purchase: existingPurchase,
    };
  }

  try {
    const [purchase] = await MediaPurchase.create([
      {
        mediaId: media._id,
        buyerId: buyer._id,
        creatorId: media.creatorId,
        amountMinor: media.priceMinor,
        currency: media.currency,
        clientRequestId,
        status: MEDIA_PURCHASE_STATUSES.PENDING,
      },
    ]);

    return {
      created: true,
      purchase,
    };
  } catch (error) {
    if (error?.code === 11000) {
      const replay = await MediaPurchase.findOne({
        buyerId,
        clientRequestId,
      });

      if (replay) {
        const sameRequest =
          replay.mediaId.toString() === mediaId.toString() &&
          replay.creatorId.toString() === creatorId &&
          replay.amountMinor === media.priceMinor &&
          replay.currency === media.currency;

        if (sameRequest) {
          return {
            created: false,
            purchase: replay,
          };
        }
      }

      throw new AppError(
        "A purchase attempt already exists for this media.",
        409,
        "MEDIA_PURCHASE_CONFLICT"
      );
    }

    throw error;
  }
};

/**
 * Link one payment to a pending purchase.
 *
 * A purchase can only ever be linked to one payment.
 * Even a rejected or unresolved payment is not silently
 * replaced by a new payment attempt.
 *
 * This protects previously initiated payments from
 * accidental duplicate STK Push requests.
 */
const linkMediaPurchasePayment = async ({
  buyerId,
  purchaseId,
  paymentId,
}) => {
  if (
    !isValidId(buyerId) ||
    !isValidId(purchaseId) ||
    !isValidId(paymentId)
  ) {
    throw new AppError(
      "Invalid buyer, purchase, or payment identifier.",
      400,
      "INVALID_PAYMENT_LINK_IDENTIFIERS"
    );
  }

  const session = await mongoose.startSession();

  try {
    let result;

    await session.withTransaction(async () => {
      const purchase = await MediaPurchase.findOne({
        _id: purchaseId,
        buyerId,
      }).session(session);

      if (!purchase) {
        throw new AppError(
          "Media purchase was not found.",
          404,
          "MEDIA_PURCHASE_NOT_FOUND"
        );
      }

      if (
        purchase.status !== MEDIA_PURCHASE_STATUSES.PENDING
      ) {
        throw new AppError(
          "Only pending purchases can be linked to a payment.",
          409,
          "MEDIA_PURCHASE_NOT_PENDING"
        );
      }

      // Exact replay: the purchase is already linked to this payment.
      if (
        purchase.paymentId &&
        purchase.paymentId.toString() === paymentId.toString()
      ) {
        result = {
          linked: false,
          purchase,
        };

        return;
      }

      // Never replace an existing payment reference.
      if (purchase.paymentId) {
        throw new AppError(
          "This purchase already has a payment attempt. Its outcome must be resolved before another payment can be made.",
          409,
          "MEDIA_PURCHASE_PAYMENT_ALREADY_LINKED"
        );
      }

      const payment = await PaymentTransaction.findOne({
        _id: paymentId,
        payerId: buyerId,
        creatorId: purchase.creatorId,
        purpose: PAYMENT_PURPOSES.MEDIA_PURCHASE,
        subscriptionId: null,
        provider: PAYMENT_PROVIDERS.MPESA,
        amountMinor: purchase.amountMinor,
        currency: purchase.currency,
        status: PAYMENT_STATUSES.PENDING,
        verificationStatus:
          PAYMENT_VERIFICATION_STATUSES.UNVERIFIED,
        initiationStatus:
          PAYMENT_INITIATION_STATUSES.RESERVED,
      }).session(session);

      if (!payment) {
        throw new AppError(
          "Payment does not match this purchase or is not available for initiation.",
          409,
          "MEDIA_PAYMENT_NOT_LINKABLE"
        );
      }

      const updateResult = await MediaPurchase.updateOne(
        {
          _id: purchase._id,
          buyerId,
          status: MEDIA_PURCHASE_STATUSES.PENDING,
          paymentId: null,
        },
        {
          $set: {
            paymentId: payment._id,
          },
        },
        { session }
      );

      if (updateResult.modifiedCount !== 1) {
        throw new AppError(
          "The purchase was linked to another payment concurrently.",
          409,
          "MEDIA_PURCHASE_PAYMENT_CONFLICT"
        );
      }

      const linkedPurchase = await MediaPurchase.findById(
        purchase._id
      ).session(session);

      result = {
        linked: true,
        purchase: linkedPurchase,
      };
    });

    return result;
  } finally {
    await session.endSession();
  }
};

export {
  reserveMediaPurchase,
  linkMediaPurchasePayment,
};
