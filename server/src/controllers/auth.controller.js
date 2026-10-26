
import {
  registerUser,
  loginUser,
} from "../services/auth.service.js";

import {
  toSafeUserResponse,
} from "../utils/userResponse.js";

import {
  disconnectSocketsBySession,
} from "../socket/socketRegistry.js";

import {
  ACCESS_COOKIE_NAME,
  signAccessToken,
  verifyAccessToken,
  setAccessCookie,
  clearAccessCookie,
} from "../services/token.service.js";

import {
  createSession,
  revokeSession,
} from "../services/session.service.js";

/**
 * ============================================================
 * REGISTER
 * POST /api/auth/register
 * ============================================================
 */

export const register = async (req, res, next) => {
  try {
    const {
      displayName,
      email,
      password,
    } = req.validated.body;

    const user = await registerUser({
      displayName,
      email,
      password,
    });

    return res.status(201).json({
      success: true,
      message: "Account created successfully.",
      data: {
        user: toSafeUserResponse(user),
      },
      requestId: req.requestId,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * ============================================================
 * LOGIN
 * POST /api/auth/login
 * ============================================================
 */

export const login = async (req, res, next) => {
  let session = null;

  try {
    const {
      email,
      password,
    } = req.validated.body;

    /**
     * Authenticate the user.
     */
    const user = await loginUser({
      email,
      password,
    });

    /**
     * Create MongoDB session.
     */
    session = await createSession(user._id);

    /**
     * Generate JWT bound to this session.
     */
    const token = signAccessToken(
      user,
      session._id
    );

    /**
     * Set HTTP-only authentication cookie.
     */
    setAccessCookie(res, token);

    return res.status(200).json({
      success: true,
      message: "Login successful.",
      data: {
        user: toSafeUserResponse(user),
      },
      requestId: req.requestId,
    });
  } catch (error) {
    /**
     * Clean up a session if token issuance fails.
     */
    if (session?._id && session?.userId) {
      try {
        await revokeSession(
          session._id,
          session.userId
        );
      } catch (cleanupError) {
        console.error(
          "Login session cleanup failed:",
          cleanupError
        );
      }
    }

    next(error);
  }
};

/**
 * ============================================================
 * GET AUTHENTICATED USER
 * GET /api/auth/me
 * ============================================================
 */

export const getMe = (req, res) => {
  return res.status(200).json({
    success: true,
    message: "Authenticated user retrieved.",
    data: {
      user: toSafeUserResponse(req.user),
    },
    requestId: req.requestId,
  });
};

/**
 * ============================================================
 * LOGOUT USER
 * ============================================================
 *
 * 1. Read authentication cookie.
 * 2. Verify the access token.
 * 3. Revoke the MongoDB session.
 * 4. Disconnect sockets belonging to that session.
 * 5. Clear the authentication cookie.
 */

export const logout = async (req, res, next) => {
  try {
    const token =
      req.cookies?.[ACCESS_COOKIE_NAME];

    if (
      typeof token === "string" &&
      token.trim() !== ""
    ) {
      let payload = null;

      /**
       * STEP 1:
       * Verify the JWT before trusting its IDs.
       */
      try {
        payload = verifyAccessToken(token);
      } catch {
        /**
         * Invalid or expired token:
         * clear the cookie without database mutation.
         */
        payload = null;
      }

      if (payload) {
        /**
         * STEP 2:
         * Revoke the exact MongoDB session belonging
         * to the authenticated user.
         */
        await revokeSession(
          payload.sid,
          payload.sub
        );

        /**
         * STEP 3:
         * Disconnect all Socket.IO connections
         * associated with the revoked session.
         *
         * This includes multiple browser tabs
         * using the same login session.
         */
        disconnectSocketsBySession(
          String(payload.sid),
          {
            code: "SESSION_REVOKED",

            message:
              "You have been logged out. Please sign in again.",
          }
        );
      }
    }

    /**
     * STEP 4:
     * Clear the browser authentication cookie.
     */
    clearAccessCookie(res);

    /**
     * STEP 5:
     * Return successful logout response.
     */
    return res.status(200).json({
      success: true,

      message: "Logout successful.",

      requestId: req.requestId,
    });
  } catch (error) {
    /**
     * If the database operation fails:
     *
     * - Clear the browser cookie.
     * - Report the server error.
     *
     * The previously issued JWT may still be valid.
     */
    clearAccessCookie(res);

    next(error);
  }
};
