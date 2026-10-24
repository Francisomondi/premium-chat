
import mongoose from "mongoose";

import User from "../models/User.model.js";

import AppError from "../utils/AppError.js";

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
 * PREMIUMCHAT AUTHENTICATION MIDDLEWARE
 * ============================================================
 *
 * Every protected request must pass:
 *
 * 1. Authentication cookie exists.
 * 2. JWT signature and claims are valid.
 * 3. JWT has not expired.
 * 4. MongoDB session exists and is active.
 * 5. Session belongs to JWT user.
 * 6. User account exists.
 * 7. User account status is ACTIVE.
 *
 * A revoked session is rejected immediately,
 * even when the JWT has not yet expired.
 */

export const requireAuth = async (
  req,
  res,
  next
) => {
  try {
    /**
     * STEP 1: Read HTTP-only cookie.
     */
    const token =
      req.cookies?.[ACCESS_COOKIE_NAME];

    if (
      !token ||
      typeof token !== "string"
    ) {
      throw new AppError(
        "Authentication required.",
        401,
        "AUTH_REQUIRED"
      );
    }

    /**
     * STEP 2: Verify signed JWT.
     */
    let payload;

    try {
      payload = verifyAccessToken(token);
    } catch {
      throw new AppError(
        "Invalid or expired session.",
        401,
        "INVALID_SESSION"
      );
    }

    const userId = payload.sub;
    const sessionId = payload.sid;

    /**
     * STEP 3: Validate identifier formats.
     */
    if (
      !mongoose.isValidObjectId(userId) ||
      !mongoose.isValidObjectId(sessionId)
    ) {
      throw new AppError(
        "Invalid session.",
        401,
        "INVALID_SESSION"
      );
    }

    /**
     * STEP 4: Verify server-side session.
     *
     * getActiveSession checks:
     * - Session ID
     * - User ownership
     * - Revocation status
     * - Expiration
     */
    const session = await getActiveSession(
      sessionId,
      userId
    );

    if (!session) {
      throw new AppError(
        "Invalid or revoked session.",
        401,
        "INVALID_SESSION"
      );
    }

    /**
     * STEP 5: Load authenticated user.
     */
    const user = await User.findById(userId);

    if (!user) {
      throw new AppError(
        "Invalid session.",
        401,
        "INVALID_SESSION"
      );
    }

    /**
     * STEP 6: Check account status.
     */
    if (
      user.accountStatus !==
      ACCOUNT_STATUSES.ACTIVE
    ) {
      throw new AppError(
        "Account access is restricted.",
        403,
        "ACCOUNT_UNAVAILABLE"
      );
    }

    /**
     * STEP 7: Attach authenticated context.
     *
     * Never attach the raw JWT to req.auth.
     */
    req.user = user;

    req.auth = {
      userId: user._id.toString(),
      sessionId: session._id.toString(),
      issuedAt: payload.iat,
    };

    /**
     * STEP 8: Continue to protected controller.
     */
    return next();
  } catch (error) {
    return next(error);
  }
};
