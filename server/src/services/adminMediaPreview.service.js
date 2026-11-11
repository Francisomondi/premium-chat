
import mongoose from "mongoose";

import {
  GetObjectCommand,
} from "@aws-sdk/client-s3";

import {
  getSignedUrl,
} from "@aws-sdk/s3-request-presigner";

import Media, {
  MEDIA_TYPES,
  MEDIA_STATUSES,
  MEDIA_MODERATION_STATUSES,
} from "../models/Media.model.js";

import AppError from "../utils/AppError.js";

import {
  requireMediaStorage,
} from "../config/mediaStorage.js";

export const getAdminMediaPreview = async ({ mediaId }) => {
  if (!mongoose.isValidObjectId(mediaId)) {
    throw new AppError(
      "A valid media ID is required.",
      400,
      "INVALID_MEDIA_ID"
    );
  }

  const media = await Media.findOne({
    _id: mediaId,
    conversationId: null,
    mediaType: MEDIA_TYPES.IMAGE,
    status: MEDIA_STATUSES.READY,
    moderationStatus: MEDIA_MODERATION_STATUSES.PENDING,
    deletedAt: null,
  })
    .select("+previewStorageKey")
    .lean();

  if (!media || !media.previewStorageKey) {
    throw new AppError(
      "Pending media preview was not found.",
      404,
      "ADMIN_MEDIA_PREVIEW_NOT_FOUND"
    );
  }

  const { client, bucket } = requireMediaStorage();

  try {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: media.previewStorageKey,
      ResponseContentType: "image/webp",
      ResponseCacheControl: "private, no-store, max-age=0",
    });

    const previewUrl = await getSignedUrl(client, command, {
      expiresIn: 60,
    });

    return {
      mediaId: String(media._id),
      previewUrl,
      expiresIn: 60,
      expiresAt: new Date(Date.now() + 60 * 1000),
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError(
      "Unable to generate the admin media preview.",
      503,
      "ADMIN_MEDIA_PREVIEW_UNAVAILABLE"
    );
  }
};
