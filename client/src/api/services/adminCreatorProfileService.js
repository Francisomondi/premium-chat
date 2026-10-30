import axiosInstance from "../axiosInstance.js";

/**
 * ============================================================
 * PREMIUMCHAT — ADMIN CREATOR PROFILE API SERVICE
 * ============================================================
 *
 * Uses the existing Axios instance.
 *
 * Authentication is handled using HTTP-only cookies.
 *
 * Authorization is enforced by the backend.
 */

const ADMIN_CREATOR_PROFILE_BASE =
  "/admin/creator-profiles";

/**
 * VALIDATE PAGINATION
 */
const validatePagination = (page, limit) => {
  if (!Number.isInteger(page) || page < 1) {
    throw new RangeError(
      "Page must be a positive integer."
    );
  }

  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100
  ) {
    throw new RangeError(
      "Limit must be between 1 and 100."
    );
  }
};

/**
 * VALIDATE CREATOR ID
 */
const validateCreatorId = (creatorId) => {
  if (
    typeof creatorId !== "string" ||
    !/^[0-9a-fA-F]{24}$/.test(creatorId)
  ) {
    throw new TypeError(
      "A valid creator ID is required."
    );
  }

  return creatorId;
};

/**
 * ============================================================
 * GET CREATOR PROFILES
 * ============================================================
 *
 * GET /api/admin/creator-profiles
 */
export const getAdminCreatorProfiles = async ({
  page = 1,
  limit = 20,
} = {}) => {
  validatePagination(page, limit);

  const response = await axiosInstance.get(
    ADMIN_CREATOR_PROFILE_BASE,
    {
      params: {
        page,
        limit,
      },
    }
  );

  return response.data;
};

/**
 * ============================================================
 * GET CREATOR PROFILE DETAILS
 * ============================================================
 *
 * GET /api/admin/creator-profiles/:creatorId
 */
export const getAdminCreatorProfile = async (
  creatorId
) => {
  const validCreatorId =
    validateCreatorId(creatorId);

  const response = await axiosInstance.get(
    `${ADMIN_CREATOR_PROFILE_BASE}/${validCreatorId}`
  );

  return response.data;
};

/**
 * ============================================================
 * DEFAULT EXPORT
 * ============================================================
 */
const adminCreatorProfileService = {
  getAdminCreatorProfiles,
  getAdminCreatorProfile,
};

export default adminCreatorProfileService;