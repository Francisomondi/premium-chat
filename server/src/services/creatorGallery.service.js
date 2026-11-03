import mongoose from "mongoose";

import Media, {
  MEDIA_STATUSES,
  MEDIA_MODERATION_STATUSES,
} from "../models/Media.model.js";

import {
  getPublicCreatorById,
} from "./creatorDiscovery.service.js";

/**
 * ============================================================
 * PREMIUMCHAT — PUBLIC CREATOR GALLERY SERVICE
 * ============================================================
 *
 * Returns only media that has completed processing
 * and passed moderation.
 *
 * Private storage keys and delivery URLs are never returned.
 */

/**
 * ============================================================
 * PAGINATION
 * ============================================================
 */

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 48;
const MAX_PAGE = 10000;

const normalizePositiveInteger = (
  value,
  fallback,
  maximum
) => {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return fallback;
  }

  const number = Number(value);

  if (
    !Number.isSafeInteger(number) ||
    number < 1
  ) {
    return fallback;
  }

  return Math.min(number, maximum);
};

/**
 * ============================================================
 * SAFE PUBLIC MEDIA FORMAT
 * ============================================================
 */

const formatPublicGalleryMedia = (media) => ({
  id: media._id.toString(),

  mediaType: media.mediaType,

  createdAt: media.createdAt || null,
});

/**
 * ============================================================
 * GET PUBLIC CREATOR GALLERY
 * ============================================================
 */

export const getPublicCreatorGallery = async ({
  creatorId,
  page = 1,
  limit = DEFAULT_LIMIT,
} = {}) => {
  if (
    !mongoose.isObjectIdOrHexString(creatorId)
  ) {
    return null;
  }

  // Reuse the existing public eligibility check.
  const creator = await getPublicCreatorById(
    creatorId
  );

  if (!creator) {
    return null;
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

  const filter = {
    creatorId: new mongoose.Types.ObjectId(
      creatorId
    ),

    conversationId: null,

    status: MEDIA_STATUSES.READY,

    moderationStatus:
      MEDIA_MODERATION_STATUSES.APPROVED,

    deletedAt: null,
  };

  const skip = (safePage - 1) * safeLimit;

  const [media, total] = await Promise.all([
    Media.find(filter)
      .select(
        "_id mediaType createdAt"
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

  const totalPages = Math.ceil(
    total / safeLimit
  );

  return {
    creator,

    media: media.map(
      formatPublicGalleryMedia
    ),

    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages,
      hasNextPage: safePage < totalPages,
      hasPreviousPage: safePage > 1,
    },
  };
};