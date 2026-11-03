import axiosInstance from "../axiosInstance.js";

/**
 * Fetch approved public gallery media for a creator.
 *
 * The backend controls creator eligibility and media visibility.
 * This service does not construct or expose storage URLs.
 */
export const getPublicCreatorGallery = async (
  creatorId,
  {
    page = 1,
    limit = 12,
    signal,
  } = {}
) => {
  const normalizedCreatorId =
    String(creatorId ?? "").trim();

  if (!normalizedCreatorId) {
    throw new Error("A valid creator ID is required.");
  }

  const response = await axiosInstance.get(
    `/creators/${encodeURIComponent(normalizedCreatorId)}/gallery`,
    {
      params: {
        page,
        limit,
      },
      signal,
    }
  );

  return response.data;
};