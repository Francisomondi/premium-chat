
import axiosInstance from "../axiosInstance.js";

/**
 * ============================================================
 * PREMIUMCHAT — CREATOR GALLERY PREVIEW API
 * ============================================================
 */

export const getCreatorGalleryPreview = async (
  creatorId,
  mediaId,
  { signal } = {}
) => {
  const normalizedCreatorId = String(
    creatorId ?? ""
  ).trim();

  const normalizedMediaId = String(
    mediaId ?? ""
  ).trim();

  if (!normalizedCreatorId || !normalizedMediaId) {
    throw new Error(
      "Valid creator and media IDs are required."
    );
  }

  const response = await axiosInstance.get(
    `/creators/${encodeURIComponent(normalizedCreatorId)}/gallery/${encodeURIComponent(normalizedMediaId)}/preview`,
    { signal }
  );

  if (
    !response.data?.success ||
    !response.data?.data?.previewUrl
  ) {
    throw new Error(
      response.data?.message ||
      "Unable to load the gallery preview."
    );
  }

  return response.data.data;
};
