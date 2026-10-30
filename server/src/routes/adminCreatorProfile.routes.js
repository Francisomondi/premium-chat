import { Router } from "express";
import { z } from "zod";

import {
  getAdminCreatorProfiles,
  getAdminCreatorProfile,
} from "../controllers/adminCreatorProfile.controller.js";

import {
  requireAuth,
} from "../middleware/auth.middleware.js";

import {
  requireAdmin,
} from "../middleware/authorize.middleware.js";

import {
  validate,
} from "../middleware/validate.middleware.js";

/**
 * ============================================================
 * PREMIUMCHAT — ADMIN CREATOR PROFILE ROUTES
 * ============================================================
 *
 * Intended mount:
 *
 * /api/admin/creator-profiles
 */

const router = Router();

router.use(requireAuth);
router.use(requireAdmin);

const listQuerySchema = z
  .object({
    page: z.coerce
      .number()
      .int()
      .min(1)
      .default(1),

    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .default(20),
  })
  .strict();

const creatorParamsSchema = z.object({
  creatorId: z
    .string()
    .regex(/^[0-9a-fA-F]{24}$/),
});

/**
 * LIST APPROVED CREATORS
 */
router.get(
  "/",
  validate({
    query: listQuerySchema,
  }),
  getAdminCreatorProfiles
);

/**
 * GET CREATOR PROFILE DETAILS
 */
router.get(
  "/:creatorId",
  validate({
    params: creatorParamsSchema,
  }),
  getAdminCreatorProfile
);

export default router;