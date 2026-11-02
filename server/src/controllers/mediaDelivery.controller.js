
import AppError from "../utils/AppError.js";

import {
  createMediaDeliveryUrl,
} from "../services/mediaDelivery.service.js";

/**
 * ============================================================
 * CREATE MEDIA DELIVERY URL
 * ============================================================
 *
 * Authenticated viewers only.
 * Authorization and conversation membership
 * are enforced by the delivery service.
 */

export const createMediaDeliveryController = async (
  req,
  res,
  next
) => {
  try {
    const { mediaId } = req.params;
    const viewerId = req.user?.id ?? req.user?._id;

    if (!viewerId) {
      throw new AppError(
        "Authentication is required.",
        401,
        "UNAUTHENTICATED"
      );
    }

    const result = await createMediaDeliveryUrl({
      mediaId,
      viewerId,
    });

    return res.status(200).json({
      success: true,
      message: "Media access authorized.",
      data: result,
    });
  } catch (error) {
    return next(error);
  }
};

export default {
  createMediaDeliveryController,
};
