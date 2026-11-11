import {
  getAdminMediaPreview,
} from "../services/adminMediaPreview.service.js";

export const getAdminMediaPreviewController = async (req, res, next) => {
  try {
    const result = await getAdminMediaPreview({
      mediaId: req.params.mediaId,
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return next(error);
  }
};