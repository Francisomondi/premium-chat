
import {
  listPendingCreatorApplications,
  reviewCreatorApplication,
} from "../services/adminCreatorApplication.service.js";

/**
 * ============================================================
 * PREMIUMCHAT ADMIN CREATOR APPLICATION CONTROLLER
 * ============================================================
 *
 * Responsibilities:
 *
 * 1. Retrieve pending creator applications.
 * 2. Approve or reject applications.
 * 3. Return standardized API responses.
 * 4. Forward errors to the central error handler.
 *
 * IMPORTANT:
 *
 * The admin routes must apply:
 *
 * requireAuth
 * requireAdmin
 *
 * The controller never trusts a client-supplied
 * administrator ID or account role.
 */

/**
 * ============================================================
 * GET PENDING CREATOR APPLICATIONS
 * ============================================================
 *
 * Intended endpoint:
 *
 * GET /api/admin/creator-applications
 *
 * Optional query parameters:
 *
 * page=1
 * limit=20
 *
 * Returns pending applications and pagination.
 */

export const getPendingCreatorApplications = async (
  req,
  res,
  next
) => {
  try {
    const adminId = req.auth.userId;

    const query =
      req.validated?.query ?? req.query;

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const result =
      await listPendingCreatorApplications({
        adminId,
        page,
        limit,
      });

    return res.status(200).json({
      success: true,

      message:
        "Pending creator applications retrieved successfully.",

      data: result,

      requestId: req.requestId,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * ============================================================
 * REVIEW CREATOR APPLICATION
 * ============================================================
 *
 * Intended endpoint:
 *
 * PATCH /api/admin/creator-applications/:userId/review
 *
 * Request body:
 *
 * {
 *   "decision": "APPROVE"
 * }
 *
 * OR:
 *
 * {
 *   "decision": "REJECT"
 * }
 *
 * APPROVE:
 * - Application status becomes APPROVED.
 * - Applicant receives the CREATOR role.
 *
 * REJECT:
 * - Application status becomes REJECTED.
 * - Applicant remains a USER.
 *
 * The service performs an atomic conditional
 * MongoDB update to prevent conflicting reviews.
 */

export const reviewApplication = async (
  req,
  res,
  next
) => {
  try {
    const adminId = req.auth.userId;

    const params =
      req.validated?.params ?? req.params;

    const body =
      req.validated?.body ?? req.body;

    const { userId } = params;

    const { decision } = body;

    const application =
      await reviewCreatorApplication({
        adminId,
        userId,
        decision,
      });

    const message =
      decision === "APPROVE"
        ? "Creator application approved successfully."
        : "Creator application rejected successfully.";

    return res.status(200).json({
      success: true,

      message,

      data: {
        application,
      },

      requestId: req.requestId,
    });
  } catch (error) {
    return next(error);
  }
};
