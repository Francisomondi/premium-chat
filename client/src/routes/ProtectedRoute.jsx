
import {
  Navigate,
  Outlet,
  useLocation,
} from "react-router-dom";

import { useAuthStore } from "../store/useAuthStore.js";

/**
 * ============================================================
 * PREMIUMCHAT PROTECTED ROUTE
 * ============================================================
 *
 * Protects authenticated frontend routes.
 *
 * Uses actual fields returned by GET /api/auth/me:
 *
 * - role
 * - accountStatus
 * - ageVerificationStatus
 * - creatorApplicationStatus
 *
 * IMPORTANT:
 * Backend authorization remains the source of truth.
 */

const ACCOUNT_ROLES = Object.freeze({
  USER: "USER",
  CREATOR: "CREATOR",
  ADMIN: "ADMIN",
});

const ACCOUNT_STATUSES = Object.freeze({
  ACTIVE: "ACTIVE",
});

const AGE_VERIFICATION_STATUSES = Object.freeze({
  VERIFIED: "VERIFIED",
});

const CREATOR_APPLICATION_STATUSES = Object.freeze({
  APPROVED: "APPROVED",
});

/**
 * ============================================================
 * CHECK CREATOR ELIGIBILITY
 * ============================================================
 *
 * This check controls frontend navigation only.
 *
 * Backend authorization must independently verify
 * age verification validity, including expiration.
 */

const hasCreatorAccess = (user) => {
  return (
    user?.role === ACCOUNT_ROLES.CREATOR &&
    user?.accountStatus === ACCOUNT_STATUSES.ACTIVE &&
    user?.ageVerificationStatus ===
      AGE_VERIFICATION_STATUSES.VERIFIED &&
    user?.creatorApplicationStatus ===
      CREATOR_APPLICATION_STATUSES.APPROVED
  );
};

/**
 * ============================================================
 * GET SAFE DASHBOARD PATH
 * ============================================================
 *
 * Keep this consistent with LoginPage and Navbar.
 *
 * A creator who has not completed verification
 * or approval is directed to the general dashboard.
 */

const getDashboardPath = (user) => {
  if (
    user?.role === ACCOUNT_ROLES.ADMIN &&
    user?.accountStatus === ACCOUNT_STATUSES.ACTIVE
  ) {
    return "/admin/dashboard";
  }

  if (hasCreatorAccess(user)) {
    return "/creator/dashboard";
  }

  return "/dashboard";
};

/**
 * ============================================================
 * PROTECTED ROUTE COMPONENT
 * ============================================================
 */

export default function ProtectedRoute({
  allowedRoles = [],
  requireCreatorApproval = false,
}) {
  const location = useLocation();

  const user = useAuthStore(
    (state) => state.user
  );

  const isAuthenticated = useAuthStore(
    (state) => state.isAuthenticated
  );

  const isInitializing = useAuthStore(
    (state) => state.isInitializing
  );

  /**
   * ==========================================================
   * WAIT FOR AUTHENTICATION INITIALIZATION
   * ==========================================================
   */

  if (isInitializing) {
    return (
      <section className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="text-center">
          <div
            className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-border border-t-accent"
            role="status"
            aria-label="Checking authentication"
          />

          <p className="mt-4 text-sm text-muted">
            Verifying your session...
          </p>
        </div>
      </section>
    );
  }

  /**
   * ==========================================================
   * REQUIRE AUTHENTICATION
   * ==========================================================
   */

  if (!isAuthenticated || !user) {
    const requestedPath =
      location.pathname +
      location.search +
      location.hash;

    return (
      <Navigate
        to="/login"
        replace
        state={{
          from: requestedPath,
        }}
      />
    );
  }

  /**
   * ==========================================================
   * REQUIRE ACTIVE ACCOUNT
   * ==========================================================
   */

  if (
    user.accountStatus !== ACCOUNT_STATUSES.ACTIVE
  ) {
    return (
      <section className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="w-full max-w-lg rounded-2xl border border-border bg-surface p-8 text-center">
          <h1 className="text-2xl font-bold">
            Account Access Restricted
          </h1>

          <p className="mt-4 text-sm leading-7 text-muted">
            Your account is currently not active.
            Please contact support if you believe
            this is a mistake.
          </p>
        </div>
      </section>
    );
  }

  /**
   * ==========================================================
   * ROLE AUTHORIZATION
   * ==========================================================
   */

  if (
    allowedRoles.length > 0 &&
    !allowedRoles.includes(user.role)
  ) {
    const destination = getDashboardPath(user);

    if (destination !== location.pathname) {
      return (
        <Navigate
          to={destination}
          replace
        />
      );
    }

    return (
      <section className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="w-full max-w-lg rounded-2xl border border-border bg-surface p-8 text-center">
          <h1 className="text-2xl font-bold">
            Access Denied
          </h1>

          <p className="mt-4 text-sm leading-7 text-muted">
            You do not have permission to access
            this page.
          </p>
        </div>
      </section>
    );
  }

  /**
   * ==========================================================
   * CREATOR APPROVAL AND AGE VERIFICATION
   * ==========================================================
   */

  if (
    requireCreatorApproval &&
    !hasCreatorAccess(user)
  ) {
    return (
      <section className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="w-full max-w-lg rounded-2xl border border-border bg-surface p-8 text-center">
          <h1 className="text-2xl font-bold">
            Creator Access Unavailable
          </h1>

          <p className="mt-4 text-sm leading-7 text-muted">
            Creator features require an approved
            creator application and completed
            adult age verification.
          </p>

          <p className="mt-3 text-sm leading-7 text-muted">
            You can continue using your general
            account dashboard while these
            requirements are pending.
          </p>
        </div>
      </section>
    );
  }

  /**
   * ==========================================================
   * AUTHORIZED
   * ==========================================================
   */

  return <Outlet />;
}
