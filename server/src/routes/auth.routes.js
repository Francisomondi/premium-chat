
import { Router } from "express";

import {
  register,
  login,
  logout,
  getMe,
} from "../controllers/auth.controller.js";

import {
  validate,
} from "../middleware/validate.middleware.js";

import {
  authLimiter,
} from "../middleware/rateLimit.middleware.js";

import {
  requireAuth,
} from "../middleware/auth.middleware.js";

import {
  requireTrustedOrigin,
} from "../middleware/csrf.middleware.js";

import {
  registerSchema,
  loginSchema,
} from "../validators/auth.validators.js";

/**
 * ============================================================
 * PREMIUMCHAT AUTHENTICATION ROUTES
 * ============================================================
 *
 * POST /api/auth/register
 * POST /api/auth/login
 * GET  /api/auth/me
 * POST /api/auth/logout
 */

const router = Router();

/**
 * ============================================================
 * REGISTER
 * ============================================================
 *
 * Existing registration route from Step 2.2.
 *
 * Security:
 * - Rate limiting.
 * - Strict Zod validation.
 * - Public users cannot assign themselves roles.
 */

router.post(
  "/register",
  authLimiter,
  validate({
    body: registerSchema,
  }),
  register
);

/**
 * ============================================================
 * LOGIN
 * ============================================================
 *
 * Security:
 * - Trusted frontend origin required.
 * - Rate limiting.
 * - Strict Zod validation.
 * - Password verification in loginUser().
 * - HTTP-only JWT cookie on success.
 */

router.post(
  "/login",
  requireTrustedOrigin,
  authLimiter,
  validate({
    body: loginSchema,
  }),
  login
);

/**
 * ============================================================
 * CURRENT USER
 * ============================================================
 *
 * Requires a valid JWT authentication cookie.
 *
 * requireAuth:
 * - Verifies JWT signature and expiration.
 * - Loads the current user from MongoDB.
 * - Rejects inactive accounts.
 */

router.get(
  "/me",
  requireAuth,
  getMe
);

/**
 * ============================================================
 * LOGOUT
 * ============================================================
 *
 * Clears the authentication cookie.
 *
 * Trusted origin is required to protect
 * against cross-site logout requests.
 */

router.post(
  "/logout",
  requireTrustedOrigin,
  logout
);

export default router;
