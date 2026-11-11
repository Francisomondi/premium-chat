import axiosInstance from "../axiosInstance.js";

/**
 * ============================================================
 * PREMIUMCHAT — CREATOR MEDIA MANAGEMENT API
 * ============================================================
 *
 * Fetches media belonging to the currently authenticated
 * creator. The backend derives the creator ID from the
 * authenticated session.
 */

export const getMyCreatorMedia = async ({
  page = 1,
  limit = 12,
  signal,
} = {}) => {
  const response = await axiosInstance.get(
    "/creators/me/gallery",
    {
      params: {
        page,
        limit,
      },
      signal,
    }
  );

  if (!response.data?.success) {
    throw new Error(
      response.data?.message ||
      "Unable to load your media gallery."
    );
  }

  return response.data.data;
};