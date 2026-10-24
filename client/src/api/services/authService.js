
import axiosInstance from "../axiosInstance.js";

/**
 * ============================================================
 * PREMIUMCHAT AUTHENTICATION API SERVICE
 * ============================================================
 *
 * Authentication uses HTTP-only cookies.
 *
 * Never store JWTs in localStorage,
 * sessionStorage, or Zustand.
 *
 * axiosInstance automatically sends cookies
 * because withCredentials is enabled.
 */

const AUTH_BASE = "/auth";

/**
 * ============================================================
 * REGISTER USER
 * POST /api/auth/register
 * ============================================================
 *
 * Registration creates an account.
 * It does not automatically log the user in.
 */

export const registerUser = async ({
  displayName,
  email,
  password,
}) => {
  const response = await axiosInstance.post(
    `${AUTH_BASE}/register`,
    {
      displayName,
      email,
      password,
    }
  );

  return response.data;
};

/**
 * ============================================================
 * LOGIN USER
 * POST /api/auth/login
 * ============================================================
 *
 * The backend sets an HTTP-only JWT cookie.
 *
 * The frontend receives safe user details,
 * not the authentication token.
 */

export const loginUser = async ({
  email,
  password,
}) => {
  const response = await axiosInstance.post(
    `${AUTH_BASE}/login`,
    {
      email,
      password,
    }
  );

  return response.data;
};

/**
 * ============================================================
 * GET AUTHENTICATED USER
 * GET /api/auth/me
 * ============================================================
 *
 * Used to restore the authenticated user
 * after a page refresh.
 */

export const getAuthenticatedUser = async () => {
  const response = await axiosInstance.get(
    `${AUTH_BASE}/me`
  );

  return response.data;
};

/**
 * ============================================================
 * LOGOUT USER
 * POST /api/auth/logout
 * ============================================================
 *
 * The backend revokes the MongoDB session
 * and clears the authentication cookie.
 */

export const logoutUser = async () => {
  const response = await axiosInstance.post(
    `${AUTH_BASE}/logout`
  );

  return response.data;
};

/**
 * ============================================================
 * AUTH SERVICE EXPORT
 * ============================================================
 */

const authService = {
  registerUser,
  loginUser,
  getAuthenticatedUser,
  logoutUser,
};

export default authService;
