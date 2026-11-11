
import {
  getPendingMediaForModeration,
  approveGalleryMedia,
  rejectGalleryMedia,
} from "../services/adminMediaModeration.service.js";

/**
 * GET /api/admin/media
 * List READY gallery media awaiting moderation.
 */
export const getPendingMediaForModerationController = async (
  req,
  res,
  next
) => {
  try {
    const result = await getPendingMediaForModeration({
      page: req.query.page,
      limit: req.query.limit,
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * PATCH /api/admin/media/:mediaId/approve
 * Approve processed gallery media.
 */
export const approveGalleryMediaController = async (
  req,
  res,
  next
) => {
  try {
    const result = await approveGalleryMedia({
      mediaId: req.params.mediaId,
      adminId: req.user.id,
    });

    return res.status(200).json({
      success: true,
      message: "Media approved successfully.",
      data: {
        media: result,
      },
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * PATCH /api/admin/media/:mediaId/reject
 * Reject processed gallery media.
 */
export const rejectGalleryMediaController = async (
  req,
  res,
  next
) => {
  try {
    const result = await rejectGalleryMedia({
      mediaId: req.params.mediaId,
      adminId: req.user.id,
    });

    return res.status(200).json({
      success: true,
      message: "Media rejected successfully.",
      data: {
        media: result,
      },
    });
  } catch (error) {
    return next(error);
  }
};
