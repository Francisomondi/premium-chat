import axiosInstance from "./axiosInstance.js";

/**
 * ============================================================
 * PREMIUMCHAT — CREATOR API
 * ============================================================
 *
 * STEP 4.2.4
 *
 * Public creator discovery API.
 *
 * Backend endpoints:
 *
 * GET /api/creators
 * GET /api/creators/:creatorId
 */

/**
 * ============================================================
 * GET PUBLIC CREATORS
 * ============================================================
 */

export const getPublicCreators = async ({
  page = 1,
  limit = 6,
  search = "",
  sort = "newest",
  signal,
} = {}) => {
  const response = await axiosInstance.get(
    "/creators",
    {
      params: {
        page,
        limit,
        search,
        sort,
      },
      signal,
    }
  );

  return response.data;
};

/**
 * ============================================================
 * GET PUBLIC CREATOR PROFILE
 * ============================================================
 */

export const getPublicCreatorProfile = async (
  creatorId,
  { signal } = {}
) => {
  if (!creatorId) {
    throw new Error("Creator ID is required.");
  }

  const response = await axiosInstance.get(
    `/creators/${encodeURIComponent(creatorId)}`,
    {
      signal,
    }
  );

  return response.data;
};