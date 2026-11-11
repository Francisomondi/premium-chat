
import mongoose from "mongoose";

import {
  GetObjectCommand,
} from "@aws-sdk/client-s3";

import {
  getSignedUrl,
} from "@aws-sdk/s3-request-presigner";

import Media from "../models/Media.model.js";
import AppError from "../utils/AppError.js";

import {
  requireMediaStorage,
} from "../config/mediaStorage.js";

import {
  verifyConversationMembership,
} from "./conversation.service.js";

/**
 * ============================================================
 * PREMIUMCHAT — LOCKED CHAT IMAGE PREVIEW
 * ============================================================
 *
 * SECURITY:
 *
 * - Only authenticated conversation participants.
 * - Only READY and APPROVED images.
 * - Only conversation-linked media.
 * - Only the blurred previewStorageKey is signed.
 * - Never falls back to the original storageKey.
 * - Never returns private storage keys.
 * - Short-lived, read-only signed URLs.
 *
 * This service does NOT grant access to the original media.
 */

const DEFAULT_PREVIEW_TTL_SECONDS = 120;
const MAX_PREVIEW_TTL_SECONDS = 300;

const getPreviewUrlTtl = () => {
  const configured = Number(
    process.env.MEDIA_PREVIEW_URL_TTL_SECONDS
  );

  if (
    !Number.isInteger(configured) ||
    configured < 60
  ) {
    return DEFAULT_PREVIEW_TTL_SECONDS;
  }

  return Math.min(
    configured,
    MAX_PREVIEW_TTL_SECONDS
  );
};

export const createMediaPreviewUrl = async ({
  mediaId,
  viewerId,
}) => {
  /**
   * STEP 1 — VALIDATE IDS
   */

  if (!mongoose.isObjectIdOrHexString(mediaId)) {
    throw new AppError(
      "Invalid media ID.",
      400,
      "INVALID_MEDIA_ID"
    );
  }

  if (!mongoose.isObjectIdOrHexString(viewerId)) {
    throw new AppError(
      "Authentication is required.",
      401,
      "INVALID_VIEWER"
    );
  }

  /**
   * STEP 2 — LOAD ONLY THE REQUIRED PRIVATE PREVIEW KEY
   */

  const media = await Media.findById(mediaId)
    .select("+previewStorageKey");

  if (!media) {
    throw new AppError(
      "Media not found.",
      404,
      "MEDIA_NOT_FOUND"
    );
  }

  /**
   * STEP 3 — REQUIRE AN APPROVED, READY IMAGE
   */

  if (
    media.mediaType !== "IMAGE" ||
    media.status !== "READY" ||
    media.moderationStatus !== "APPROVED" ||
    media.deletedAt
  ) {
    throw new AppError(
      "This image preview is unavailable.",
      404,
      "MEDIA_PREVIEW_UNAVAILABLE"
    );
  }

  /**
   * STEP 4 — REQUIRE CONVERSATION-LINKED MEDIA
   */

  if (!media.conversationId) {
    throw new AppError(
      "This preview is not available in a conversation.",
      403,
      "MEDIA_PREVIEW_NOT_IN_CONVERSATION"
    );
  }

  /**
   * STEP 5 — VERIFY ACTIVE CONVERSATION MEMBERSHIP
   */

  await verifyConversationMembership({
    conversationId: String(media.conversationId),
    userId: String(viewerId),
    requireActive: true,
  });

  /**
   * STEP 6 — REQUIRE THE BLURRED PREVIEW OBJECT
   *
   * IMPORTANT:
   * Never use media.storageKey as a fallback.
   */

  if (
    typeof media.previewStorageKey !== "string" ||
    !media.previewStorageKey.trim()
  ) {
    throw new AppError(
      "The blurred image preview is not available.",
      404,
      "MEDIA_PREVIEW_NOT_GENERATED"
    );
  }

  /**
   * STEP 7 — REQUIRE PRIVATE STORAGE
   */

  const {
    client,
    bucket,
  } = requireMediaStorage();

  /**
   * STEP 8 — SIGN ONLY THE BLURRED WEBP PREVIEW
   */

  const expiresIn = getPreviewUrlTtl();

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: media.previewStorageKey,

    ResponseContentType: "image/webp",

    ResponseContentDisposition: "inline",

    ResponseCacheControl:
      "private, no-store, max-age=0",
  });

  const signedUrl = await getSignedUrl(
    client,
    command,
    {
      expiresIn,
    }
  );

  /**
   * STEP 9 — RETURN SAFE PREVIEW INFORMATION
   */

  return {
    media: {
      id: String(media._id),
      mediaType: media.mediaType,
    },

    preview: {
      url: signedUrl,
      mimeType: "image/webp",
      expiresIn,
    },
  };
};

export default {
  createMediaPreviewUrl,
};
