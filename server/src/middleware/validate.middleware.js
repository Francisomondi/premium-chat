import { ZodError } from "zod";

import AppError from "../utils/AppError.js";

/**
 * ============================================================
 * REQUEST VALIDATION MIDDLEWARE
 * ============================================================
 *
 * Validates body, params, and query values.
 *
 * Validated data is stored in req.validated.
 * We do not overwrite req.query, which is read-only
 * in modern Express versions.
 */

export const validate = (schemas = {}) => {
  return (req, res, next) => {
    try {
      const validated = {};

      for (const key of ["body", "params", "query"]) {
        if (!schemas[key]) continue;

        validated[key] = schemas[key].parse(req[key]);
      }

      req.validated = validated;

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          success: false,
          message: "Request validation failed.",
          code: "VALIDATION_ERROR",
          requestId: req.requestId,
          errors: error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        });
      }

      next(
        new AppError(
          "Unable to validate request.",
          500,
          "VALIDATION_INTERNAL_ERROR"
        )
      );
    }
  };
};