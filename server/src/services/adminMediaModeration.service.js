
import mongoose from "mongoose";

import Media, {
  MEDIA_STATUSES,
  MEDIA_MODERATION_STATUSES,
} from "../models/Media.model.js";

import AppError from "../utils/AppError.js";

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

const isValidObjectId = (value) =>
  mongoose.Types.ObjectId.isValid(value);

const normalizePagination = ({ page = DEFAULT_PAGE, limit = DEFAULT_LIMIT }) => {
  const parsedPage = Number.parseInt(page, 10);
  const parsedLimit = Number.parseInt(limit, 10);

  return {
    page:
      Number.isSafeInteger(parsedPage) && parsedPage > 0
        ? parsedPage
        : DEFAULT_PAGE,

    limit:
      Number.isSafeInteger(parsedLimit) && parsedLimit > 0
        ? Math.min(parsedLimit, MAX_LIMIT)
        : DEFAULT_LIMIT,
  };
};

/**
 * List legacy or exceptional gallery media awaiting
 * administrative moderation.
 */
export const getPendingMediaForModeration = async ({
  page = DEFAULT_PAGE,
  limit = DEFAULT_LIMIT,
} = {}) => {
  const pagination = normalizePagination({ page, limit });

  const filter = {
    conversationId: null,
    status: MEDIA_STATUSES.READY,
    moderationStatus: MEDIA_MODERATION_STATUSES.PENDING,
    deletedAt: null,
  };

  const skip = (pagination.page - 1) * pagination.limit;

  const [media, total] = await Promise.all([
    Media.find(filter)
      .select(
        "_id creatorId mediaType mimeType fileSize accessPolicy priceMinor currency status moderationStatus createdAt previewStorageKey"
      )
      .sort({ createdAt: 1, _id: 1 })
      .skip(skip)
      .limit(pagination.limit)
      .lean(),

    Media.countDocuments(filter),
  ]);

  const totalPages = Math.ceil(total / pagination.limit);

  return {
    media: media.map((item) => ({
      id: String(item._id),
      creatorId: String(item.creatorId),
      mediaType: item.mediaType,
      mimeType: item.mimeType,
      fileSize: item.fileSize,
      accessPolicy: item.accessPolicy,
      priceMinor: item.priceMinor,
      currency: item.currency,
      status: item.status,
      moderationStatus: item.moderationStatus,
      createdAt: item.createdAt,
      hasPreview: Boolean(item.previewStorageKey),
    })),

    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      total,
      totalPages,
      hasNextPage: pagination.page < totalPages,
      hasPreviousPage: pagination.page > 1,
    },
  };
};

/**
 * Approve or reject one gallery media item.
 *
 * Only READY + PENDING media can be moderated.
 */
const moderateMedia = async ({
  mediaId,
  adminId,
  moderationStatus,
}) => {
  if (!isValidObjectId(mediaId)) {
    throw new AppError(
      "A valid media ID is required.",
      400,
      "INVALID_MEDIA_ID"
    );
  }

  if (!isValidObjectId(adminId)) {
    throw new AppError(
      "A valid admin ID is required.",
      400,
      "INVALID_ADMIN_ID"
    );
  }

  const allowedStatuses = [
    MEDIA_MODERATION_STATUSES.APPROVED,
    MEDIA_MODERATION_STATUSES.REJECTED,
  ];

  if (!allowedStatuses.includes(moderationStatus)) {
    throw new AppError(
      "Invalid moderation action.",
      400,
      "INVALID_MODERATION_ACTION"
    );
  }

  const updatedMedia = await Media.findOneAndUpdate(
    {
      _id: mediaId,
      conversationId: null,
      status: MEDIA_STATUSES.READY,
      moderationStatus: MEDIA_MODERATION_STATUSES.PENDING,
      deletedAt: null,
    },
    {
      $set: {
        moderationStatus,
        moderatedAt: new Date(),
        moderatedBy: new mongoose.Types.ObjectId(adminId),
      },
    },
    {
      returnDocument: "after",
      runValidators: true,
    }
  )
    .select("_id creatorId mediaType status moderationStatus moderatedAt moderatedBy")
    .lean();

  if (!updatedMedia) {
    throw new AppError(
      "Media was not found, is not ready for review, or has already been moderated.",
      409,
      "MEDIA_NOT_AVAILABLE_FOR_MODERATION"
    );
  }

  return {
    id: String(updatedMedia._id),
    creatorId: String(updatedMedia.creatorId),
    mediaType: updatedMedia.mediaType,
    status: updatedMedia.status,
    moderationStatus: updatedMedia.moderationStatus,
    moderatedAt: updatedMedia.moderatedAt,
    moderatedBy: String(updatedMedia.moderatedBy),
  };
};

/**
 * Approve gallery media.
 */
export const approveGalleryMedia = async ({ mediaId, adminId }) => {
  return moderateMedia({
    mediaId,
    adminId,
    moderationStatus: MEDIA_MODERATION_STATUSES.APPROVED,
  });
};

/**
 * Reject gallery media.
 */
export const rejectGalleryMedia = async ({ mediaId, adminId }) => {
  return moderateMedia({
    mediaId,
    adminId,
    moderationStatus: MEDIA_MODERATION_STATUSES.REJECTED,
  });
};
