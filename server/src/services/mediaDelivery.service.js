
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
  authorizeMediaAccess,
} from "./mediaAuthorization.service.js";

import {
  verifyConversationMembership,
} from "./conversation.service.js";

/**
 * ============================================================
 * PREMIUMCHAT — MEDIA DELIVERY SERVICE
 * ============================================================
 *
 * SECURITY:
 *
 * 1. Media must exist in MongoDB.
 * 2. Only approved and READY media can be delivered.
 * 3. Viewer authorization is mandatory.
 * 4. Conversation-linked media requires membership.
 * 5. Private storage keys never leave the backend.
 * 6. Signed URLs are short-lived and read-only.
 * 7. Unknown or failed authorization is denied.
 */

const DEFAULT_URL_TTL_SECONDS = 120;
const MAX_URL_TTL_SECONDS = 300;

const getDeliveryUrlTtl = () => {
  const configured = Number(
    process.env.MEDIA_DELIVERY_URL_TTL_SECONDS
  );

  if (
    !Number.isInteger(configured) ||
    configured < 60
  ) {
    return DEFAULT_URL_TTL_SECONDS;
  }

  return Math.min(
    configured,
    MAX_URL_TTL_SECONDS
  );
};

/**
 * ============================================================
 * CREATE AUTHORIZED MEDIA DELIVERY URL
 * ============================================================
 */

export const createMediaDeliveryUrl = async ({
  mediaId,
  viewerId,
}) => {
  /**
   * STEP 1 — VALIDATE REQUEST IDS
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
      "Invalid viewer ID.",
      401,
      "INVALID_VIEWER"
    );
  }

  /**
   * STEP 2 — LOAD MEDIA FROM DATABASE
   *
   * storageKey is private and must only be
   * selected internally by the backend.
   */

  const media = await Media.findById(mediaId)
    .select("+storageKey");

  if (!media) {
    throw new AppError(
      "Media not found.",
      404,
      "MEDIA_NOT_FOUND"
    );
  }

  /**
   * STEP 3 — AUTHORIZE MEDIA ACCESS
   */

  const authorization =
    await authorizeMediaAccess({
      viewerId,
      media,
    });

  if (!authorization.hasAccess) {
    throw new AppError(
      "You are not authorized to access this media.",
      403,
      authorization.reason || "MEDIA_ACCESS_DENIED"
    );
  }

  /**
   * STEP 4 — VERIFY CONVERSATION MEMBERSHIP
   *
   * Media linked to a conversation must only
   * be accessible to its active participants.
   *
   * This check applies even when the viewer
   * has a subscription to the creator.
   */

  if (media.conversationId) {
    await verifyConversationMembership({
      conversationId: String(media.conversationId),
      userId: String(viewerId),
      requireActive: true,
    });
  }

  /**
   * STEP 5 — VERIFY PRIVATE STORAGE KEY
   */

  if (
    typeof media.storageKey !== "string" ||
    !media.storageKey.trim()
  ) {
    throw new AppError(
      "Media storage object is unavailable.",
      503,
      "MEDIA_STORAGE_OBJECT_UNAVAILABLE"
    );
  }

  /**
   * STEP 6 — REQUIRE PRIVATE STORAGE
   */

  const {
    client,
    bucket,
  } = requireMediaStorage();

  /**
   * STEP 7 — GENERATE SHORT-LIVED READ URL
   *
   * GetObjectCommand only grants read access.
   * No upload or delete permission is included.
   */

  const expiresIn = getDeliveryUrlTtl();

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: media.storageKey,

    ResponseContentType: media.mimeType,

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
   * STEP 8 — RETURN SAFE DELIVERY INFORMATION
   *
   * Never return:
   * - storageKey
   * - previewStorageKey
   * - bucket credentials
   * - internal storage configuration
   */

  return {
    media: {
      id: String(media._id),
      mediaType: media.mediaType,
      mimeType: media.mimeType,
      fileSize: media.fileSize,
      accessPolicy: media.accessPolicy,
    },

    delivery: {
      url: signedUrl,
      expiresIn,
      accessType: authorization.accessType,
    },
  };
};

export default {
  createMediaDeliveryUrl,
};
