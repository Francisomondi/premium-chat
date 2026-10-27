import {
  listPublicCreators,
  getPublicCreatorById,
} from "../services/creatorDiscovery.service.js";

/**
 * ============================================================
 * PREMIUMCHAT — CREATOR DISCOVERY CONTROLLER
 * ============================================================
 */

/**
 * ============================================================
 * GET PUBLIC CREATORS
 * ============================================================
 *
 * GET /api/creators
 */

export const getPublicCreators = async (
  req,
  res,
  next
) => {
  try {
    const {
      page = 1,
      limit = 6,
      search = "",
      sort = "newest",
    } = req.query;

    const result = await listPublicCreators({
      page,
      limit,
      search,
      sort,
    });

    return res.status(200).json({
      success: true,

      message:
        "Creators retrieved successfully.",

      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * ============================================================
 * GET PUBLIC CREATOR PROFILE
 * ============================================================
 *
 * GET /api/creators/:creatorId
 */

export const getPublicCreatorProfile = async (
  req,
  res,
  next
) => {
  try {
    const { creatorId } = req.params;

    const creator =
      await getPublicCreatorById(creatorId);

    if (!creator) {
      return res.status(404).json({
        success: false,
        message: "Creator not found.",
      });
    }

    return res.status(200).json({
      success: true,

      message:
        "Creator profile retrieved successfully.",

      data: {
        creator,
      },
    });
  } catch (error) {
    next(error);
  }
};