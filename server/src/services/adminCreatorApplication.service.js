
import mongoose from "mongoose";

import User from "../models/User.model.js";

import AppError from "../utils/AppError.js";

import {
  ACCOUNT_ROLES,
  ACCOUNT_STATUSES,
  CREATOR_APPLICATION_STATUSES,
} from "../constants/account.constants.js";

/**
 * ============================================================
 * PREMIUMCHAT ADMIN CREATOR APPLICATION SERVICE
 * ============================================================
 *
 * Responsibilities:
 *
 * 1. List pending creator applications.
 * 2. Approve pending applications.
 * 3. Reject pending applications.
 * 4. Record the reviewing administrator.
 * 5. Prevent conflicting review decisions.
 *
 * IMPORTANT:
 *
 * - Only active ADMIN accounts may review.
 * - Only active USER accounts may be approved.
 * - Approval assigns the CREATOR role.
 * - Rejection preserves the USER role.
 * - Age verification is never modified.
 * - Application status and account role are updated
 *   atomically within the same User document.
 */

/**
 * ============================================================
 * FORMAT APPLICATION RESPONSE
 * ============================================================
 *
 * Never expose password hashes, sessions,
 * verification provider references, or private
 * authentication data.
 */

const toAdminApplicationResponse = (user) => {
  const application = user.creatorApplication;

  return {
    userId: user._id.toString(),

    displayName: user.displayName,

    email: user.email,

    role: user.role,

    accountStatus: user.accountStatus,

    application: {
      status:
        application?.status ??
        CREATOR_APPLICATION_STATUSES.NOT_APPLIED,

      motivation:
        application?.motivation ?? null,

      appliedAt:
        application?.appliedAt ?? null,

      reviewedAt:
        application?.reviewedAt ?? null,

      reviewedBy:
        application?.reviewedBy?.toString() ??
        null,
    },
  };
};

/**
 * ============================================================
 * VERIFY ADMINISTRATOR
 * ============================================================
 *
 * Defense-in-depth authorization.
 *
 * Admin routes also enforce:
 *
 * requireAuth
 * requireAdmin
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

  if (!admin) {
    throw new AppError(
      "Administrator account not found.",
      403,
      "ADMIN_ACCESS_DENIED"
    );
  }

  if (
    admin.role !== ACCOUNT_ROLES.ADMIN ||
    admin.accountStatus !==
      ACCOUNT_STATUSES.ACTIVE
  ) {
    throw new AppError(
      "Administrator access required.",
      403,
      "ADMIN_ACCESS_DENIED"
    );
  }

  return admin;
};

/**
 * ============================================================
 * ADMIN PAGINATION HELPER
 * ============================================================
 */
