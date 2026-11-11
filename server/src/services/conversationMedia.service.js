import mongoose from "mongoose";

import Media from "../models/Media.model.js";

import {
  verifyConversationMembership,
} from "./conversation.service.js";

import {
  requireMediaStorage,
} from "../config/mediaStorage.js";

import {
  GetObjectCommand,
} from "@aws-sdk/client-s3";

import {
  getSignedUrl,
} from "@aws-sdk/s3-request-presigner";

import AppError from "../utils/AppError.js";

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 48;
const SIGNED_URL_EXPIRY_SECONDS = 60;

export const getMyConversationMedia = async ({
  conversationId,
  userId,
  page = 1,
  limit = DEFAULT_LIMIT,
} = {}) => {
  if (
    !mongoose.isObjectIdOrHexString(conversationId) ||
    !mongoose.isObjectIdOrHexString(userId)
  ) {
    throw new AppError(
      "Invalid conversation or user ID.",
      400,
      "INVALID_ID"
    );
  }

  const safePage = Math.max(
    1,
    Number.parseInt(page, 10) || 1
  );

  const safeLimit = Math.min(
    MAX_LIMIT,
    Math.max(
      1,
      Number.parseInt(limit, 10) || DEFAULT_LIMIT
    )
  );

  // Verify the authenticated user belongs to this
  // active conversation.
  const conversation = await verifyConversationMembership({
    conversationId,
    userId,
    requireActive: true,
  });

  // Only this user's own approved, free conversation
  // images can appear in this list.
  const filter = {
    uploaderId: new mongoose.Types.ObjectId(userId),

    conversationId: new mongoose.Types.ObjectId(
      conversationId
    ),

    creatorId: conversation.creatorId,

    mediaType: "IMAGE",

    accessPolicy: "PUBLIC",

    priceMinor: 0,

    status: "READY",

    moderationStatus: "APPROVED",

    deletedAt: null,
  };

  const skip = (safePage - 1) * safeLimit;

  const [items, total] = await Promise.all([
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
        ].join(" ")
      )
      .select("+storageKey")
      .sort({
        createdAt: -1,
        _id: -1,
      })
      .skip(skip)
      .limit(safeLimit)
      .lean(),

    Media.countDocuments(filter),
  ]);

  const storage = requireMediaStorage();

  const media = await Promise.all(
    items.map(async (item) => {
      if (!item.storageKey) {
        return null;
      }

      const command = new GetObjectCommand({
        Bucket: storage.bucket,
        Key: item.storageKey,

        ResponseCacheControl:
          "private, no-store, max-age=0",

        ResponseContentType: item.mimeType,
      });

      const imageUrl = await getSignedUrl(
        storage.client,
        command,
        {
          expiresIn: SIGNED_URL_EXPIRY_SECONDS,
        }
      );

      return {
        id: item._id.toString(),
        mediaType: item.mediaType,
        mimeType: item.mimeType,
        fileSize: item.fileSize,
        accessPolicy: item.accessPolicy,
        priceMinor: 0,
        currency: item.currency,
        status: item.status,
        moderationStatus: item.moderationStatus,
        visibility: "PUBLIC",
        isLocked: false,
        imageUrl,
        createdAt: item.createdAt,
      };
    })
  );

  return {
    media: media.filter(Boolean),

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