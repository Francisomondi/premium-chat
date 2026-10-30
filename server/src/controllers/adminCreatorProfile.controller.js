import {
  listAdminCreatorProfiles,
  getAdminCreatorProfileById,
} from "../services/adminCreatorProfile.service.js";

/**
 * ============================================================
 * PREMIUMCHAT — ADMIN CREATOR PROFILE CONTROLLER
 * ============================================================
 */

/**
 * GET /api/admin/creator-profiles
 */
export const getAdminCreatorProfiles = async (
  req,
  res,
  next
) => {
  try {
    const adminId = req.auth.userId;

    const query =
      req.validated?.query ?? req.query;

    const result = await listAdminCreatorProfiles({
      adminId,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    });

    return res.status(200).json({
      success: true,

      message:
        "Creator profiles retrieved successfully.",

      data: result,

      requestId: req.requestId,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * GET /api/admin/creator-profiles/:creatorId
 */
export const getAdminCreatorProfile = async (
  req,
  res,
  next
) => {
  try {
    const adminId = req.auth.userId;

    const params =
      req.validated?.params ?? req.params;

    const creator =
      await getAdminCreatorProfileById({
        adminId,
        creatorId: params.creatorId,
      });

    return res.status(200).json({
      success: true,

      message:
        "Creator profile retrieved successfully.",

      data: {
        creator,
      },

      requestId: req.requestId,
    });
  } catch (error) {
    return next(error);
  }
};