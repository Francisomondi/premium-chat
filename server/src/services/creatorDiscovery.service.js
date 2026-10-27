import mongoose from "mongoose";

import User from "../models/User.model.js";

import {
  ACCOUNT_ROLES,
  ACCOUNT_STATUSES,
  AGE_VERIFICATION_STATUSES,
  CREATOR_APPLICATION_STATUSES,
} from "../constants/account.constants.js";

/**
 * ============================================================
 * PREMIUMCHAT — CREATOR DISCOVERY SERVICE
 * ============================================================
 *
 * Public creator discovery.
 *
 * Only eligible, approved, adult-verified creators
 * are returned.
 *
 * Sensitive user information is never selected.
 */

const DEFAULT_LIMIT = 6;
const MAX_LIMIT = 24;
const MAX_PAGE = 10000;

/**
 * ============================================================
 * CREATOR ELIGIBILITY FILTER
 * ============================================================
 */

const getEligibleCreatorFilter = () => {
  const now = new Date();

  return {
    role: ACCOUNT_ROLES.CREATOR,

    accountStatus: ACCOUNT_STATUSES.ACTIVE,

    "creatorApplication.status":
      CREATOR_APPLICATION_STATUSES.APPROVED,

    "ageVerification.status":
      AGE_VERIFICATION_STATUSES.VERIFIED,

    "ageVerification.verifiedAt": {
      $type: "date",
    },

    $or: [
      {
        "ageVerification.expiresAt": null,
      },
      {
        "ageVerification.expiresAt": {
          $gt: now,
        },
      },
    ],
  };
};

/**
 * ============================================================
 * SAFE PUBLIC FIELDS
 * ============================================================
 */

const PUBLIC_CREATOR_FIELDS = {
  _id: 1,
  displayName: 1,
  avatarUrl: 1,
  createdAt: 1,
};

/**
 * ============================================================
 * NORMALIZE PAGINATION
 * ============================================================
 */

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
 * ESCAPE SEARCH REGEX
 * ============================================================
 */

const escapeRegex = (value) => {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
};

/**
 * ============================================================
 * FORMAT PUBLIC CREATOR
 * ============================================================
 */

const formatPublicCreator = (creator) => {
  return {
    id: creator._id.toString(),

    displayName: creator.displayName,

    avatarUrl: creator.avatarUrl || null,

    isVerified: true,

    joinedAt: creator.createdAt || null,
  };
};

/**
 * ============================================================
 * LIST PUBLIC CREATORS
 * ============================================================
 */

export const listPublicCreators = async ({
  page = DEFAULT_LIMIT / DEFAULT_LIMIT,
  limit = DEFAULT_LIMIT,
  search = "",
  sort = "newest",
} = {}) => {
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

  const normalizedSearch =
    typeof search === "string"
      ? search.trim().slice(0, 100)
      : "";

  const filter = getEligibleCreatorFilter();

  if (normalizedSearch) {
    filter.displayName = {
      $regex: escapeRegex(normalizedSearch),
      $options: "i",
    };
  }

  const sortOptions =
    sort === "name"
      ? { displayName: 1, _id: 1 }
      : { createdAt: -1, _id: -1 };

  const skip = (safePage - 1) * safeLimit;

  const [creators, total] = await Promise.all([
    User.find(filter)
      .select(PUBLIC_CREATOR_FIELDS)
      .sort(sortOptions)
      .skip(skip)
      .limit(safeLimit)
      .lean(),

    User.countDocuments(filter),
  ]);

  const totalPages = Math.ceil(
    total / safeLimit
  );

  return {
    creators: creators.map(formatPublicCreator),

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

/**
 * ============================================================
 * GET PUBLIC CREATOR PROFILE
 * ============================================================
 */

export const getPublicCreatorById = async (
  creatorId
) => {
  if (
    !mongoose.isObjectIdOrHexString(creatorId)
  ) {
    return null;
  }

  const creator = await User.findOne({
    _id: creatorId,
    ...getEligibleCreatorFilter(),
  })
    .select(PUBLIC_CREATOR_FIELDS)
    .lean();

  if (!creator) {
    return null;
  }

  return formatPublicCreator(creator);
};