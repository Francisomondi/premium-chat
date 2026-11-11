
import axiosInstance from "../axiosInstance.js";

/**
 * ============================================================
 * PREMIUMCHAT — ADMIN MEDIA MODERATION API
 * ============================================================
 */

/**
 * Fetch media awaiting moderation.
 */
export const getPendingMediaForModeration = async ({
  page = 1,
  limit = 20,
  signal,
} = {}) => {
  const response = await axiosInstance.get("/admin/media", {
    params: { page, limit },
    signal,
  });

  if (
    !response.data?.success ||
    !Array.isArray(response.data?.data?.media)
  ) {
    throw new Error(
      response.data?.message ||
      "Unable to retrieve pending media."
    );
  }

  return response.data.data;
};

/**
 * Approve processed gallery media.
 */
export const approveGalleryMedia = async (
  mediaId,
  { signal } = {}
) => {
  const normalizedMediaId = String(mediaId ?? "").trim();

  if (!normalizedMediaId) {
    throw new Error("A valid media ID is required.");
  }

  const response = await axiosInstance.patch(
    `/admin/media/${encodeURIComponent(normalizedMediaId)}/approve`,
    {},
    { signal }
  );

  if (
    !response.data?.success ||
    !response.data?.data?.media
  ) {
    throw new Error(
      response.data?.message ||
      "Unable to approve this media."
    );
  }

  return response.data.data.media;
};

/**
 * Reject processed gallery media.
 */
export const rejectGalleryMedia = async (
  mediaId,
  { signal } = {}
) => {
  const normalizedMediaId = String(mediaId ?? "").trim();

  if (!normalizedMediaId) {
    throw new Error("A valid media ID is required.");
  }

  const response = await axiosInstance.patch(
    `/admin/media/${encodeURIComponent(normalizedMediaId)}/reject`,
    {},
    { signal }
  );

  if (
    !response.data?.success ||
    !response.data?.data?.media
  ) {
    throw new Error(
      response.data?.message ||
      "Unable to reject this media."
    );
  }

  return response.data.data.media;
};


export const getAdminMediaPreview = async (mediaId, { signal } = {}) => {
  const normalizedMediaId = String(mediaId ?? "").trim();

  if (!normalizedMediaId) {
    throw new Error("A valid media ID is required.");
  }

  const response = await axiosInstance.get(
    `/admin/media/${encodeURIComponent(normalizedMediaId)}/preview`,
    { signal }
  );

  if (
    !response.data?.success ||
    !response.data?.data?.previewUrl
  ) {
    throw new Error(
      "Unable to retrieve the admin media preview."
    );
  }

  return response.data.data;
};