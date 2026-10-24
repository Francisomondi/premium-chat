
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
 * PREMIUMCHAT CREATOR APPLICATION SERVICE
 * ============================================================
 *
 * Responsibilities:
 *
 * 1. Submit a creator application.
 * 2. Retrieve the current application.
 * 3. Prevent duplicate applications.
 * 4. Preserve account roles and verification state.
 *
 * This service NEVER:
 *
 * - Assigns the CREATOR role.
 * - Approves applications.
 * - Changes age verification.
 * - Grants creator privileges.
 */

/**
 * ============================================================
 * FORMAT APPLICATION RESPONSE
 * ============================================================
 *
 * Return only fields intended for the applicant.
 */

const toApplicationResponse = (user) => {
  const application = user.creatorApplication;

  return {
    status:
      application?.status ??
      CREATOR_APPLICATION_STATUSES.NOT_APPLIED,

    motivation:
      application?.motivation ?? null,

    appliedAt:
      application?.appliedAt ?? null,

    reviewedAt:
      application?.reviewedAt ?? null,
  };
};

/**
 * ============================================================
 * SUBMIT CREATOR APPLICATION
 * ============================================================
 *
 * The userId must come from the authenticated session.
 *
 * Uses an atomic MongoDB conditional update to
 * prevent simultaneous duplicate submissions.
 */

export const submitCreatorApplication = async ({
  userId,
  motivation,
}) => {
  if (!mongoose.isValidObjectId(userId)) {
    throw new AppError(
      "Invalid authenticated user.",
      401,
      "INVALID_USER"
    );
  }

  /**
   * Defense-in-depth validation.
   *
   * The route will also validate motivation
   * using the Zod submission schema.
   */
  if (typeof motivation !== "string") {
    throw new AppError(
      "Application motivation is required.",
      400,
      "INVALID_APPLICATION"
    );
  }

  const normalizedMotivation = motivation.trim();

  if (
    normalizedMotivation.length < 30 ||
    normalizedMotivation.length > 1000
  ) {
    throw new AppError(
      "Application motivation must contain between 30 and 1000 characters.",
      400,
      "INVALID_APPLICATION"
    );
  }

  /**
   * Check the applicant's current account state.
   */
  const user = await User.findById(userId);

  if (!user) {
    throw new AppError(
      "Account not found.",
      404,
      "USER_NOT_FOUND"
    );
  }

  if (
    user.accountStatus !== ACCOUNT_STATUSES.ACTIVE
  ) {
    throw new AppError(
      "This account cannot submit applications.",
      403,
      "ACCOUNT_UNAVAILABLE"
    );
  }

  if (user.role !== ACCOUNT_ROLES.USER) {
    throw new AppError(
      "Only standard user accounts can apply to become creators.",
      403,
      "CREATOR_APPLICATION_NOT_ALLOWED"
    );
  }

  const currentStatus =
    user.creatorApplication?.status ??
    CREATOR_APPLICATION_STATUSES.NOT_APPLIED;

  if (
    currentStatus ===
    CREATOR_APPLICATION_STATUSES.PENDING
  ) {
    throw new AppError(
      "You already have a pending creator application.",
      409,
      "CREATOR_APPLICATION_PENDING"
    );
  }

  if (
    currentStatus ===
    CREATOR_APPLICATION_STATUSES.APPROVED
  ) {
    throw new AppError(
      "Your creator application has already been approved.",
      409,
      "CREATOR_APPLICATION_APPROVED"
    );
  }

  if (
    currentStatus ===
    CREATOR_APPLICATION_STATUSES.REJECTED
  ) {
    throw new AppError(
      "Your previous creator application was rejected. Reapplication is not currently available.",
      409,
      "CREATOR_REAPPLICATION_UNAVAILABLE"
    );
  }

  /**
   * Atomically submit the application.
   *
   * The filter includes the account role,
   * account status and application status.
   *
   * If two submissions happen concurrently,
   * only the first matching update succeeds.
   */
  const submittedAt = new Date();

  const result = await User.updateOne(
    {
      _id: user._id,

      role: ACCOUNT_ROLES.USER,

      accountStatus: ACCOUNT_STATUSES.ACTIVE,

      "creatorApplication.status":
        CREATOR_APPLICATION_STATUSES.NOT_APPLIED,
    },
    {
      $set: {
        "creatorApplication.status":
          CREATOR_APPLICATION_STATUSES.PENDING,

        "creatorApplication.motivation":
          normalizedMotivation,

        "creatorApplication.appliedAt":
          submittedAt,

        "creatorApplication.reviewedAt":
          null,

        "creatorApplication.reviewedBy":
          null,
      },
    },
    {
      runValidators: true,
    }
  );

  if (result.matchedCount !== 1) {
    throw new AppError(
      "Your application could not be submitted because your account or application status changed. Please refresh and try again.",
      409,
      "CREATOR_APPLICATION_CONFLICT"
    );
  }

  /**
   * Fetch the updated user for a consistent
   * application response.
   */
  const updatedUser = await User.findById(user._id);

  if (!updatedUser) {
    throw new AppError(
      "Unable to retrieve the submitted application.",
      500,
      "APPLICATION_RETRIEVAL_FAILED"
    );
  }

  return toApplicationResponse(updatedUser);
};

/**
 * ============================================================
 * GET CURRENT CREATOR APPLICATION
 * ============================================================
 *
 * Allows an authenticated user to check
 * their application status.
 */

export const getMyCreatorApplication = async ({
  userId,
}) => {
  if (!mongoose.isValidObjectId(userId)) {
    throw new AppError(
      "Invalid authenticated user.",
      401,
      "INVALID_USER"
    );
  }

  const user = await User.findById(userId);

  if (!user) {
    throw new AppError(
      "Account not found.",
      404,
      "USER_NOT_FOUND"
    );
  }

  if (
    user.accountStatus !== ACCOUNT_STATUSES.ACTIVE
  ) {
    throw new AppError(
      "Account access is restricted.",
      403,
      "ACCOUNT_UNAVAILABLE"
    );
  }

  return toApplicationResponse(user);
};
