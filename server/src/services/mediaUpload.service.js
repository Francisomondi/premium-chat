
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

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const ALLOWED_VIDEO_MIME_TYPES = new Set([
  "video/mp4",
  "video/webm",
]);

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
 * Conversation access rules are server-enforced.
 *
 * CREATOR:
 * PURCHASE_ONLY + positive KES price.
 *
 * USER:
 * PUBLIC + zero KES price.
 *
 * Gallery uploads retain their existing configurable
 * creator access policies.
 */
const resolveUploadAccess = ({
  destination,
  isCreator,
  accessPolicy,
  priceMinor,
  currency,
}) => {
  if (destination !== "CONVERSATION") {
    return {
      accessPolicy,
      priceMinor,
      currency,
    };
  }

  if (currency !== "KES") {
    throw new AppError(
      "Conversation images must use KES.",
      400,
      "CHAT_MEDIA_CURRENCY_INVALID"
    );
  }

  if (isCreator) {
    if (
      accessPolicy !== MEDIA_ACCESS_POLICIES.PURCHASE_ONLY
    ) {
      throw new AppError(
        "Creator conversation images must use purchase-only access.",
        400,
        "CREATOR_CHAT_MEDIA_MUST_BE_PAID"
      );
    }

    if (
      !Number.isSafeInteger(priceMinor) ||
      priceMinor <= 0
    ) {
      throw new AppError(
        "Creator conversation images must have a positive KES price.",
        400,
        "CREATOR_CHAT_MEDIA_PRICE_REQUIRED"
      );
    }

    return {
      accessPolicy: MEDIA_ACCESS_POLICIES.PURCHASE_ONLY,
      priceMinor,
      currency: "KES",
    };
  }

  if (
    accessPolicy !== MEDIA_ACCESS_POLICIES.PUBLIC ||
    priceMinor !== 0
  ) {
    throw new AppError(
      "User conversation images must be free and publicly accessible.",
      403,
      "USER_CHAT_MEDIA_MUST_BE_FREE"
    );
  }

  return {
    accessPolicy: MEDIA_ACCESS_POLICIES.PUBLIC,
    priceMinor: 0,
    currency: "KES",
  };
};

