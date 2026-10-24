
import {
  submitCreatorApplication,
  getMyCreatorApplication,
} from "../services/creatorApplication.service.js";

/**
 * ============================================================
 * PREMIUMCHAT CREATOR APPLICATION CONTROLLER
 * ============================================================
 *
 * Responsibilities:
 *
 * 1. Receive authenticated creator application requests.
 * 2. Read validated request data.
 * 3. Call the creator application service.
 * 4. Return consistent API responses.
 * 5. Forward errors to centralized error middleware.
 *
 * IMPORTANT:
 *
 * Authentication and request validation are enforced
 * by route middleware.
 *
 * The service independently enforces account status,
 * application eligibility and duplicate protection.
 */

/**
 * ============================================================
 * SUBMIT CREATOR APPLICATION
 * ============================================================
 *
 * POST /api/creator/applications
 *
 * Security:
 *
 * - requireAuth authenticates the user.
 * - requireTrustedOrigin protects the POST request.
 * - validate() checks the application body.
 * - User identity comes from req.auth.userId.
 *
 * Submitting an application does not assign
 * the CREATOR role or grant creator access.
 */

export const submitApplication = async (
  req,
  res,
  next
) => {
  try {
    const userId = req.auth.userId;

    const {
      motivation,
    } = req.validated.body;

    const application =
      await submitCreatorApplication({
        userId,
        motivation,
      });

    return res.status(201).json({
      success: true,
      message:
        "Creator application submitted successfully.",
      data: {
        application,
      },
      requestId: req.requestId,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * ============================================================
 * GET MY CREATOR APPLICATION
 * ============================================================
 *
 * GET /api/creator/applications/me
 *
 * Security:
 *
 * - requireAuth authenticates the user.
 * - User identity comes from req.auth.userId.
 * - The service retrieves only that user's application.
 *
 * Returns NOT_APPLIED when the user has not
 * submitted an application.
 */

export const getMyApplication = async (
  req,
  res,
  next
) => {
  try {
    const userId = req.auth.userId;

    const application =
      await getMyCreatorApplication({
        userId,
      });

    return res.status(200).json({
      success: true,
      message:
        "Creator application retrieved successfully.",
      data: {
        application,
      },
      requestId: req.requestId,
    });
  } catch (error) {
    return next(error);
  }
};
