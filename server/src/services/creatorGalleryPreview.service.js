
import mongoose from "mongoose";

import {
  GetObjectCommand,
} from "@aws-sdk/client-s3";

import {
  getSignedUrl,
} from "@aws-sdk/s3-request-presigner";

import Media, {
  MEDIA_STATUSES,
  MEDIA_MODERATION_STATUSES,
} from "../models/Media.model.js";

import AppError from "../utils/AppError.js";

import {
  requireMediaStorage,
} from "../config/mediaStorage.js";

import {
  getPublicCreatorById,
} from "./creatorDiscovery.service.js";

/**
 * ============================================================
 * PREMIUMCHAT — PUBLIC CREATOR GALLERY MEDIA DELIVERY
 * ============================================================
 *
 * Delivers clear original images for approved public gallery
 * media using short-lived private R2 signed URLs.
 *
 * SECURITY:
 *
 * - Only publicly eligible creators.
 * - Only READY and APPROVED media.
 * - Never delivers pending or rejected media.
 * - Never delivers conversation media.
 * - Never delivers deleted media.
 * - Never exposes private storage keys.
 * - Uses short-lived signed R2 URLs.
 */

const MEDIA_URL_EXPIRY_SECONDS = 60;

/**
 * ============================================================
 * GENERATE PUBLIC CREATOR GALLERY MEDIA URL
 * ============================================================
 */

export const getPublicCreatorGalleryPreview = async ({
  creatorId,
  mediaId,
} = {}) => {
  if (
    !mongoose.isObjectIdOrHexString(creatorId) ||
    !mongoose.isObjectIdOrHexString(mediaId)
  ) {
    throw new AppError(
      "Invalid creator or media identifier.",
      400,
      "INVALID_GALLERY_PREVIEW_REQUEST"
    );
  }

  /**
   * Verify public creator eligibility.
   */

  const creator = await getPublicCreatorById(
    creatorId
  );

  if (!creator) {
    return null;
  }

  /**
   * Retrieve only eligible public gallery media.
   *
   * storageKey is explicitly selected because
   * the model marks it select:false.
   */

  const media = await Media.findOne({
    _id: new mongoose.Types.ObjectId(mediaId),

    creatorId: new mongoose.Types.ObjectId(
      creatorId
    ),

    conversationId: null,

    status: MEDIA_STATUSES.READY,

    moderationStatus:
      MEDIA_MODERATION_STATUSES.APPROVED,

    deletedAt: null,
  })
    .select("+storageKey")
    .lean();

  if (!media) {
    return null;
  }

  /**
   * Never fall back to the blurred preview.
   * Public gallery delivery requires the original.
   */

  if (
    typeof media.storageKey !== "string" ||
    !media.storageKey.trim()
  ) {
    throw new AppError(
      "The approved original media is not available.",
      404,
      "GALLERY_MEDIA_NOT_AVAILABLE"
    );
  }

  /**
   * Validate the original media MIME type.
   */

  if (
    typeof media.mimeType !== "string" ||
    !media.mimeType.startsWith("image/")
  ) {
    throw new AppError(
      "This gallery delivery endpoint supports images only.",
      415,
      "UNSUPPORTED_GALLERY_MEDIA_TYPE"
    );
  }

  /**
   * Generate a short-lived private R2 URL
   * pointing to the original image.
   */

  const {
    client,
    bucket,
  } = requireMediaStorage();

  try {
    const command = new GetObjectCommand({
      Bucket: bucket,

      Key: media.storageKey,

      ResponseContentType: media.mimeType,

      ResponseCacheControl:
        "private, no-store, max-age=0",
    });

    const previewUrl = await getSignedUrl(
      client,
      command,
      {
        expiresIn: MEDIA_URL_EXPIRY_SECONDS,
      }
    );

    return {
      mediaId: media._id.toString(),

      previewUrl,

      expiresIn: MEDIA_URL_EXPIRY_SECONDS,

      expiresAt: new Date(
        Date.now() +
        MEDIA_URL_EXPIRY_SECONDS * 1000
      ).toISOString(),
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError(
      "Unable to generate the public gallery media URL.",
      503,
      "GALLERY_MEDIA_DELIVERY_UNAVAILABLE"
    );
  }
};
