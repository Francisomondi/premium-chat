import mongoose from "mongoose";

import User from "../models/User.model.js";

import CreatorMonetization from "../models/CreatorMonetization.model.js";

import AppError from "../utils/AppError.js";

import {
  ACCOUNT_ROLES,
  ACCOUNT_STATUSES,
  AGE_VERIFICATION_STATUSES,
  CREATOR_APPLICATION_STATUSES,
} from "../constants/account.constants.js";

/**
 * ============================================================
 * PREMIUMCHAT — ADMIN CREATOR PROFILE SERVICE
 * ============================================================
 *
 * Administrator-only creator profile retrieval.
 *
 * Includes:
 *
 * - Creator account information
 * - Creator application status
 * - Age verification status
 * - Monetization configuration
 *
 * Sensitive authentication information is excluded.
 */

const MAX_LIMIT = 100;

/**
 * VERIFY ACTIVE ADMIN
 */
const assertActiveAdmin = async (adminId) => {
  if (!mongoose.isValidObjectId(adminId)) {
    throw new AppError(
      "Invalid administrator identity.",
      401,
      "INVALID_ADMIN"
    );
  }

  const admin = await User.findById(adminId)
    .select("_id role accountStatus")
    .lean();

  if (
    !admin ||
    admin.role !== ACCOUNT_ROLES.ADMIN ||
    admin.accountStatus !== ACCOUNT_STATUSES.ACTIVE
  ) {
    throw new AppError(
      "Administrator access required.",
      403,
      "ADMIN_ACCESS_DENIED"
    );
  }
};

/**
 * CHECK PUBLIC CREATOR ELIGIBILITY
 */
const isPubliclyEligible = (creator) => {
  const verification = creator.ageVerification;

  return (
    creator.role === ACCOUNT_ROLES.CREATOR &&
    creator.accountStatus === ACCOUNT_STATUSES.ACTIVE &&
    creator.creatorApplication?.status ===
      CREATOR_APPLICATION_STATUSES.APPROVED &&
    verification?.status ===
      AGE_VERIFICATION_STATUSES.VERIFIED &&
    verification?.verifiedAt instanceof Date &&
    (!verification.expiresAt ||
      verification.expiresAt > new Date())
  );
};

/**
 * FORMAT CREATOR PROFILE
 */
const formatCreatorProfile = (
  creator,
  monetization = null
) => ({
  creatorId: creator._id.toString(),

  displayName: creator.displayName,

  email: creator.email,

  avatarUrl: creator.avatarUrl ?? null,

  role: creator.role,

  accountStatus: creator.accountStatus,

  joinedAt: creator.createdAt ?? null,

  application: {
    status:
      creator.creatorApplication?.status ?? null,

    motivation:
      creator.creatorApplication?.motivation ?? null,

    appliedAt:
      creator.creatorApplication?.appliedAt ?? null,

    reviewedAt:
      creator.creatorApplication?.reviewedAt ?? null,

    reviewedBy:
      creator.creatorApplication?.reviewedBy?.toString() ??
      null,
  },

  ageVerification: {
    status:
      creator.ageVerification?.status ?? null,

    verifiedAt:
      creator.ageVerification?.verifiedAt ?? null,

    expiresAt:
      creator.ageVerification?.expiresAt ?? null,
  },

  isPubliclyDiscoverable:
    isPubliclyEligible(creator),

  monetization: monetization
    ? {
        configured: true,

        isEnabled: monetization.isEnabled,

        currency: monetization.currency,

        subscription: {
          isEnabled:
            monetization.subscription?.isEnabled ??
            false,

          monthlyPriceMinor:
            monetization.subscription?.monthlyPriceMinor ??
            0,
        },

        paidMedia: {
          isEnabled:
            monetization.paidMedia?.isEnabled ??
            false,
        },

        paidMessaging: {
          isEnabled:
            monetization.paidMessaging?.isEnabled ??
            false,
        },

        tips: {
          isEnabled:
            monetization.tips?.isEnabled ?? false,
        },
      }
    : {
        configured: false,
      },
});

/**
 * ============================================================
 * LIST APPROVED CREATOR PROFILES
 * ============================================================
 */
export const listAdminCreatorProfiles = async ({
  adminId,
  page = 1,
  limit = 20,
}) => {
  await assertActiveAdmin(adminId);

  const pageNumber = Number(page);
  const pageSize = Number(limit);

  if (
    !Number.isSafeInteger(pageNumber) ||
    pageNumber < 1 ||
    !Number.isSafeInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > MAX_LIMIT
  ) {
    throw new AppError(
      "Invalid pagination parameters.",
      400,
      "INVALID_PAGINATION"
    );
  }

  const skip = (pageNumber - 1) * pageSize;

  if (!Number.isSafeInteger(skip)) {
    throw new AppError(
      "Invalid pagination parameters.",
      400,
      "INVALID_PAGINATION"
    );
  }

  const filter = {
    role: ACCOUNT_ROLES.CREATOR,

    "creatorApplication.status":
      CREATOR_APPLICATION_STATUSES.APPROVED,
  };

  const [creators, total] = await Promise.all([
    User.find(filter)
      .select(
        "_id displayName email avatarUrl role accountStatus createdAt creatorApplication ageVerification"
      )
      .sort({
        createdAt: -1,
        _id: -1,
      })
      .skip(skip)
      .limit(pageSize)
      .lean(),

    User.countDocuments(filter),
  ]);

  const creatorIds = creators.map(
    (creator) => creator._id
  );

  const monetizationRecords =
    creatorIds.length > 0
      ? await CreatorMonetization.find({
          creatorId: {
            $in: creatorIds,
          },
        })
          .select(
            "creatorId isEnabled currency subscription paidMedia paidMessaging tips"
          )
          .lean()
      : [];

  const monetizationMap = new Map(
    monetizationRecords.map((record) => [
      record.creatorId.toString(),
      record,
    ])
  );

  return {
    creators: creators.map((creator) =>
      formatCreatorProfile(
        creator,
        monetizationMap.get(
          creator._id.toString()
        ) ?? null
      )
    ),

    pagination: {
      page: pageNumber,
      limit: pageSize,
      total,
      totalPages: Math.ceil(
        total / pageSize
      ),
    },
  };
};

/**
 * ============================================================
 * GET INDIVIDUAL CREATOR PROFILE
 * ============================================================
 */
export const getAdminCreatorProfileById = async ({
  adminId,
  creatorId,
}) => {
  await assertActiveAdmin(adminId);

  if (!mongoose.isValidObjectId(creatorId)) {
    throw new AppError(
      "Invalid creator ID.",
      400,
      "INVALID_CREATOR_ID"
    );
  }

  const creator = await User.findOne({
    _id: creatorId,

    role: ACCOUNT_ROLES.CREATOR,

    "creatorApplication.status":
      CREATOR_APPLICATION_STATUSES.APPROVED,
  })
    .select(
      "_id displayName email avatarUrl role accountStatus createdAt creatorApplication ageVerification"
    )
    .lean();

  if (!creator) {
    throw new AppError(
      "Creator profile not found.",
      404,
      "CREATOR_NOT_FOUND"
    );
  }

  const monetization =
    await CreatorMonetization.findOne({
      creatorId: creator._id,
    })
      .select(
        "creatorId isEnabled currency subscription paidMedia paidMessaging tips"
      )
      .lean();

  return formatCreatorProfile(
    creator,
    monetization
  );
};