import {
  getCreatorManagedMedia,
} from "../services/creatorMediaManagement.service.js";

/**
 * ============================================================
 * PREMIUMCHAT — CREATOR MEDIA MANAGEMENT
 * ============================================================
 *
 * Returns media belonging to the authenticated creator.
 */

export const getMyCreatorMediaController = async (
  req,
  res
) => {
  try {
    const creatorId = req.auth?.userId;

    if (!creatorId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    const page = Number.parseInt(
      req.query.page,
      10
    ) || 1;

    const limit = Number.parseInt(
      req.query.limit,
      10
    ) || 12;

    const result = await getCreatorManagedMedia({
      creatorId,
      page,
      limit,
    });

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

    if (error.statusCode === 503) {
      return res.status(503).json({
        success: false,
        message: error.message,
        code: error.code,
      });
    }

    console.error(
      "Get creator-managed media error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Unable to load your media gallery.",
    });
  }
};