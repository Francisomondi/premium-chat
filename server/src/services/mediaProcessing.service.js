
import crypto from "node:crypto";

import {
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

import sharp from "sharp";

import Media, {
  MEDIA_TYPES,
  MEDIA_STATUSES,
  MEDIA_MODERATION_STATUSES,
} from "../models/Media.model.js";

import AppError from "../utils/AppError.js";

import {
  requireMediaStorage,
} from "../config/mediaStorage.js";

/**
 * ============================================================
 * PREMIUMCHAT — IMAGE PROCESSING SERVICE
 * ============================================================
 *
 * SECURITY:
 *
 * - Original media remains in private R2 storage.
 * - Actual image contents are inspected using Sharp.
 * - Client-provided MIME types are not trusted.
 * - Generated previews are heavily blurred.
 * - Preview objects remain in private R2 storage.
 * - Preview keys are never returned to clients.
  * - Successful processing is automatically approved
 *   during queue finalization.
 */

const MAX_IMAGE_BYTES =
  Number(process.env.MEDIA_MAX_IMAGE_BYTES) ||
  10 * 1024 * 1024;

const MAX_INPUT_PIXELS = 40_000_000;

const PREVIEW_WIDTH = 480;
const PREVIEW_HEIGHT = 480;
const PREVIEW_BLUR_RADIUS = 30;

const ALLOWED_IMAGE_FORMATS = Object.freeze({
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
});

/**
 * ============================================================
 * VALIDATE MEDIA ID
 * ============================================================
 */

const validateMediaId = (mediaId) => {
  if (
    typeof mediaId !== "string" ||
    !/^[a-f\d]{24}$/i.test(mediaId)
  ) {
    throw new AppError(
      "Invalid media ID.",
      400,
      "INVALID_MEDIA_ID"
    );
  }

  return mediaId;
};

/**
 * ============================================================
 * READ S3 STREAM SAFELY
 * ============================================================
 *
 * Enforces a strict byte limit while downloading.
 */

const readObjectStream = async (body, expectedSize) => {
  if (
    !body ||
    typeof body[Symbol.asyncIterator] !== "function"
  ) {
    throw new AppError(
      "Unable to read the original media.",
      503,
      "MEDIA_STREAM_UNAVAILABLE"
    );
  }

  const chunks = [];
  let totalBytes = 0;

  for await (const chunk of body) {
    const buffer = Buffer.from(chunk);

    totalBytes += buffer.length;

    if (
      totalBytes > MAX_IMAGE_BYTES ||
      totalBytes > expectedSize
    ) {
      throw new AppError(
        "The uploaded image exceeds the permitted size.",
        413,
        "MEDIA_PROCESSING_SIZE_EXCEEDED"
      );
    }

    chunks.push(buffer);
  }

  if (totalBytes !== expectedSize) {
    throw new AppError(
      "The downloaded image size does not match its upload record.",
      422,
      "MEDIA_PROCESSING_SIZE_MISMATCH"
    );
  }

  return Buffer.concat(chunks, totalBytes);
};

/**
 * ============================================================
 * VERIFY ACTUAL IMAGE CONTENTS
 * ============================================================
 */

const inspectImage = async (buffer, expectedMimeType) => {
  let metadata;

  try {
    metadata = await sharp(buffer, {
      failOn: "error",
      limitInputPixels: MAX_INPUT_PIXELS,
      animated: false,
    }).metadata();
  } catch {
    throw new AppError(
      "The uploaded image is corrupted or invalid.",
      422,
      "INVALID_IMAGE_CONTENT"
    );
  }

  const actualMimeType =
    ALLOWED_IMAGE_FORMATS[metadata.format];

  if (
    !actualMimeType ||
    actualMimeType !== expectedMimeType
  ) {
    throw new AppError(
      "The actual image format does not match the declared file type.",
      422,
      "IMAGE_FORMAT_MISMATCH"
    );
  }

  if (
    !Number.isSafeInteger(metadata.width) ||
    !Number.isSafeInteger(metadata.height) ||
    metadata.width <= 0 ||
    metadata.height <= 0 ||
    metadata.width * metadata.height > MAX_INPUT_PIXELS
  ) {
    throw new AppError(
      "The image dimensions are invalid or exceed processing limits.",
      422,
      "IMAGE_DIMENSIONS_INVALID"
    );
  }

  return metadata;
};

/**
 * ============================================================
 * GENERATE BLURRED TEASER PREVIEW
 * ============================================================
 *
 * Preview is intentionally blurred.
 * It must never be used as the original paid media.
 */

const generatePreview = async (buffer) => {
  try {
    return await sharp(buffer, {
      failOn: "error",
      limitInputPixels: MAX_INPUT_PIXELS,
      animated: false,
    })
      .rotate()
      .resize({
        width: PREVIEW_WIDTH,
        height: PREVIEW_HEIGHT,
        fit: "inside",
        withoutEnlargement: true,
      })
      .blur(PREVIEW_BLUR_RADIUS)
      .webp({
        quality: 35,
        effort: 4,
      })
      .toBuffer();
  } catch {
    throw new AppError(
      "The image preview could not be generated.",
      422,
      "IMAGE_PREVIEW_GENERATION_FAILED"
    );
  }
};

/**
 * ============================================================
 * PROCESS CREATOR IMAGE
 * ============================================================
 */

export const processCreatorImage = async ({
  mediaId,
}) => {
  validateMediaId(mediaId);

  /**
   * STEP 1:
   * Load only media eligible for processing.
   */

  const media = await Media.findOne({
    _id: mediaId,
    mediaType: MEDIA_TYPES.IMAGE,
    status: MEDIA_STATUSES.PROCESSING,
    moderationStatus: MEDIA_MODERATION_STATUSES.PENDING,
    deletedAt: null,
  }).select("+storageKey");

  if (!media) {
    throw new AppError(
      "Image is unavailable for processing.",
      404,
      "MEDIA_NOT_PROCESSABLE"
    );
  }

  if (
    !media.storageKey ||
    !media.creatorId ||
    !media.fileSize ||
    media.fileSize > MAX_IMAGE_BYTES
  ) {
    throw new AppError(
      "The original image storage information is invalid.",
      422,
      "MEDIA_STORAGE_METADATA_INVALID"
    );
  }

  /**
   * STEP 2:
   * Require private R2 storage.
   */

  const {
    client,
    bucket,
  } = requireMediaStorage();

  /**
   * STEP 3:
   * Retrieve original image.
   */

  let object;

  try {
    object = await client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: media.storageKey,
      })
    );
  } catch (error) {
    const providerErrorCode =
      error?.name ||
      error?.Code ||
      error?.code;

    if (
      providerErrorCode === "NoSuchKey" ||
      providerErrorCode === "NotFound"
    ) {
      throw new AppError(
        "The original image does not exist in private storage.",
        422,
        "MEDIA_ORIGINAL_OBJECT_MISSING"
      );
    }

    throw new AppError(
      "Unable to retrieve the original image from private storage.",
      503,
      "MEDIA_ORIGINAL_DOWNLOAD_FAILED"
    );
  }

  /**
   * STEP 4:
   * Verify object metadata again.
   */

  const objectMetadata = object.Metadata || {};

