
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

import { env } from "../config/env.js";

/**
 * ============================================================
 * PREMIUMCHAT JWT TOKEN SERVICE
 * ============================================================
 *
 * Each access token identifies:
 *
 * sub = authenticated user ID
 * sid = server-side authentication session ID
 *
 * Tokens without a valid session ID are rejected.
 */

export const ACCESS_COOKIE_NAME =
  "premiumchat_access";

const JWT_ISSUER = "premiumchat-api";
const JWT_AUDIENCE = "premiumchat-web";

export const ACCESS_TOKEN_SECONDS = 15 * 60;

/**
 * ============================================================
 * ACCESS COOKIE OPTIONS
 * ============================================================
 */

export const accessCookieOptions = Object.freeze({
  httpOnly: true,
  secure: env.IS_PRODUCTION,
  sameSite: "lax",
  path: "/api",
  maxAge: ACCESS_TOKEN_SECONDS * 1000,
});

/**
 * ============================================================
 * SIGN ACCESS TOKEN
 * ============================================================
 *
 * @param {Object} user - Mongoose user document
 * @param {string|ObjectId} sessionId
 *
 * @returns {string} Signed JWT
 */

export const signAccessToken = (
  user,
  sessionId
) => {
  if (
    !user?._id ||
    !mongoose.isValidObjectId(user._id)
  ) {
    throw new Error(
      "Cannot generate access token without a valid user ID."
    );
  }

  if (!mongoose.isValidObjectId(sessionId)) {
    throw new Error(
      "Cannot generate access token without a valid session ID."
    );
  }

  return jwt.sign(
    {
      sub: user._id.toString(),
      sid: sessionId.toString(),
      tokenType: "access",
    },
    env.JWT_ACCESS_SECRET,
    {
      algorithm: "HS256",
      expiresIn: ACCESS_TOKEN_SECONDS,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    }
  );
};

/**
 * ============================================================
 * VERIFY ACCESS TOKEN
 * ============================================================
 *
 * Validates:
 * - Signature
 * - Algorithm
 * - Expiration
 * - Issuer
 * - Audience
 * - Token type
 * - User ID
 * - Session ID
 *
 * Database session validation happens separately
 * inside authentication middleware.
 */

export const verifyAccessToken = (token) => {
  if (
    typeof token !== "string" ||
    token.trim() === ""
  ) {
    throw new Error(
      "Access token is required."
    );
  }

  const payload = jwt.verify(
    token,
    env.JWT_ACCESS_SECRET,
    {
      algorithms: ["HS256"],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    }
  );

  if (
    typeof payload !== "object" ||
    payload.tokenType !== "access" ||
    !mongoose.isValidObjectId(payload.sub) ||
    !mongoose.isValidObjectId(payload.sid)
  ) {
    throw new Error(
      "Invalid access token payload."
    );
  }

  return payload;
};

/**
 * ============================================================
 * SET ACCESS COOKIE
 * ============================================================
 */

export const setAccessCookie = (
  res,
  token
) => {
  res.cookie(
    ACCESS_COOKIE_NAME,
    token,
    accessCookieOptions
  );
};

/**
 * ============================================================
 * CLEAR ACCESS COOKIE
 * ============================================================
 */

export const clearAccessCookie = (res) => {
  const {
    maxAge,
    ...clearOptions
  } = accessCookieOptions;

  res.clearCookie(
    ACCESS_COOKIE_NAME,
    clearOptions
  );
};
