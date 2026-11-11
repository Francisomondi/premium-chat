
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
  generatePaidConversationPreview,
} from "../services/mediaProcessing.service.js";

import {
  MEDIA_ACCESS_POLICIES,
} from "../constants/mediaAccess.constants.js";

import {
  requireMediaStorage,
} from "../config/mediaStorage.js";

import MediaProcessingJob, {
  MEDIA_JOB_STATUSES,
} from "../models/MediaProcessingJob.model.js";

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
 * Gallery media remains unavailable until processing and
 * moderation are complete.
 *
 * Conversation images follow their separate completion path.
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
      destination,
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
      uploaderId: String(userId),
      destination,
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
 * - Uploader ID metadata
 *
 * Conversation images:
 * - Bypass the gallery processing queue.
 * - Free images become READY and APPROVED immediately.
 * - Paid creator images receive a private blurred preview
 *   before becoming READY and APPROVED.
 *
 * Gallery images:
 * - Continue through the existing processing queue.
 * - Remain pending moderation.
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

    const media = await Media.findOne({
      _id: mediaId,
      $or: [
        { uploaderId: userId },
        { uploaderId: null, creatorId: userId },
      ],
      status: {
        $in: [
          MEDIA_STATUSES.UPLOADING,
          MEDIA_STATUSES.PROCESSING,
        ],
      },
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

    const { client, bucket } = requireMediaStorage();

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

      throw new AppError(
        "Unable to verify the uploaded file. Please try again.",
        503,
        "MEDIA_STORAGE_VERIFICATION_FAILED"
      );
    }

    // Verify actual object size.
    if (Number(object.ContentLength) !== media.fileSize) {
      throw new AppError(
        "The uploaded file size does not match the declared file size.",
        422,
        "MEDIA_FILE_SIZE_MISMATCH"
      );
    }

    // Verify actual MIME type.
    if (object.ContentType !== media.mimeType) {
      throw new AppError(
        "The uploaded file type does not match the declared file type.",
        422,
        "MEDIA_MIME_TYPE_MISMATCH"
      );
    }

    // Verify R2 object metadata.
    const metadata = object.Metadata || {};

    const expectedCreatorId =
      String(media.creatorId).toLowerCase();

    const expectedUploaderId =
      String(media.uploaderId || media.creatorId).toLowerCase();

    const creatorMetadataMatches =
      metadata.creatorid === expectedCreatorId;

    const uploaderMetadataMatches = media.uploaderId
      ? metadata.uploaderid === expectedUploaderId
      : metadata.creatorid === expectedUploaderId;

    if (
      metadata.mediaid !== String(media._id).toLowerCase() ||
      !creatorMetadataMatches ||
      !uploaderMetadataMatches
    ) {
      throw new AppError(
        "The uploaded file metadata could not be verified.",
        422,
        "MEDIA_METADATA_MISMATCH"
      );
    }

    /**
     * ========================================================
     * CONVERSATION IMAGE COMPLETION
     * ========================================================
     *
     * Conversation images bypass gallery processing and
     * moderation jobs.
     *
     * APPROVED is used here as the availability state required
     * by the existing media authorization contract. It does
     * not replace verified-purchase authorization.
     *
     * PUBLIC conversation media is free to eligible
     * authenticated conversation participants. It is not
     * publicly accessible over the internet.
     *
     * PURCHASE_ONLY creator media remains locked until the
     * existing verified-purchase authorization permits access.
     */

    const isConversationImage =
      Boolean(media.conversationId) &&
      media.mediaType === "IMAGE";

    if (isConversationImage) {
      const isCreatorUploader =
        String(media.uploaderId || media.creatorId) ===
        String(media.creatorId);

      const isUserUploader =
        String(media.uploaderId) === String(userId) &&
        String(media.creatorId) !== String(userId);

      const isFree =
        media.accessPolicy === MEDIA_ACCESS_POLICIES.PUBLIC &&
        media.priceMinor === 0;

      const isPaid =
        media.accessPolicy === MEDIA_ACCESS_POLICIES.PURCHASE_ONLY &&
        Number.isSafeInteger(media.priceMinor) &&
        media.priceMinor > 0;

      const validCreatorUpload =
        isCreatorUploader && (isFree || isPaid);

      const validUserUpload =
        isUserUploader && isFree;

      if (
        media.currency !== "KES" ||
        (!validCreatorUpload && !validUserUpload)
      ) {
        throw new AppError(
          "The conversation image has an invalid access configuration.",
          422,
          "CHAT_MEDIA_POLICY_INVALID"
        );
      }

      const validStates = [
        MEDIA_STATUSES.UPLOADING,
        MEDIA_STATUSES.PROCESSING,
      ];

      if (!validStates.includes(media.status)) {
        throw new AppError(
          "The conversation image is not in a valid completion state.",
          409,
          "CHAT_MEDIA_INVALID_STATE"
        );
      }

      // Paid creator images need a blurred private preview
      // before they can become available to conversation viewers.
      //
      // This helper does not create a gallery processing job.
      if (isCreatorUploader && isPaid) {
        await generatePaidConversationPreview({
          mediaId: String(media._id),
        });
      }

      const updatedMedia = await Media.findOneAndUpdate(
        {
          _id: media._id,
          $or: [
            { uploaderId: userId },
            { uploaderId: null, creatorId: userId },
          ],
          status: {
            $in: validStates,
          },
          moderationStatus: MEDIA_MODERATION_STATUSES.PENDING,
          deletedAt: null,
          uploadExpiresAt: {
            $gt: new Date(),
          },
        },
        {
          $set: {
            status: MEDIA_STATUSES.READY,
            moderationStatus: MEDIA_MODERATION_STATUSES.APPROVED,
          },
        },
        {
          returnDocument: "after",
          runValidators: true,
        }
      ).select("_id status moderationStatus");

      if (!updatedMedia) {
        throw new AppError(
          "The conversation image upload could not be completed because its status changed or its session expired.",
          409,
          "MEDIA_UPLOAD_STATE_CHANGED"
        );
      }

      // Intentionally do not create a MediaProcessingJob.
      return res.status(200).json({
        success: true,
        message: "Conversation image uploaded successfully.",
        data: {
          mediaId: String(updatedMedia._id),
          status: updatedMedia.status,
          moderationStatus: updatedMedia.moderationStatus,
        },
      });
    }

    /**
     * ========================================================
     * CREATOR GALLERY COMPLETION
     * ========================================================
     *
     * Gallery uploads retain their existing processing and
     * moderation workflow.
     */

    let updatedMedia;

    if (media.status === MEDIA_STATUSES.UPLOADING) {
      updatedMedia = await Media.findOneAndUpdate(
        {
          _id: media._id,
          ...(media.uploaderId
            ? { uploaderId: userId }
            : {
                uploaderId: null,
                creatorId: userId,
              }),
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
          returnDocument: "after",
        }
      ).select("_id status moderationStatus");

      if (!updatedMedia) {
        throw new AppError(
          "The upload could not be completed because its status has changed or its session has expired.",
          409,
          "MEDIA_UPLOAD_STATE_CHANGED"
        );
      }
    } else if (media.status === MEDIA_STATUSES.PROCESSING) {
      updatedMedia = media;
    } else {
      throw new AppError(
        "The creator media upload is not in a valid completion state.",
        409,
        "CREATOR_MEDIA_INVALID_STATE"
      );
    }

    await MediaProcessingJob.findOneAndUpdate(
      {
        mediaId: updatedMedia._id,
      },
      {
        $setOnInsert: {
          mediaId: updatedMedia._id,
          status: MEDIA_JOB_STATUSES.QUEUED,
          attempts: 0,
          maxAttempts: 3,
          availableAt: new Date(),
        },
      },
      {
        upsert: true,
        returnDocument: "after",
        setDefaultsOnInsert: true,
      }
    );

    return res.status(202).json({
      success: true,
      message:
        "Creator gallery upload verified successfully. Media is awaiting server-side processing and moderation.",
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
