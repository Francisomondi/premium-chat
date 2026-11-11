
import AppError from "../utils/AppError.js";

import {
  createMediaPreviewUrl,
} from "../services/mediaPreview.service.js";



/**
 * ============================================================
 * CREATE LOCKED CHAT IMAGE PREVIEW URL
 * ============================================================
 *
 * Authenticated conversation participants only.
 * Returns the blurred preview, never the original image.
 */

export const createMediaPreviewController = async (
  req,
  res,
  next
) => {
  try {
    const { mediaId } = req.params;

    const viewerId =
      req.user?.id ?? req.user?._id;

    if (!viewerId) {
      throw new AppError(
        "Authentication is required.",
        401,
        "UNAUTHENTICATED"
      );
    }

    const result = await createMediaPreviewUrl({
      mediaId,
      viewerId,
    });

    return res.status(200).json({
      success: true,
      message: "Blurred media preview authorized.",
      data: result,
    });
  } catch (error) {
    return next(error);
  }
};

export default {
  createMediaPreviewController,
};
