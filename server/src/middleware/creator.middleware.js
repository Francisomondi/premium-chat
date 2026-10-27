import AppError from "../utils/AppError.js";

/**
 * ============================================================
 * PREMIUMCHAT — CREATOR AUTHORIZATION MIDDLEWARE
 * ============================================================
 *
 * Must run AFTER requireAuth.
 *
 * Checks:
 *
 * 1. Authenticated user exists.
 * 2. Account is active.
 * 3. Adult verification is valid.
 * 4. User has CREATOR role.
 * 5. Creator application is approved.
 *
 * Uses the existing User model method:
 *
 * user.canUseCreatorFeatures()
 *
 * IMPORTANT:
 *
 * This middleware does not authenticate users.
 * Authentication is handled by requireAuth.
 */

export const requireCreator = (
  req,
  res,
  next
) => {
  try {
    const user = req.user;

    /**
     * Ensure authentication middleware ran.
     */

    if (!user) {
      throw new AppError(
        "Authentication required.",
        401,
        "AUTH_REQUIRED"
      );
    }

    /**
     * Use the existing creator eligibility method.
     */

    if (
      typeof user.canUseCreatorFeatures !==
        "function" ||
      !user.canUseCreatorFeatures()
    ) {
      throw new AppError(
        "Only approved, age-verified creators can access this feature.",
        403,
        "CREATOR_ACCESS_REQUIRED"
      );
    }

    return next();
  } catch (error) {
    return next(error);
  }
};