const normalizeAdminPagination = ({
  page = 1,
  limit = 20,
}) => {
  const pageNumber = Number(page);
  const pageSize = Number(limit);

  if (
    !Number.isSafeInteger(pageNumber) ||
    pageNumber < 1 ||
    !Number.isSafeInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 100
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

  return {
    pageNumber,
    pageSize,
    skip,
  };
};

/**
 * ============================================================
 * LIST PENDING CREATOR APPLICATIONS
 * ============================================================
 *
 * Returns pending applications ordered from
 * oldest to newest.
 *
 * Pagination limits response size.
 */

export const listPendingCreatorApplications =
  async ({
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
      pageSize > 100
    ) {
      throw new AppError(
        "Invalid pagination parameters.",
        400,
        "INVALID_PAGINATION"
      );
    }

    const filter = {
      role: ACCOUNT_ROLES.USER,

      accountStatus: ACCOUNT_STATUSES.ACTIVE,

      "creatorApplication.status":
        CREATOR_APPLICATION_STATUSES.PENDING,
    };

    const skip = (pageNumber - 1) * pageSize;

    if (!Number.isSafeInteger(skip)) {
      throw new AppError(
        "Invalid pagination parameters.",
        400,
        "INVALID_PAGINATION"
      );
    }

    const [users, total] = await Promise.all([
      User.find(filter)
        .select(
          "_id displayName email role accountStatus creatorApplication"
        )
        .sort({
          "creatorApplication.appliedAt": 1,
          _id: 1,
        })
        .skip(skip)
        .limit(pageSize)
        .lean(),

      User.countDocuments(filter),
    ]);

    return {
      applications: users.map(
        toAdminApplicationResponse
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
 * REVIEW CREATOR APPLICATION
 * ============================================================
 *
 * decision:
 *
 * APPROVE
 * REJECT
 *
 * APPROVE:
 * - Application becomes APPROVED.
 * - User role becomes CREATOR.
 *
 * REJECT:
 * - Application becomes REJECTED.
 * - User role remains USER.
 *
 * Only a PENDING application belonging to an
 * active USER can be reviewed.
 */

export const reviewCreatorApplication = async ({
  adminId,
  userId,
  decision,
}) => {
  await assertActiveAdmin(adminId);

  if (!mongoose.isValidObjectId(userId)) {
    throw new AppError(
      "Invalid applicant ID.",
      400,
      "INVALID_APPLICANT_ID"
    );
  }

  if (
    decision !== "APPROVE" &&
    decision !== "REJECT"
  ) {
    throw new AppError(
      "Decision must be APPROVE or REJECT.",
      400,
      "INVALID_REVIEW_DECISION"
    );
  }

  const isApproval = decision === "APPROVE";

  const nextApplicationStatus = isApproval
    ? CREATOR_APPLICATION_STATUSES.APPROVED
    : CREATOR_APPLICATION_STATUSES.REJECTED;

  const reviewedAt = new Date();

  /**
   * ==========================================================
   * ATOMIC CONDITIONAL UPDATE
   * ==========================================================
   *
   * The filter ensures:
   *
   * 1. Applicant exists.
   * 2. Applicant is an active USER.
   * 3. Application is still PENDING.
   *
   * If two administrators review concurrently,
   * only one update can match.
   *
   * Approval updates role and application
   * status in the same MongoDB document.
   */

  const updatedUser =
    await User.findOneAndUpdate(
      {
        _id: userId,

        role: ACCOUNT_ROLES.USER,

        accountStatus: ACCOUNT_STATUSES.ACTIVE,

        "creatorApplication.status":
          CREATOR_APPLICATION_STATUSES.PENDING,
      },
      {
        $set: {
          role: isApproval
            ? ACCOUNT_ROLES.CREATOR
            : ACCOUNT_ROLES.USER,

          "creatorApplication.status":
            nextApplicationStatus,

          "creatorApplication.reviewedAt":
            reviewedAt,

          "creatorApplication.reviewedBy":
            new mongoose.Types.ObjectId(
              adminId
            ),
        },
      },
      {
        new: true,
        runValidators: true,
      }
    );

  /**
   * No document matched the required state.
   *
   * Distinguish missing accounts from
   * applications that cannot be reviewed.
   */

  if (!updatedUser) {
    const applicant = await User.findById(
      userId
    )
      .select(
        "_id role accountStatus creatorApplication.status"
      )
      .lean();

    if (!applicant) {
      throw new AppError(
        "Applicant account not found.",
        404,
        "APPLICANT_NOT_FOUND"
      );
    }

    throw new AppError(
      "This creator application is no longer eligible for review. Refresh the application list.",
      409,
      "CREATOR_APPLICATION_REVIEW_CONFLICT"
    );
  }

  return toAdminApplicationResponse(
    updatedUser
  );
};

/**
 * ============================================================
 * LIST CREATOR APPLICATIONS
 * ============================================================
 *
 * Supports:
 *
 * ALL
 * PENDING
 * APPROVED
 * REJECTED
 *
 * Applications are stored inside User documents.
 *
 * Sensitive authentication information is never returned.
 */
export const listCreatorApplications = async ({
  adminId,
  status = "ALL",
  page = 1,
  limit = 20,
}) => {
  await assertActiveAdmin(adminId);

  const {
    pageNumber,
    pageSize,
    skip,
  } = normalizeAdminPagination({
    page,
    limit,
  });

  const allowedStatuses = [
    "ALL",
    CREATOR_APPLICATION_STATUSES.PENDING,
    CREATOR_APPLICATION_STATUSES.APPROVED,
    CREATOR_APPLICATION_STATUSES.REJECTED,
  ];

  if (!allowedStatuses.includes(status)) {
    throw new AppError(
      "Invalid creator application status.",
      400,
      "INVALID_APPLICATION_STATUS"
    );
  }

  const filter = {
    "creatorApplication.status": {
      $in:
        status === "ALL"
          ? [
              CREATOR_APPLICATION_STATUSES.PENDING,
              CREATOR_APPLICATION_STATUSES.APPROVED,
              CREATOR_APPLICATION_STATUSES.REJECTED,
            ]
          : [status],
    },
  };

  const [users, total] = await Promise.all([
    User.find(filter)
      .select(
        "_id displayName email avatarUrl role accountStatus creatorApplication"
      )
      .sort({
        "creatorApplication.appliedAt": -1,
        _id: -1,
      })
      .skip(skip)
      .limit(pageSize)
      .lean(),

    User.countDocuments(filter),
  ]);

  return {
    applications: users.map((user) => ({
      ...toAdminApplicationResponse(user),

      avatarUrl: user.avatarUrl ?? null,
    })),

    pagination: {
      page: pageNumber,
      limit: pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },

    filters: {
      status,
    },
  };
};

/**
 * ============================================================
 * GET CREATOR APPLICATION DETAILS
 * ============================================================
 */
export const getCreatorApplicationDetails = async ({
  adminId,
  userId,
}) => {
  await assertActiveAdmin(adminId);

  if (!mongoose.isValidObjectId(userId)) {
    throw new AppError(
      "Invalid applicant ID.",
      400,
      "INVALID_APPLICANT_ID"
    );
  }

  const user = await User.findById(userId)
    .select(
      "_id displayName email avatarUrl role accountStatus creatorApplication createdAt"
    )
    .lean();

  if (!user) {
    throw new AppError(
      "Applicant not found.",
      404,
      "APPLICANT_NOT_FOUND"
    );
  }

  if (
    ![
      CREATOR_APPLICATION_STATUSES.PENDING,
      CREATOR_APPLICATION_STATUSES.APPROVED,
      CREATOR_APPLICATION_STATUSES.REJECTED,
    ].includes(user.creatorApplication?.status)
  ) {
    throw new AppError(
      "This user has not submitted a creator application.",
      404,
      "CREATOR_APPLICATION_NOT_FOUND"
    );
  }

  return {
    ...toAdminApplicationResponse(user),

    avatarUrl: user.avatarUrl ?? null,

    registeredAt: user.createdAt ?? null,
  };
};