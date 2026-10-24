
import axiosInstance from "../axiosInstance.js";

/**
 * ============================================================
 * PREMIUMCHAT CREATOR APPLICATION API SERVICE
 * ============================================================
 *
 * Handles creator application requests for
 * authenticated PremiumChat users.
 *
 * Uses the existing Axios instance:
 *
 * - Configured API base URL
 * - HTTP-only authentication cookies
 * - Request timeout
 * - Centralized API error normalization
 *
 * IMPORTANT:
 *
 * Submitting an application does not grant
 * the user the CREATOR role.
 *
 * Creator privileges are assigned only after
 * administrator approval.
 */

const CREATOR_APPLICATION_BASE =
  "/creator/applications";

/**
 * ============================================================
 * SUBMIT CREATOR APPLICATION
 * ============================================================
 *
 * POST /api/creator/applications
 *
 * Request:
 *
 * {
 *   motivation: string
 * }
 *
 * Requirements:
 *
 * - Authenticated user
 * - Active account
 * - USER role
 * - Motivation between 30 and 1000 characters
 *
 * Successful submission:
 *
 * - Application status becomes PENDING.
 * - Account role remains USER.
 *
 * Expected success: HTTP 201
 */

export const submitCreatorApplication = async (
  motivation
) => {
  if (typeof motivation !== "string") {
    throw new TypeError(
      "Creator application motivation must be a string."
    );
  }

  const normalizedMotivation =
    motivation.trim();

  if (
    normalizedMotivation.length < 30 ||
    normalizedMotivation.length > 1000
  ) {
    throw new RangeError(
      "Creator application motivation must contain between 30 and 1000 characters."
    );
  }

  const response = await axiosInstance.post(
    CREATOR_APPLICATION_BASE,
    {
      motivation: normalizedMotivation,
    }
  );

  return response.data;
};

/**
 * ============================================================
 * GET MY CREATOR APPLICATION
 * ============================================================
 *
 * GET /api/creator/applications/me
 *
 * Returns the authenticated user's
 * application status.
 *
 * Possible statuses:
 *
 * NOT_APPLIED
 * PENDING
 * APPROVED
 * REJECTED
 *
 * Expected success: HTTP 200
 */

export const getMyCreatorApplication =
  async () => {
    const response = await axiosInstance.get(
      `${CREATOR_APPLICATION_BASE}/me`
    );

    return response.data;
  };

/**
 * ============================================================
 * CREATOR APPLICATION SERVICE EXPORT
 * ============================================================
 *
 * Supports both named imports and a default import.
 */

const creatorApplicationService = {
  submitCreatorApplication,
  getMyCreatorApplication,
};

export default creatorApplicationService;
