/**
 * ============================================================
 * PREMIUMCHAT — SAFE AUTHENTICATION REDIRECTS
 * ============================================================
 *
 * Shared by LoginPage and RegisterPage.
 *
 * Prevents open redirects and preserves supported
 * destinations across authentication screens.
 */

const CREATOR_PROFILE_REGEX =
  /^\/creators\/[0-9a-fA-F]{24}\/?$/;

export const getDashboardPath = (user) => {
  if (
    user?.role === "ADMIN" &&
    user?.accountStatus === "ACTIVE"
  ) {
    return "/admin/dashboard";
  }

  if (
    user?.role === "CREATOR" &&
    user?.accountStatus === "ACTIVE" &&
    user?.ageVerificationStatus === "VERIFIED" &&
    user?.creatorApplicationStatus === "APPROVED"
  ) {
    return "/creator/dashboard";
  }

  return "/dashboard";
};

/**
 * Validate a requested destination.
 *
 * Returns null when invalid.
 *
 * This allows registration to preserve a valid
 * destination without needing an authenticated user.
 */

export const validateAuthRedirect = (requestedPath) => {
  if (
    typeof requestedPath !== "string" ||
    !requestedPath.startsWith("/") ||
    requestedPath.startsWith("//") ||
    /[\\\u0000-\u001F\u007F]/.test(requestedPath)
  ) {
    return null;
  }

  let url;

  try {
    url = new URL(
      requestedPath,
      "http://premiumchat.local"
    );

    if (url.origin !== "http://premiumchat.local") {
      return null;
    }
  } catch {
    return null;
  }

  const pathname = url.pathname;

  // Reject encoded separators and dot-segment tricks.
  if (
    /%2f|%5c|%2e/i.test(requestedPath) ||
    /\/\.{1,2}(?:\/|$)/.test(requestedPath)
  ) {
    return null;
  }

  if (CREATOR_PROFILE_REGEX.test(pathname)) {
    return `${pathname}${url.search}`;
  }

  const allowedPaths = new Set([
    "/dashboard",
    "/creator/dashboard",
    "/admin/dashboard",
    "/messages",
  ]);

  if (allowedPaths.has(pathname)) {
    return pathname;
  }

  return null;
};

/**
 * Resolve a destination after successful login.
 *
 * Role-sensitive dashboard routes are checked
 * against the authenticated user's permissions.
 */

export const getSafeRedirectPath = (
  requestedPath,
  user
) => {
  const fallback = getDashboardPath(user);

  const validatedPath =
    validateAuthRedirect(requestedPath);

  if (!validatedPath) {
    return fallback;
  }

  if (
    validatedPath === "/admin/dashboard" &&
    fallback !== "/admin/dashboard"
  ) {
    return fallback;
  }

  if (
    validatedPath === "/creator/dashboard" &&
    fallback !== "/creator/dashboard"
  ) {
    return fallback;
  }

  return validatedPath;
};