export const createMediaUploadIntent = async ({
  uploaderId,
  destination = "CONVERSATION",
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
  validateObjectId(uploaderId, "uploader ID");

  const uploader = await User.findById(uploaderId)
    .select("_id role accountStatus")
    .lean();

  if (!uploader) {
    throw new AppError(
      "Account not found.",
      404,
      "ACCOUNT_NOT_FOUND"
    );
  }

  if (uploader.accountStatus !== ACCOUNT_STATUSES.ACTIVE) {
    throw new AppError(
      "This account is unavailable.",
      403,
      "ACCOUNT_UNAVAILABLE"
    );
  }

  const isCreator = uploader.role === ACCOUNT_ROLES.CREATOR;
  const isUser = uploader.role === ACCOUNT_ROLES.USER;

  if (!isCreator && !isUser) {
    throw new AppError(
      "This account cannot upload conversation media.",
      403,
      "MEDIA_UPLOAD_FORBIDDEN"
    );
  }

  if (!["CONVERSATION", "GALLERY"].includes(destination)) {
    throw new AppError(
      "Invalid media upload destination.",
      400,
      "INVALID_MEDIA_DESTINATION"
    );
  }

  if (isUser && destination !== "CONVERSATION") {
    throw new AppError(
      "Only creators can upload gallery media.",
      403,
      "GALLERY_UPLOAD_FORBIDDEN"
    );
  }

  let validatedConversationId = null;

  if (destination === "CONVERSATION") {
    validatedConversationId = validateObjectId(
      conversationId,
      "conversation ID"
    );
  }

  if (
    destination === "GALLERY" &&
    conversationId !== undefined &&
    conversationId !== null
  ) {
    throw new AppError(
      "Gallery uploads cannot be linked to a conversation.",
      400,
      "INVALID_GALLERY_CONVERSATION"
    );
  }

  validateUploadMetadata({
    mediaType,
    mimeType,
    fileSize,
  });

  // Video processing is not implemented yet.
  if (mediaType === MEDIA_TYPES.VIDEO) {
    throw new AppError(
      "Video uploads are temporarily unavailable.",
      501,
      "VIDEO_PROCESSING_UNAVAILABLE"
    );
  }

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

  let creatorId = null;

  if (isCreator) {
    await verifyEligibleCreator(uploaderId);
    creatorId = uploaderId;
  }

  if (destination === "CONVERSATION") {
    const conversation = await verifyConversationMembership({
      conversationId: validatedConversationId,
      userId: uploaderId,
      requireActive: true,
    });

    const conversationCreatorId = String(
      conversation.creatorId?._id ??
      conversation.creatorId
    );

    const conversationUserId = String(
      conversation.userId?._id ??
      conversation.userId
    );

    if (isCreator) {
      if (conversationCreatorId !== String(uploaderId)) {
        throw new AppError(
          "Only the creator who owns this conversation may upload its media.",
          403,
          "CONVERSATION_CREATOR_MISMATCH"
        );
      }
    } else {
      if (conversationUserId !== String(uploaderId)) {
        throw new AppError(
          "You can only upload media to your own conversation.",
          403,
          "CONVERSATION_USER_MISMATCH"
        );
      }

      creatorId = conversationCreatorId;
    }

    if (!mongoose.isValidObjectId(creatorId)) {
      throw new AppError(
        "The conversation creator is invalid.",
        409,
        "CONVERSATION_CREATOR_INVALID"
      );
    }
  }

  const resolvedAccess = resolveUploadAccess({
    destination,
    isCreator,
    accessPolicy,
    priceMinor,
    currency,
  });

  validateMediaPricing(resolvedAccess);

  const { client, bucket } = requireMediaStorage();

  const mediaId = new mongoose.Types.ObjectId();
  const randomToken = crypto.randomBytes(16).toString("hex");

  const extension =
    mimeType === "image/jpeg"
      ? "jpg"
      : mimeType.split("/")[1];

  const storageKey =
    `private/uploads/${uploaderId}/media/${mediaId}/${randomToken}.${extension}`;

  const uploadExpiresAt = new Date(
    Date.now() + MAX_PRESIGNED_URL_SECONDS * 1000
  );

  const media = await Media.create({
    _id: mediaId,

    uploaderId,
    creatorId,

    conversationId: validatedConversationId,

    mediaType,
    mimeType,
    fileSize,

    accessPolicy: resolvedAccess.accessPolicy,
    priceMinor: resolvedAccess.priceMinor,
    currency: resolvedAccess.currency,

    storageKey,

    status: MEDIA_STATUSES.UPLOADING,
    moderationStatus: MEDIA_MODERATION_STATUSES.PENDING,

    rightsConfirmed: true,
    allDepictedAdultsAndConsented: true,

    attestationVersion: attestationVersion.trim(),
    attestedAt: new Date(),

    uploadExpiresAt,
  });

  const mediaIdHeader = String(media._id);
  const creatorIdHeader = String(creatorId);
  const uploaderIdHeader = String(uploaderId);

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: storageKey,
    ContentType: mimeType,
    Metadata: {
      mediaid: mediaIdHeader,
      creatorid: creatorIdHeader,
      uploaderid: uploaderIdHeader,
    },
  });

  const uploadUrl = await getSignedUrl(
    client,
    command,
    {
      expiresIn: MAX_PRESIGNED_URL_SECONDS,

      unhoistableHeaders: new Set([
        "x-amz-meta-mediaid",
        "x-amz-meta-creatorid",
        "x-amz-meta-uploaderid",
      ]),

      signableHeaders: new Set([
        "content-type",
        "x-amz-meta-mediaid",
        "x-amz-meta-creatorid",
        "x-amz-meta-uploaderid",
      ]),
    }
  );

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
        "x-amz-meta-mediaid": String(media._id),
        "x-amz-meta-creatorid": String(creatorId),
        "x-amz-meta-uploaderid": String(uploaderId),
      },
    },
  };
};
