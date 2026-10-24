
import AppError from "../utils/AppError.js";

import {
  ACCOUNT_ROLES,
  ACCOUNT_STATUSES,
} from "../constants/account.constants.js";

/**
 * ============================================================
 * PREMIUMCHAT ROLE-BASED AUTHORIZATION
 * ============================================================
 *
 * Usage:
 *
 * requireAuth,
 * requireRole(ACCOUNT_ROLES.ADMIN)
 *
 * IMPORTANT:
 *
 * requireAuth must execute before requireRole.
 *
 * Authorization uses the authenticated user
 * loaded from MongoDB, never a client-provided role.
 */

const validRoles = new Set(
  Object.values(ACCOUNT_ROLES)
);

/**
 * ============================================================
 * REQUIRE ONE OF THE ALLOWED ROLES
 * ============================================================
 *
 * Accepts one or more roles.
 *
 * Examples:
 *
 * requireRole(ACCOUNT_ROLES.ADMIN)
 *
 * requireRole(
 *   ACCOUNT_ROLES.CREATOR,
 *   ACCOUNT_ROLES.ADMIN
 * )
 */

export const requireRole = (...allowedRoles) => {
  if (
    allowedRoles.length === 0 ||
    allowedRoles.some(
      (role) => !validRoles.has(role)
    )
  ) {
    throw new Error(
      "requireRole must receive at least one valid account role."
    );
  }

  const allowedRoleSet = new Set(
    allowedRoles
  );

  return (req, res, next) => {
    try {
      /**
       * Authentication must already have
       * established the user context.
       */
      if (!req.auth?.userId || !req.user) {
        throw new AppError(
          "Authentication required.",
          401,
          "AUTH_REQUIRED"
        );
      }

      /**
       * Defensive account status check.
       *
       * requireAuth already performs this check.
       */
      if (
        req.user.accountStatus !==
        ACCOUNT_STATUSES.ACTIVE
      ) {
        throw new AppError(
          "Account access is restricted.",
          403,
          "ACCOUNT_UNAVAILABLE"
        );
      }

      /**
       * Check the trusted server-side role.
       */
      if (
        !allowedRoleSet.has(req.user.role)
      ) {
        throw new AppError(
          "You do not have permission to access this resource.",
          403,
          "INSUFFICIENT_PERMISSIONS"
        );
      }

      return next();
    } catch (error) {
      return next(error);
    }
  };
};

/**
 * ============================================================
 * ADMIN-ONLY AUTHORIZATION
 * ============================================================
 *
 * Convenience middleware for administrator routes.
 *
 * Example:
 *
 * router.get(
 *   "/applications",
 *   requireAuth,
 *   requireAdmin,
 *   controller
 * );
 */

export const requireAdmin = requireRole(
  ACCOUNT_ROLES.ADMIN
);
