import mongoose from "mongoose";

import Media, {
  MEDIA_STATUSES,
  MEDIA_MODERATION_STATUSES,
} from "../models/Media.model.js";

import {
  MEDIA_ACCESS_POLICIES,
} from "../constants/mediaAccess.constants.js";

import {
  requireMediaStorage,
} from "../config/mediaStorage.js";

import {
  GetObjectCommand,
} from "@aws-sdk/client-s3";

import {
  getSignedUrl,
} from "@aws-sdk/s3-request-presigner";


const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 48;
const MAX_PAGE = 10000;

const SIGNED_URL_EXPIRY_SECONDS = 60;


/**
 * ============================================================
 * PAGINATION
 * ============================================================
 */

const normalizePositiveInteger = (
  value,
  fallback,
  maximum
) => {
  const parsed = Number(value);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 1
  ) {
    return fallback;
  }

  return Math.min(parsed, maximum);
};


/**
 * ============================================================
 * CREATOR IMAGE URL
 * ============================================================
 *
 * PUBLIC APPROVED MEDIA:
 * - Original image.
 *
 * PRIVATE OR PENDING MEDIA:
 * - Blurred preview only.
 *
 * REJECTED OR UNAVAILABLE MEDIA:
 * - No image URL.
 *
 * Signed URLs expire after 60 seconds.
 */

/**
 * ============================================================
 * CREATOR IMAGE URL
 * ============================================================
 *
 * PUBLIC APPROVED MEDIA:
 * - Original image.
 *
 * PRIVATE OR PENDING MEDIA:
 * - Blurred WebP preview only.
 *
 * REJECTED, FAILED OR UNAVAILABLE MEDIA:
 * - No image URL.
 *
 * Signed URLs expire after 60 seconds.
 */

const getManagementImageUrl = async (media) => {
  if (media.mediaType !== "IMAGE") {
    return null;
  }

  /**
   * Never expose rejected or failed media.
   */

  if (
    media.status === MEDIA_STATUSES.FAILED ||
    media.status === MEDIA_STATUSES.DELETED ||
    media.moderationStatus ===
      MEDIA_MODERATION_STATUSES.REJECTED
  ) {
    return null;
  }

  /**
   * Only approved, ready, public media
   * may use the original image.
   */

  const canUseOriginal =
    media.status === MEDIA_STATUSES.READY &&
    media.moderationStatus ===
      MEDIA_MODERATION_STATUSES.APPROVED &&
    media.accessPolicy ===
      MEDIA_ACCESS_POLICIES.PUBLIC;

  /**
   * Previews are available once processing
   * has started and the preview key exists.
   */

  const canUsePreview = [
    MEDIA_STATUSES.PROCESSING,
    MEDIA_STATUSES.READY,
  ].includes(media.status);

  if (!canUseOriginal && !canUsePreview) {
    return null;
  }

  const storageKey = canUseOriginal
    ? media.storageKey
    : media.previewStorageKey;

  if (!storageKey) {
    return null;
  }

  const storage = requireMediaStorage();

  /**
   * Generated previews are always WebP.
   * Original images retain their verified MIME type.
   */

  const responseContentType = canUseOriginal
    ? media.mimeType
    : "image/webp";

  const command = new GetObjectCommand({
    Bucket: storage.bucket,
    Key: storageKey,

    ResponseCacheControl:
      "private, no-store, max-age=0",

    ResponseContentType: responseContentType,
  });

  return getSignedUrl(
    storage.client,
    command,
    {
      expiresIn: SIGNED_URL_EXPIRY_SECONDS,
    }
  );
};


/**
 * ============================================================
 * FORMAT CREATOR MEDIA
 * ============================================================
 */

const formatCreatorMedia = async (media) => {
  const isApproved =
    media.status === MEDIA_STATUSES.READY &&
    media.moderationStatus ===
      MEDIA_MODERATION_STATUSES.APPROVED;

  const isPending =
    media.moderationStatus ===
    MEDIA_MODERATION_STATUSES.PENDING;

  const isPublic =
    media.accessPolicy ===
    MEDIA_ACCESS_POLICIES.PUBLIC;

  let visibility = "UNAVAILABLE";

  if (media.status === MEDIA_STATUSES.UPLOADING) {
    visibility = "UPLOADING";
  } else if (
    media.status === MEDIA_STATUSES.PROCESSING
  ) {
    visibility = "PROCESSING";
  } else if (
    media.status === MEDIA_STATUSES.FAILED
  ) {
    visibility = "FAILED";
  } else if (
    media.moderationStatus ===
    MEDIA_MODERATION_STATUSES.REJECTED
  ) {
    visibility = "REJECTED";
  } else if (isPending) {
    visibility = "PENDING";
  } else if (isApproved && isPublic) {
    visibility = "PUBLIC";
  } else if (isApproved) {
    visibility = "LOCKED";
  }

  return {
    id: media._id.toString(),

    mediaType: media.mediaType,

    mimeType: media.mimeType,

    fileSize: media.fileSize,

    accessPolicy: media.accessPolicy,

    priceMinor: media.priceMinor,

    currency: media.currency,

    status: media.status,

    moderationStatus: media.moderationStatus,

    visibility,

    isPublic: isApproved && isPublic,

    isLocked: isApproved && !isPublic,

    isPending,

    imageUrl: await getManagementImageUrl(media),

    createdAt: media.createdAt,

    updatedAt: media.updatedAt,
  };
};


/**
 * ============================================================
 * GET CREATOR'S OWN MEDIA
 * ============================================================
 *
 * The creator ID comes from the authenticated session.
 * The caller cannot request another creator's gallery.
 */

export const getCreatorManagedMedia = async ({
  creatorId,
  page = 1,
  limit = DEFAULT_LIMIT,
} = {}) => {
  if (
    !mongoose.isObjectIdOrHexString(creatorId)
  ) {
    const error = new Error(
      "A valid creator ID is required."
    );

    error.statusCode = 400;
    error.code = "INVALID_CREATOR_ID";

    throw error;
  }

  const safePage = normalizePositiveInteger(
    page,
    1,
    MAX_PAGE
  );

  const safeLimit = normalizePositiveInteger(
    limit,
    DEFAULT_LIMIT,
    MAX_LIMIT
  );

  const skip = (safePage - 1) * safeLimit;

  const filter = {
    creatorId: new mongoose.Types.ObjectId(
      creatorId
    ),

    conversationId: null,

    deletedAt: null,

    status: {
      $ne: MEDIA_STATUSES.DELETED,
    },
  };

  const [media, total] = await Promise.all([
    Media.find(filter)
      .select(
        [
          "_id",
          "mediaType",
          "mimeType",
          "fileSize",
          "accessPolicy",
          "priceMinor",
          "currency",
          "status",
          "moderationStatus",
          "createdAt",
          "updatedAt",
        ].join(" ")
      )
      .select(
        "+storageKey +previewStorageKey"
      )
      .sort({
        createdAt: -1,
        _id: -1,
      })
      .skip(skip)
      .limit(safeLimit)
      .lean(),

    Media.countDocuments(filter),
  ]);

  const formattedMedia = await Promise.all(
    media.map(formatCreatorMedia)
  );

  return {
    media: formattedMedia,

    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit),
      hasNextPage: safePage * safeLimit < total,
      hasPreviousPage: safePage > 1,
    },
  };
};