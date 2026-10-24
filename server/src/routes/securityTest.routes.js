import { Router } from "express";

import { validate } from "../middleware/validate.middleware.js";

import {
  securityTestBodySchema,
} from "../validators/common.validators.js";

const router = Router();

/**
 * ============================================================
 * POST /api/dev/validate
 * ============================================================
 *
 * Development-only endpoint for testing Zod validation.
 *
 * Does not save or process user data.
 */

router.post(
  "/validate",

  validate({
    body: securityTestBodySchema,
  }),

  (req, res) => {
    return res.status(200).json({
      success: true,
      message: "Request validation passed.",
      data: req.validated.body,
      requestId: req.requestId,
    });
  }
);

export default router;