const expectedCreatorId = String(media.creatorId).toLowerCase();

const expectedUploaderId = String(
  media.uploaderId || media.creatorId
).toLowerCase();

const creatorMetadataMatches =
  objectMetadata.creatorid === expectedCreatorId;

const uploaderMetadataMatches = media.uploaderId
  ? objectMetadata.uploaderid === expectedUploaderId
  : objectMetadata.creatorid === expectedUploaderId;

  if (
    Number(object.ContentLength) !== media.fileSize ||
    object.ContentType !== media.mimeType ||
    objectMetadata.mediaid !== String(media._id).toLowerCase() ||
    !creatorMetadataMatches ||
    !uploaderMetadataMatches
  ) {
    throw new AppError(
      "The original image failed storage verification.",
      422,
      "MEDIA_PROCESSING_METADATA_MISMATCH"
    );
  }

  /**
   * STEP 5:
   * Read the original with a strict size limit.
   */

  const originalBuffer = await readObjectStream(
    object.Body,
    media.fileSize
  );

  /**
   * STEP 6:
   * Validate the actual image format and dimensions.
   */

  await inspectImage(
    originalBuffer,
    media.mimeType
  );

  /**
   * STEP 7:
   * Generate a blurred WebP preview.
   */

  const previewBuffer = await generatePreview(
    originalBuffer
  );

  /**
   * STEP 8:
   * Generate a server-controlled private key.
   *
   * Deterministic path makes retries overwrite the
   * same preview rather than creating duplicate objects.
   */

  const previewStorageKey =
    `private/previews/${media.creatorId}/${media._id}/teaser-${crypto
      .createHash("sha256")
      .update(String(media._id))
      .digest("hex")
      .slice(0, 16)}.webp`;

  /**
   * STEP 9:
   * Upload the generated preview privately.
   */

  try {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: previewStorageKey,
        Body: previewBuffer,
        ContentLength: previewBuffer.length,
        ContentType: "image/webp",
        CacheControl: "private, no-store, max-age=0",
        Metadata: {
          mediaid: String(media._id),
          creatorid: String(media.creatorId),
          preview: "true",
        },
      })
    );
  } catch {
    throw new AppError(
      "Unable to store the generated image preview.",
      503,
      "MEDIA_PREVIEW_STORAGE_FAILED"
    );
  }

/**
 * STEP 10:
 * Save the private preview reference.
 *
 * Media remains PROCESSING.
 * Moderation remains PENDING during processing.
 *
 * The processing queue automatically approves
 * the image when processing completes successfully.
 */

  const updatedMedia = await Media.findOneAndUpdate(
    {
      _id: media._id,
      status: MEDIA_STATUSES.PROCESSING,
      moderationStatus: MEDIA_MODERATION_STATUSES.PENDING,
      deletedAt: null,
    },
    {
      $set: {
        previewStorageKey,
      },
    },
    {
      new: true,
      runValidators: true,
    }
  ).select("_id status moderationStatus");

  if (!updatedMedia) {
    throw new AppError(
      "The media changed while its preview was being generated.",
      409,
      "MEDIA_PROCESSING_STATE_CHANGED"
    );
  }

  /**
   * STEP 11:
   * Return safe processing information.
   *
   * Never return storage keys or signed URLs.
   */

  return {
    mediaId: String(updatedMedia._id),
    status: updatedMedia.status,
    moderationStatus: updatedMedia.moderationStatus,
    previewGenerated: true,
  };
};


/**
 * ============================================================
 * GENERATE PAID CONVERSATION IMAGE PREVIEW
 * ============================================================
 *
 * This is deliberately separate from gallery processing.
 *
 * - Only paid creator conversation images are eligible.
 * - The original remains private.
 * - Only the blurred preview is generated and stored.
 * - No MediaProcessingJob is created.
 * - The caller marks the conversation image READY after
 *   this function succeeds.
 */




export const generatePaidConversationPreview = async ({
  mediaId,
  allowRepair = false,
}) => {
  validateMediaId(mediaId);

  // Normal uploads and repairs have separate, tightly scoped states.
  const lifecycleFilter = allowRepair
    ? {
        status: MEDIA_STATUSES.READY,
        moderationStatus: MEDIA_MODERATION_STATUSES.APPROVED,
      }
    : {
        status: {
          $in: [
            MEDIA_STATUSES.UPLOADING,
            MEDIA_STATUSES.PROCESSING,
          ],
        },
        moderationStatus: MEDIA_MODERATION_STATUSES.PENDING,
      };

  const mediaFilter = {
    _id: mediaId,
    mediaType: MEDIA_TYPES.IMAGE,
    accessPolicy: "PURCHASE_ONLY",
    conversationId: { $ne: null },
    deletedAt: null,
    previewStorageKey: null,
    ...lifecycleFilter,
  };

  const media = await Media.findOne(mediaFilter).select(
    "+storageKey +previewStorageKey"
  );

  if (!media) {
    throw new AppError(
      "Paid conversation image is unavailable or does not qualify for preview generation.",
      404,
      "PAID_CHAT_MEDIA_NOT_FOUND"
    );
  }

  if (
    !media.storageKey ||
    !media.creatorId ||
    !media.uploaderId ||
    String(media.creatorId) !== String(media.uploaderId) ||
    !Number.isSafeInteger(media.priceMinor) ||
    media.priceMinor <= 0 ||
    media.currency !== "KES" ||
    !Number.isSafeInteger(media.fileSize) ||
    media.fileSize <= 0 ||
    media.fileSize > MAX_IMAGE_BYTES
  ) {
    throw new AppError(
      "Paid conversation image metadata is invalid.",
      422,
      "PAID_CHAT_MEDIA_METADATA_INVALID"
    );
  }

  const { client, bucket } = requireMediaStorage();

  let object;

  try {
    object = await client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: media.storageKey,
      })
    );
  } catch {
    throw new AppError(
      "Unable to retrieve the original conversation image.",
      503,
      "PAID_CHAT_MEDIA_DOWNLOAD_FAILED"
    );
  }

  const metadata = object.Metadata || {};

  if (
    Number(object.ContentLength) !== media.fileSize ||
    object.ContentType !== media.mimeType ||
    metadata.mediaid !== String(media._id).toLowerCase() ||
    metadata.creatorid !== String(media.creatorId).toLowerCase() ||
    metadata.uploaderid !== String(media.uploaderId).toLowerCase()
  ) {
    throw new AppError(
      "The original conversation image failed storage verification.",
      422,
      "PAID_CHAT_MEDIA_METADATA_MISMATCH"
    );
  }

  const originalBuffer = await readObjectStream(
    object.Body,
    media.fileSize
  );

  await inspectImage(originalBuffer, media.mimeType);

  const previewBuffer = await generatePreview(originalBuffer);

  const previewStorageKey =
    `private/previews/${media.creatorId}/${media._id}/teaser-${crypto
      .createHash("sha256")
      .update(String(media._id))
      .digest("hex")
      .slice(0, 16)}.webp`;

  try {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: previewStorageKey,
        Body: previewBuffer,
        ContentLength: previewBuffer.length,
        ContentType: "image/webp",
        CacheControl: "private, no-store, max-age=0",
        Metadata: {
          mediaid: String(media._id),
          creatorid: String(media.creatorId),
          preview: "true",
        },
      })
    );
  } catch {
    throw new AppError(
      "Unable to store the blurred conversation preview.",
      503,
      "PAID_CHAT_PREVIEW_STORAGE_FAILED"
    );
  }

  // The lifecycle and missing-preview conditions are checked again
  // before saving, preventing an overwrite or stale-state update.
  const updatedMedia = await Media.findOneAndUpdate(
    mediaFilter,
    {
      $set: {
        previewStorageKey,
      },
    },
    {
      returnDocument: "after",
      runValidators: true,
    }
  ).select("_id previewStorageKey");

  if (!updatedMedia) {
    throw new AppError(
      "The paid conversation image changed while its preview was generated.",
      409,
      "PAID_CHAT_PREVIEW_STATE_CHANGED"
    );
  }

  return {
    mediaId: String(updatedMedia._id),
    previewGenerated: true,
    repaired: allowRepair,
  };
};



export default {
  processCreatorImage,
  generatePaidConversationPreview,
};
