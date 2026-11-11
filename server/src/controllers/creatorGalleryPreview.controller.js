
import {
  getPublicCreatorGalleryPreview,
} from "../services/creatorGalleryPreview.service.js";

/**
 * ============================================================
 * PREMIUMCHAT — PUBLIC GALLERY PREVIEW CONTROLLER
 * ============================================================
 */

export const getPublicCreatorGalleryPreviewController =
  async (req, res, next) => {
    try {
      const { creatorId, mediaId } = req.params;

      const result =
        await getPublicCreatorGalleryPreview({
          creatorId,
          mediaId,
        });

      if (!result) {
        return res.status(404).json({
          success: false,
          message:
            "Creator or approved gallery media was not found.",
          code: "GALLERY_PREVIEW_NOT_FOUND",
        });
      }

      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };
