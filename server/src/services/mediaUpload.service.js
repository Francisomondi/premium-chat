
import crypto from "node:crypto";
import mongoose from "mongoose";

import {
  PutObjectCommand,
} from "@aws-sdk/client-s3";

import {
  getSignedUrl,
} from "@aws-sdk/s3-request-presigner";

import Media, {
  MEDIA_TYPES,
  MEDIA_STATUSES,
  MEDIA_MODERATION_STATUSES,
} from "../models/Media.model.js";

import User from "../models/User.model.js";

import AppError from "../utils/AppError.js";

import {
  ACCOUNT_ROLES,
  ACCOUNT_STATUSES,
  AGE_VERIFICATION_STATUSES,
  CREATOR_APPLICATION_STATUSES,
} from "../constants/account.constants.js";

import {
  MEDIA_ACCESS_POLICIES,
} from "../constants/mediaAccess.constants.js";

import {
  verifyConversationMembership,
} from "./conversation.service.js";

import {
  requireMediaStorage,
} from "../config/mediaStorage.js";

/**
 * ============================================================
 * PREMIUMCHAT — MEDIA UPLOAD SERVICE
 * ============================================================
 *
 * Creates short-lived presigned R2 upload URLs.
 *
 * SECURITY:
 * - Never accepts a client-provided R2 object key.
 * - Never exposes R2 credentials.
 * - Requires an eligible creator.
 * - Requires an active conversation owned by that creator.
 * - Creates media as UPLOADING and PENDING moderation.
 * - Upload completion does not grant viewing access.
 */

/**
 * ============================================================
 * UPLOAD LIMITS
 * ============================================================
 */

const DEFAULT_MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const DEFAULT_MAX_VIDEO_BYTES = 200 * 1024 * 1024;

const MAX_PRESIGNED_URL_SECONDS = 5 * 60;

const getPositiveIntegerEnv = (name, fallback) => {
  const value = Number(process.env[name]);

  return Number.isSafeInteger(value) && value > 0
    ? value
    : fallback;
};

const MAX_IMAGE_BYTES = getPositiveIntegerEnv(
  "MEDIA_MAX_IMAGE_BYTES",
  DEFAULT_MAX_IMAGE_BYTES
);

const MAX_VIDEO_BYTES = getPositiveIntegerEnv(
  "MEDIA_MAX_VIDEO_BYTES",
  DEFAULT_MAX_VIDEO_BYTES
);

/**
 * ============================================================
 * ALLOWED MIME TYPES
 * ============================================================
 *
 * These are initial allowlists.
 * Actual file bytes must be checked after upload
 * before media can be processed or approved.
 */

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const ALLOWED_VIDEO_MIME_TYPES = new Set([
  "video/mp4",
  "video/webm",
]);

/**
 * ============================================================
 * VALIDATE OBJECT ID
 * ============================================================
 */

const validateObjectId = (value, fieldName) => {
  if (
    typeof value !== "string" ||
    !mongoose.isValidObjectId(value)
  ) {
    throw new AppError(
      `Invalid ${fieldName}.`,
      400,
      "INVALID_OBJECT_ID"
    );
  }

  return value;
};

/**
 * ============================================================
 * VERIFY ELIGIBLE CREATOR
 * ============================================================
 */

const verifyEligibleCreator = async (creatorId) => {
  const creator = await User.findById(creatorId)
    .select(
      "_id role accountStatus creatorApplication ageVerification"
    )
    .lean();

  if (!creator) {
    throw new AppError(
      "Creator account not found.",
      404,
      "CREATOR_NOT_FOUND"
    );
  }

  if (creator.accountStatus !== ACCOUNT_STATUSES.ACTIVE) {
    throw new AppError(
      "This account is unavailable.",
      403,
      "ACCOUNT_UNAVAILABLE"
    );
  }

  if (creator.role !== ACCOUNT_ROLES.CREATOR) {
    throw new AppError(
      "Only creator accounts can upload media.",
      403,
      "NOT_A_CREATOR"
    );
  }

  if (
    creator.creatorApplication?.status !==
    CREATOR_APPLICATION_STATUSES.APPROVED
  ) {
    throw new AppError(
      "Creator approval is required.",
      403,
      "CREATOR_NOT_APPROVED"
    );
  }

  if (
    creator.ageVerification?.status !==
      AGE_VERIFICATION_STATUSES.VERIFIED ||
    !creator.ageVerification?.verifiedAt
  ) {
    throw new AppError(
      "Current age verification is required.",
      403,
      "CREATOR_NOT_VERIFIED"
    );
  }

  if (
    creator.ageVerification?.expiresAt &&
    new Date(creator.ageVerification.expiresAt) <= new Date()
  ) {
    throw new AppError(
      "Age verification has expired.",
      403,
      "CREATOR_VERIFICATION_EXPIRED"
    );
  }

  return creator;
};

/**
 * ============================================================
 * VALIDATE FILE METADATA
 * ============================================================
 */

const validateUploadMetadata = ({
  mediaType,
  mimeType,
  fileSize,
}) => {
  if (!Object.values(MEDIA_TYPES).includes(mediaType)) {
    throw new AppError(
      "Unsupported media type.",
      400,
      "INVALID_MEDIA_TYPE"
    );
  }

  if (
    typeof mimeType !== "string" ||
    mimeType !== mimeType.trim().toLowerCase()
  ) {
    throw new AppError(
      "A normalized MIME type is required.",
      400,
      "INVALID_MIME_TYPE"
    );
  }

  if (
    !Number.isSafeInteger(fileSize) ||
    fileSize <= 0
  ) {
    throw new AppError(
      "File size must be a positive integer.",
      400,
      "INVALID_FILE_SIZE"
    );
  }

  if (mediaType === MEDIA_TYPES.IMAGE) {
    if (!ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
      throw new AppError(
        "This image format is not supported.",
        400,
        "UNSUPPORTED_IMAGE_FORMAT"
      );
    }

    if (fileSize > MAX_IMAGE_BYTES) {
      throw new AppError(
        `Images must not exceed ${MAX_IMAGE_BYTES} bytes.`,
        413,
        "IMAGE_TOO_LARGE"
      );
    }
  }

  if (mediaType === MEDIA_TYPES.VIDEO) {
    if (!ALLOWED_VIDEO_MIME_TYPES.has(mimeType)) {
      throw new AppError(
        "This video format is not supported.",
        400,
        "UNSUPPORTED_VIDEO_FORMAT"
      );
    }

    if (fileSize > MAX_VIDEO_BYTES) {
      throw new AppError(
        `Videos must not exceed ${MAX_VIDEO_BYTES} bytes.`,
        413,
        "VIDEO_TOO_LARGE"
      );
    }
  }
};

/**
 * ============================================================
 * VALIDATE ACCESS POLICY AND PRICING
 * ============================================================
 */

const validateMediaPricing = ({
  accessPolicy,
  priceMinor,
  currency,
}) => {
  const validAccessPolicies = Object.values(
    MEDIA_ACCESS_POLICIES
  );

  if (!validAccessPolicies.includes(accessPolicy)) {
    throw new AppError(
      "Invalid media access policy.",
      400,
      "INVALID_MEDIA_ACCESS_POLICY"
    );
  }

  if (!["KES", "USD"].includes(currency)) {
    throw new AppError(
      "Unsupported media currency.",
      400,
      "INVALID_MEDIA_CURRENCY"
    );
  }

  if (
    !Number.isSafeInteger(priceMinor) ||
    priceMinor < 0
  ) {
    throw new AppError(
      "Media price must be a non-negative integer.",
      400,
      "INVALID_MEDIA_PRICE"
    );
  }

  const requiresPurchase =
    accessPolicy === MEDIA_ACCESS_POLICIES.PURCHASE_ONLY ||
    accessPolicy ===
      MEDIA_ACCESS_POLICIES.SUBSCRIPTION_OR_PURCHASE;

  if (requiresPurchase && priceMinor <= 0) {
    throw new AppError(
      "Purchase-enabled media must have a positive price.",
      400,
      "MEDIA_PRICE_REQUIRED"
    );
  }

  if (!requiresPurchase && priceMinor !== 0) {
    throw new AppError(
      "Media without purchase access must have a zero price.",
      400,
      "MEDIA_PRICE_NOT_ALLOWED"
    );
  }
};

/**
 * ============================================================
 * CREATE UPLOAD INTENT
 * ============================================================
 */

