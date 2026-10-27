import {
  getOrCreateCreatorMonetization,
  updateCreatorMonetization,
} from "../services/creatorMonetization.service.js";

/**
 * ============================================================
 * PREMIUMCHAT — CREATOR MONETIZATION CONTROLLER
 * ============================================================
 *
 * Authentication:
 * requireAuth
 *
 * Authorization:
 * requireCreator
 *
 * The authenticated creator is obtained from
 * req.auth.userId.
 */

/**
 * ============================================================
 * GET MY MONETIZATION SETTINGS
 * ============================================================
 *
 * GET /api/creator/monetization
 */

export const getMyMonetizationSettings = async (
  req,
  res,
  next
) => {
  try {
    const creatorId = req.auth.userId;

    const settings =
      await getOrCreateCreatorMonetization(
        creatorId
      );

    return res.status(200).json({
      success: true,
      data: {
        settings,
      },
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * ============================================================
 * UPDATE MY MONETIZATION SETTINGS
 * ============================================================
 *
 * PATCH /api/creator/monetization
 */

export const updateMyMonetizationSettings =
  async (req, res, next) => {
    try {
      const creatorId = req.auth.userId;

      const settings =
        await updateCreatorMonetization(
          creatorId,
          req.body
        );

      return res.status(200).json({
        success: true,
        message:
          "Monetization settings updated successfully.",
        data: {
          settings,
        },
      });
    } catch (error) {
      return next(error);
    }
  };