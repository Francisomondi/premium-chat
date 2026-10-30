import axiosInstance from "../axiosInstance.js";

/**
 * ============================================================
 * PREMIUMCHAT ADMIN CREATOR APPLICATION API SERVICE
 * ============================================================
 */

const ADMIN_APPLICATION_BASE =
  "/admin/creator-applications";

const APPLICATION_STATUSES = [
  "ALL",
  "PENDING",
  "APPROVED",
  "REJECTED",
];

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
      "Limit must be between 1 and 100."
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
 * GET PENDING APPLICATIONS
 *
 * GET /api/admin/creator-applications
 */
export const getPendingCreatorApplications = async ({
  page = 1,
  limit = 20,
} = {}) => {
  validatePagination(page, limit);

  const response = await axiosInstance.get(
    ADMIN_APPLICATION_BASE,
    {
      params: { page, limit },
    }
  );

  return response.data;
};

/**
 * GET ALL APPLICATIONS
 *
 * GET /api/admin/creator-applications/all
 *
 * Optional status:
 * ALL | PENDING | APPROVED | REJECTED
 */
export const getAllCreatorApplications = async ({
  status = "ALL",
  page = 1,
  limit = 20,
} = {}) => {
  validatePagination(page, limit);

  if (!APPLICATION_STATUSES.includes(status)) {
    throw new TypeError(
      "Invalid creator application status."
    );
  }

  const response = await axiosInstance.get(
    `${ADMIN_APPLICATION_BASE}/all`,
    {
      params: {
        status,
        page,
        limit,
      },
    }
  );

  return response.data;
};

/**
 * GET APPLICATION DETAILS
 *
 * GET /api/admin/creator-applications/:userId
 */
export const getCreatorApplication = async (userId) => {
  const validUserId = validateApplicantId(userId);

  const response = await axiosInstance.get(
    `${ADMIN_APPLICATION_BASE}/${validUserId}`
  );

  return response.data;
};

/**
 * REVIEW APPLICATION
 *
 * PATCH /api/admin/creator-applications/:userId/review
 */
const reviewCreatorApplication = async ({
  userId,
  decision,
}) => {
  const validUserId = validateApplicantId(userId);

  if (!["APPROVE", "REJECT"].includes(decision)) {
    throw new TypeError(
      "Decision must be APPROVE or REJECT."
    );
  }

  const response = await axiosInstance.patch(
    `${ADMIN_APPLICATION_BASE}/${validUserId}/review`,
    { decision }
  );

  return response.data;
};

export const approveCreatorApplication = async (
  userId
) =>
  reviewCreatorApplication({
    userId,
    decision: "APPROVE",
  });

export const rejectCreatorApplication = async (
  userId
) =>
  reviewCreatorApplication({
    userId,
    decision: "REJECT",
  });

const adminCreatorApplicationService = {
  getPendingCreatorApplications,
  getAllCreatorApplications,
  getCreatorApplication,
  approveCreatorApplication,
  rejectCreatorApplication,
};

export default adminCreatorApplicationService;