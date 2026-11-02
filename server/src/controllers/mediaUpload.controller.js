import mongoose from "mongoose";

import {
  HeadObjectCommand,
} from "@aws-sdk/client-s3";

import Media, {
  MEDIA_STATUSES,
  MEDIA_MODERATION_STATUSES,
} from "../models/Media.model.js";

import AppError from "../utils/AppError.js";

import {
  createMediaUploadIntent,
} from "../services/mediaUpload.service.js";

import {
  requireMediaStorage,
} from "../config/mediaStorage.js";


/**
 * ============================================================
 * CREATE MEDIA UPLOAD
 * ============================================================
 *
 * Creates a private media record and returns a short-lived
 * presigned R2 upload URL.
 *
 * The client uploads directly to private R2 storage.
 *
 * Media remains unavailable to viewers until verification,
 * processing and moderation are complete.
 */

export const createMediaUploadController = async (
  req,
  res,
  next
) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      throw new AppError(
        "Authentication is required.",
        401,
        "AUTHENTICATION_REQUIRED"
      );
    }

    const {
      conversationId,
      mediaType,
      mimeType,
      fileSize,
      accessPolicy,
      priceMinor,
      currency,
      rightsConfirmed,
      allDepictedAdultsAndConsented,
      attestationVersion,
    } = req.body;

    const result = await createMediaUploadIntent({
      creatorId: String(userId),
      conversationId,
      mediaType,
      mimeType,
      fileSize,
      accessPolicy,
      priceMinor,
      currency,
      rightsConfirmed,
      allDepictedAdultsAndConsented,
      attestationVersion,
    });

    return res.status(201).json({
      success: true,
      message: "Media upload initialized.",
      data: result,
    });
  } catch (error) {
    return next(error);
  }
};


/**
 * ============================================================
 * COMPLETE MEDIA UPLOAD
 * ============================================================
 *
 * Verifies that the uploaded object exists in private R2.
 *
 * Checks:
 * - Object existence
 * - Uploaded file size
 * - Uploaded MIME type
 * - Media ID metadata
 * - Creator ID metadata
 *
 * A successful upload moves the record from UPLOADING
 * to PROCESSING.
 *
 * This does NOT approve or publish the media.
 */

export const completeMediaUploadController = async (
  req,
  res,
  next
) => {
  try {
    const userId = req.user?.id;
    const { mediaId } = req.params;

    if (!userId) {
      throw new AppError(
        "Authentication is required.",
        401,
        "AUTHENTICATION_REQUIRED"
      );
    }

    if (!mongoose.isValidObjectId(mediaId)) {
      throw new AppError(
        "Invalid media ID.",
        400,
        "INVALID_MEDIA_ID"
      );
    }

    // Load the upload record, including its private storage key.
    const media = await Media.findOne({
      _id: mediaId,
      creatorId: userId,
      status: MEDIA_STATUSES.UPLOADING,
      moderationStatus: MEDIA_MODERATION_STATUSES.PENDING,
      deletedAt: null,
    }).select("+storageKey");

    if (!media) {
      throw new AppError(
        "Upload not found or no longer available.",
        404,
        "MEDIA_UPLOAD_NOT_FOUND"
      );
    }

    // An upload must have a valid expiry time.
    if (
      !media.uploadExpiresAt ||
      media.uploadExpiresAt <= new Date()
    ) {
      throw new AppError(
        "The upload session has expired. Please start a new upload.",
        410,
        "MEDIA_UPLOAD_EXPIRED"
      );
    }

    if (!media.storageKey) {
      throw new AppError(
        "The private storage reference is missing.",
        500,
        "MEDIA_STORAGE_KEY_MISSING"
      );
    }

    // Get the configured private R2 bucket.
    const {
      client,
      bucket,
    } = requireMediaStorage();

    let object;

    try {
      object = await client.send(
        new HeadObjectCommand({
          Bucket: bucket,
          Key: media.storageKey,
        })
      );
    } catch (storageError) {
      const missingObject =
        storageError?.name === "NotFound" ||
        storageError?.name === "NoSuchKey" ||
        storageError?.$metadata?.httpStatusCode === 404;

      if (missingObject) {
        throw new AppError(
          "The uploaded file could not be found in private storage.",
          409,
          "MEDIA_OBJECT_NOT_FOUND"
        );
      }

      // Do not expose storage credentials or internal errors.
      throw new AppError(
        "Unable to verify the uploaded file. Please try again.",
        503,
        "MEDIA_STORAGE_VERIFICATION_FAILED"
      );
    }

    // Verify the actual object size.
    if (Number(object.ContentLength) !== media.fileSize) {
      throw new AppError(
        "The uploaded file size does not match the declared file size.",
        422,
        "MEDIA_FILE_SIZE_MISMATCH"
      );
    }

    // Verify the actual MIME type.
    if (object.ContentType !== media.mimeType) {
      throw new AppError(
        "The uploaded file type does not match the declared file type.",
        422,
        "MEDIA_MIME_TYPE_MISMATCH"
      );
    }

    // Verify the metadata added when the presigned URL was created.
    const metadata = object.Metadata || {};

    if (
      metadata.mediaid !== String(media._id).toLowerCase() ||
      metadata.creatorid !== String(userId).toLowerCase()
    ) {
      throw new AppError(
        "The uploaded file metadata could not be verified.",
        422,
        "MEDIA_METADATA_MISMATCH"
      );
    }

    // Atomically transition the upload to PROCESSING.
    // This prevents multiple completion requests from processing
    // the same UPLOADING record concurrently.
    const updatedMedia = await Media.findOneAndUpdate(
      {
        _id: media._id,
        creatorId: userId,
        status: MEDIA_STATUSES.UPLOADING,
        moderationStatus: MEDIA_MODERATION_STATUSES.PENDING,
        deletedAt: null,
        uploadExpiresAt: {
          $gt: new Date(),
        },
      },
      {
        $set: {
          status: MEDIA_STATUSES.PROCESSING,
        },
      },
      {
        new: true,
      }
    ).select("_id status moderationStatus");

    if (!updatedMedia) {
      throw new AppError(
        "The upload could not be completed because its status has changed or its session has expired.",
        409,
        "MEDIA_UPLOAD_STATE_CHANGED"
      );
    }

    return res.status(202).json({
      success: true,
      message:
        "Upload verified successfully. Media is awaiting server-side processing and moderation.",
      data: {
        mediaId: String(updatedMedia._id),
        status: updatedMedia.status,
        moderationStatus: updatedMedia.moderationStatus,
      },
    });
  } catch (error) {
    return next(error);
  }
};