export const createMediaUploadIntent = async ({
  creatorId,
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
}) => {
  /**
   * STEP 1:
   * Validate identifiers.
   */

  validateObjectId(creatorId, "creator ID");
  validateObjectId(conversationId, "conversation ID");

  /**
   * STEP 2:
   * Validate file metadata.
   */

  validateUploadMetadata({
    mediaType,
    mimeType,
    fileSize,
  });

  /**
   * STEP 2.1:
   * Validate access policy and pricing.
   */

  validateMediaPricing({
    accessPolicy,
    priceMinor,
    currency,
  });

  /**
   * STEP 3:
   * Require creator attestations.
   */

  if (
    rightsConfirmed !== true ||
    allDepictedAdultsAndConsented !== true
  ) {
    throw new AppError(
      "Required rights, adult-status and consent confirmations are missing.",
      400,
      "MEDIA_ATTESTATION_REQUIRED"
    );
  }

  if (
    typeof attestationVersion !== "string" ||
    attestationVersion.trim().length < 1 ||
    attestationVersion.trim().length > 30
  ) {
    throw new AppError(
      "A valid attestation version is required.",
      400,
      "INVALID_ATTESTATION_VERSION"
    );
  }

  /**
   * STEP 4:
   * Verify creator eligibility from MongoDB.
   */

  await verifyEligibleCreator(creatorId);

  /**
   * STEP 5:
   * Verify conversation membership and status.
   */

  const conversation = await verifyConversationMembership({
    conversationId,
    userId: creatorId,
    requireActive: true,
  });

  /**
   * STEP 6:
   * Ensure this creator owns the conversation.
   */

  const conversationCreatorId = String(
    conversation.creatorId?._id ??
      conversation.creatorId
  );

  if (conversationCreatorId !== String(creatorId)) {
    throw new AppError(
      "Only the creator who owns this conversation may upload its media.",
      403,
      "CONVERSATION_CREATOR_MISMATCH"
    );
  }

  /**
   * STEP 7:
   * Require private R2 storage.
   */

  const {
    client,
    bucket,
  } = requireMediaStorage();

  /**
   * STEP 8:
   * Generate a server-controlled object key.
   */

  const mediaId = new mongoose.Types.ObjectId();

  const randomToken = crypto.randomBytes(16).toString("hex");

  const extension =
    mimeType === "image/jpeg"
      ? "jpg"
      : mimeType.split("/")[1];

  const storageKey =
    `private/creators/${creatorId}/media/${mediaId}/${randomToken}.${extension}`;

  /**
   * STEP 9:
   * Create a private media record.
   *
   * The record is not READY and is not approved.
   */

  const uploadExpiresAt = new Date(
    Date.now() + MAX_PRESIGNED_URL_SECONDS * 1000
  );

  const media = await Media.create({
    _id: mediaId,

    creatorId,

    conversationId,

    mediaType,

    mimeType,

    fileSize,

    accessPolicy,

    priceMinor,

    currency,

    storageKey,

    status: MEDIA_STATUSES.UPLOADING,

    moderationStatus: MEDIA_MODERATION_STATUSES.PENDING,

    rightsConfirmed: true,

    allDepictedAdultsAndConsented: true,

    attestationVersion: attestationVersion.trim(),

    attestedAt: new Date(),

    uploadExpiresAt,
  });

  /**
   * STEP 10:
   * Generate a short-lived signed PUT URL.
   */

  const command = new PutObjectCommand({
    Bucket: bucket,

    Key: storageKey,

    ContentType: mimeType,

    Metadata: {
      mediaid: String(media._id),
      creatorid: String(creatorId),
    },
  });

  const uploadUrl = await getSignedUrl(
    client,
    command,
    {
      expiresIn: MAX_PRESIGNED_URL_SECONDS,
    }
  );

  /**
   * STEP 11:
   * Return only safe upload information.
   *
   * Never return storageKey or credentials.
   */

  return {
    media: {
      id: String(media._id),
      mediaType: media.mediaType,
      mimeType: media.mimeType,
      fileSize: media.fileSize,
      accessPolicy: media.accessPolicy,
      priceMinor: media.priceMinor,
      currency: media.currency,
      status: media.status,
      moderationStatus: media.moderationStatus,
      uploadExpiresAt: media.uploadExpiresAt,
    },

    upload: {
      method: "PUT",
      url: uploadUrl,
      expiresInSeconds: MAX_PRESIGNED_URL_SECONDS,
      requiredHeaders: {
        "Content-Type": mimeType,
      },
    },
  };
};
