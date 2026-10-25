
import mongoose from "mongoose";
import cookieParser from "cookie-parser";

import User from "../models/User.model.js";

import {
  ACCOUNT_STATUSES,
} from "../constants/account.constants.js";

import {
  ACCESS_COOKIE_NAME,
  verifyAccessToken,
} from "../services/token.service.js";

import {
  getActiveSession,
} from "../services/session.service.js";

/**
 * ============================================================
 * PREMIUMCHAT SOCKET.IO AUTHENTICATION MIDDLEWARE
 * ============================================================
 *
 * Uses the same authentication system as Express:
 *
 * 1. HTTP-only access cookie
 * 2. Signed JWT verification
 * 3. Active MongoDB session
 * 4. Active user account
 *
 * Never trusts userId, role, or sessionId supplied
 * through socket.handshake.auth or query parameters.
 */

/**
 * ============================================================
 * CREATE SAFE SOCKET AUTHENTICATION ERROR
 * ============================================================
 */

const createSocketAuthError = (
  message = "Socket authentication failed.",
  code = "SOCKET_AUTH_FAILED"
) => {
  const error = new Error(message);

  error.data = {
    code,
  };

  return error;
};

/**
 * ============================================================
 * AUTHENTICATE SOCKET CONNECTION
 * ============================================================
 */

export const authenticateSocket = async (
  socket,
  next
) => {
  try {
    /*
     * STEP 1:
     * Read the cookie from the HTTP handshake.
     */
    const cookieHeader =
      socket.handshake.headers.cookie;

    if (
      typeof cookieHeader !== "string" ||
      cookieHeader.trim() === ""
    ) {
      return next(
        createSocketAuthError(
          "Authentication required.",
          "SOCKET_AUTH_REQUIRED"
        )
      );
    }

    /*
     * STEP 2:
     * Parse the authentication cookie.
     *
     * We reuse the cookie package already installed
     * as a dependency of cookie-parser.
     */
    const cookies = cookieParser.JSONCookies(
      Object.fromEntries(
        cookieHeader.split(";").map((part) => {
          const separator = part.indexOf("=");

          if (separator === -1) {
            return [part.trim(), ""];
          }

          const name = part.slice(0, separator).trim();

          const value = part.slice(separator + 1).trim();

          try {
            return [name, decodeURIComponent(value)];
          } catch {
            return [name, value];
          }
        })
      )
    );

    const token = cookies[ACCESS_COOKIE_NAME];

    if (
      typeof token !== "string" ||
      token.trim() === ""
    ) {
      return next(
        createSocketAuthError(
          "Authentication required.",
          "SOCKET_AUTH_REQUIRED"
        )
      );
    }

    /*
     * STEP 3:
     * Verify the JWT using the existing token service.
     */
    let payload;

    try {
      payload = verifyAccessToken(token);
    } catch {
      return next(
        createSocketAuthError(
          "Invalid or expired authentication session.",
          "SOCKET_INVALID_SESSION"
        )
      );
    }

    const userId = payload.sub;
    const sessionId = payload.sid;

    /*
     * STEP 4:
     * Validate MongoDB identifiers.
     */
    if (
      !mongoose.isValidObjectId(userId) ||
      !mongoose.isValidObjectId(sessionId)
    ) {
      return next(
        createSocketAuthError(
          "Invalid authentication session.",
          "SOCKET_INVALID_SESSION"
        )
      );
    }

    /*
     * STEP 5:
     * Verify the active MongoDB session.
     */
    const session = await getActiveSession(
      sessionId,
      userId
    );

    if (!session) {
      return next(
        createSocketAuthError(
          "Authentication session is expired or revoked.",
          "SOCKET_INVALID_SESSION"
        )
      );
    }

    /*
     * STEP 6:
     * Load the authenticated user.
     */
    const user = await User.findById(userId)
      .select("_id role accountStatus")
      .lean();

    if (!user) {
      return next(
        createSocketAuthError(
          "Invalid authentication session.",
          "SOCKET_INVALID_SESSION"
        )
      );
    }

    /*
     * STEP 7:
     * Reject suspended, banned, or deactivated users.
     */
    if (
      user.accountStatus !== ACCOUNT_STATUSES.ACTIVE
    ) {
      return next(
        createSocketAuthError(
          "Account access is restricted.",
          "SOCKET_ACCOUNT_UNAVAILABLE"
        )
      );
    }

    /*
     * STEP 8:
     * Attach verified identity to the socket.
     *
     * Never attach the raw JWT or password data.
     */
    socket.data.userId = user._id.toString();

    socket.data.sessionId =
      session._id.toString();

    socket.data.role = user.role;

    socket.data.issuedAt = payload.iat;

    socket.data.expiresAt = Math.min(
      payload.exp * 1000,
      session.expiresAt.getTime()
    );

    /*
     * STEP 9:
     * Continue the Socket.IO connection.
     */
    return next();
  } catch {
    return next(
      createSocketAuthError(
        "Unable to authenticate socket connection.",
        "SOCKET_AUTH_FAILED"
      )
    );
  }
};

export default authenticateSocket;
