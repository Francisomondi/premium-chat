import { getPublicCreatorGallery } from "../services/creatorGallery.service.js";

export const getPublicCreatorGalleryController = async (req, res) => {
  try {
    const { creatorId } = req.params;

    const page = Number.parseInt(req.query.page, 10) || 1;
    const limit = Number.parseInt(req.query.limit, 10) || 12;

    const result = await getPublicCreatorGallery({
      creatorId,
      page,
      limit,
    });

    if (!result) {
      return res.status(404).json({
        success: false,
        message: "Creator not found.",
      });
    }

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    if (error.statusCode === 400) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    console.error("Get public creator gallery error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load creator gallery.",
    });
  }
};