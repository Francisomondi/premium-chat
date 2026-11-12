
import axios from "axios";

import api from "../axiosInstance.js";

/**
 * ============================================================
 * PREMIUMCHAT — PAID MEDIA API SERVICE
 * ============================================================
 *
 * Responsibilities:
 *
 * 1. Create a private media upload intent.
 * 2. Upload the file directly to private R2 storage.
 * 3. Complete and verify the upload.
 * 4. Request authorized media delivery.
 *
 * SECURITY:
 *
 * - Authenticated API requests use the shared Axios instance.
 * - R2 uploads use the presigned URL directly.
 * - R2 requests do not include PremiumChat session cookies.
 * - Upload completion does not mean moderation approval.
 * - Media delivery authorization remains backend-controlled.
 */

/**
 * ============================================================
 * CREATE MEDIA UPLOAD INTENT
 * ============================================================
 */

export const createMediaUploadIntent = async (
  payload,
  options = {}
) => {
  if (!payload || typeof payload !== "object") {
    throw new Error("Media upload details are required.");
  }

  const destination =
    payload.destination ?? "CONVERSATION";

  if (!["CONVERSATION", "GALLERY"].includes(destination)) {
    throw new Error("Invalid media upload destination.");
  }

  if (
    destination === "CONVERSATION" &&
    !payload.conversationId
  ) {
    throw new Error(
      "A conversation ID is required for conversation uploads."
    );
  }

  if (
    destination === "GALLERY" &&
    payload.conversationId
  ) {
    throw new Error(
      "Gallery uploads cannot include a conversation ID."
    );
  }

  const requestPayload = {
    ...payload,
    destination,
  };

  const response = await api.post(
    "/media/uploads",
    requestPayload,
    {
      signal: options.signal,
    }
  );

  // The backend responds with:
  // { success, message, data: { media, upload } }
  //
  // ChatImageComposer expects:
  // { media, upload }
  //
  // Keep the fallback for compatibility with an unwrapped response.
  return response.data?.data ?? response.data;
};

/**
 * ============================================================
 * UPLOAD FILE DIRECTLY TO PRIVATE R2
 * ============================================================
 */

export const uploadMediaFile = async ({
  file,
  upload,
  onUploadProgress,
  signal,
}) => {
  if (!(file instanceof File)) {
    throw new Error("A valid media file is required.");
  }

  if (!upload?.url || upload?.method !== "PUT") {
    throw new Error("A valid media upload URL is required.");
  }

  const requiredHeaders =
    upload.requiredHeaders ?? {};

  try {
    const response = await axios.put(
      upload.url,
      file,
      {
        headers: requiredHeaders,

        // Never send PremiumChat authentication cookies
        // to the external storage URL.
        withCredentials: false,

        signal,

        onUploadProgress: (event) => {
          if (
            typeof onUploadProgress !== "function" ||
            !event.total
          ) {
            return;
          }

          const progress = Math.round(
            (event.loaded / event.total) * 100
          );

          onUploadProgress({
            loaded: event.loaded,
            total: event.total,
            progress,
          });
        },
      }
    );

    return {
      success:
        response.status >= 200 &&
        response.status < 300,
      status: response.status,
    };
  } catch (error) {
    if (error.code === "ERR_CANCELED") {
      throw error;
    }

    throw new Error(
      "The file could not be uploaded to private storage. Please try again."
    );
  }
};

/**
 * ============================================================
 * COMPLETE MEDIA UPLOAD
 * ============================================================
 */

export const completeMediaUpload = async (
  mediaId,
  options = {}
) => {
  if (
    typeof mediaId !== "string" ||
    !mediaId.trim()
  ) {
    throw new Error("A valid media ID is required.");
  }

  const response = await api.post(
    `/media/${encodeURIComponent(
      mediaId.trim()
    )}/complete`,
    {},
    {
      signal: options.signal,
    }
  );

  return response.data;
};

/**
 * ============================================================
 * REQUEST BLURRED CHAT IMAGE PREVIEW
 * ============================================================
 */

export const getMediaPreview = async (
  mediaId,
  options = {}
) => {
  if (
    typeof mediaId !== "string" ||
    !mediaId.trim()
  ) {
    throw new Error("A valid media ID is required.");
  }

  const response = await api.get(
    `/media/${encodeURIComponent(
      mediaId.trim()
    )}/preview`,
    {
      signal: options.signal,
    }
  );

  return response.data;
};

/**
 * ============================================================
 * REQUEST AUTHORIZED MEDIA DELIVERY
 * ============================================================
 */

export const getMediaAccess = async (
  mediaId,
  options = {}
) => {
  if (
    typeof mediaId !== "string" ||
    !mediaId.trim()
  ) {
    throw new Error("A valid media ID is required.");
  }

  const response = await api.get(
    `/media/${encodeURIComponent(
      mediaId.trim()
    )}/access`,
    {
      signal: options.signal,
    }
  );

  return response.data;
};

/**
 * ============================================================
 * PURCHASE LOCKED MEDIA
 * ============================================================
 */

export const purchaseMedia = async ({
  mediaId,
  phoneNumber,
  clientRequestId,
  signal,
}) => {
  if (
    typeof mediaId !== "string" ||
    !mediaId.trim()
  ) {
    throw new Error("A valid media ID is required.");
  }

  if (
    typeof phoneNumber !== "string" ||
    !phoneNumber.trim()
  ) {
    throw new Error("Your M-Pesa phone number is required.");
  }

  if (
    typeof clientRequestId !== "string" ||
    !/^[A-Za-z0-9_-]{8,100}$/.test(clientRequestId)
  ) {
    throw new Error("A valid purchase request ID is required.");
  }

  const response = await api.post(
    `/media/${encodeURIComponent(mediaId.trim())}/purchase`,
    {
      phoneNumber: phoneNumber.trim(),
      clientRequestId,
    },
    {
      signal,
    }
  );

  return response.data;
};


/**
 * ============================================================
 * REFRESH PAID-MEDIA PURCHASE STATUS
 * ============================================================
 *
 * The backend:
 * - Checks purchase ownership.
 * - Checks for a correlated M-Pesa callback.
 * - Performs Daraja STK Query when appropriate.
 * - Activates media access only after financial verification.
 *
 * This endpoint NEVER initiates another STK Push.
 */
export const getMediaPurchaseStatus = async (
  purchaseId,
  options = {}
) => {
  if (
    typeof purchaseId !== "string" ||
    !purchaseId.trim()
  ) {
    throw new Error("A valid media purchase ID is required.");
  }

  const response = await api.get(
    `/media/purchases/${encodeURIComponent(
      purchaseId.trim()
    )}/status`,
    {
      signal: options.signal,
    }
  );

  return response.data;
};

export default {
  createMediaUploadIntent,
  uploadMediaFile,
  completeMediaUpload,
  getMediaAccess,
  purchaseMedia,
  getMediaPreview,
  getMediaPurchaseStatus,
};
