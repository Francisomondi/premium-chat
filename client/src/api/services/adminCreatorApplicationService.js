
import axiosInstance from "../axiosInstance.js";

/**
 * ============================================================
 * PREMIUMCHAT ADMIN CREATOR APPLICATION SERVICE
 * ============================================================
 *
 * Handles administrator requests for reviewing
 * creator applications.
 *
 * Uses the existing Axios instance:
 *
 * - Configured API base URL
 * - HTTP-only authentication cookies
 * - Centralized error normalization
 * - Request timeout
 *
 * All administrator permissions are verified
 * independently by the backend.
 */

const ADMIN_APPLICATION_BASE =
  "/admin/creator-applications";

/**
 * ============================================================
 * VALIDATION HELPERS
 * ============================================================
 */

const validatePagination = (page, limit) => {
  if (!Number.isInteger(page) || page < 1) {
    throw new RangeError(
      "Page must be a positive integer."
    );
  }

  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100
  ) {
    throw new RangeError(
      "Limit must be an integer between 1 and 100."
    );
  }
};

const validateApplicantId = (userId) => {
  if (
    typeof userId !== "string" ||
    !/^[0-9a-fA-F]{24}$/.test(userId)
  ) {
    throw new TypeError(
      "A valid applicant ID is required."
    );
  }

  return userId;
};

/**
 * ============================================================
 * GET PENDING CREATOR APPLICATIONS
 * ============================================================
 *
 * GET /api/admin/creator-applications
 *
 * Query parameters:
 *
 * page: integer >= 1
 * limit: integer between 1 and 100
 *
 * Backend returns:
 *
 * {
 *   success: true,
 *   data: {
 *     applications: [...],
 *     pagination: {
 *       page,
 *       limit,
 *       total,
 *       totalPages
 *     }
 *   }
 * }
 */

export const getPendingCreatorApplications = async ({
  page = 1,
  limit = 20,
} = {}) => {
  validatePagination(page, limit);

  const response = await axiosInstance.get(
    ADMIN_APPLICATION_BASE,
    {
      params: {
        page,
        limit,
      },
    }
  );

  return response.data;
};

/**
 * ============================================================
 * REVIEW CREATOR APPLICATION
 * ============================================================
 *
 * PATCH /api/admin/creator-applications/:userId/review
 *
 * Valid decisions:
 *
 * APPROVE
 * REJECT
 *
 * The backend performs an atomic review and
 * prevents reviewing an application twice.
 */

const reviewCreatorApplication = async ({
  userId,
  decision,
}) => {
  const validUserId =
    validateApplicantId(userId);

  if (
    decision !== "APPROVE" &&
    decision !== "REJECT"
  ) {
    throw new TypeError(
      "Decision must be APPROVE or REJECT."
    );
  }

  const response = await axiosInstance.patch(
    `${ADMIN_APPLICATION_BASE}/${validUserId}/review`,
    {
      decision,
    }
  );

  return response.data;
};

/**
 * ============================================================
 * APPROVE CREATOR APPLICATION
 * ============================================================
 *
 * On successful backend approval:
 *
 * - Application status becomes APPROVED.
 * - Applicant role becomes CREATOR.
 *
 * This does not bypass age verification.
 */

export const approveCreatorApplication = async (
  userId
) => {
  return reviewCreatorApplication({
    userId,
    decision: "APPROVE",
  });
};

/**
 * ============================================================
 * REJECT CREATOR APPLICATION
 * ============================================================
 *
 * On successful backend rejection:
 *
 * - Application status becomes REJECTED.
 * - Applicant role remains USER.
 *
 * Reapplication is not currently supported.
 */

export const rejectCreatorApplication = async (
  userId
) => {
  return reviewCreatorApplication({
    userId,
    decision: "REJECT",
  });
};

/**
 * ============================================================
 * ADMIN CREATOR APPLICATION SERVICE EXPORT
 * ============================================================
 */

const adminCreatorApplicationService = {
  getPendingCreatorApplications,
  approveCreatorApplication,
  rejectCreatorApplication,
};

export default adminCreatorApplicationService;
