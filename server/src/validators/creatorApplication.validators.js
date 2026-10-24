
import { z } from "zod";

/**
 * ============================================================
 * PREMIUMCHAT CREATOR APPLICATION VALIDATORS
 * ============================================================
 *
 * A registered user may request creator access.
 *
 * Submitting an application must NEVER:
 * - Assign the CREATOR role.
 * - Approve the application.
 * - Mark age verification as complete.
 * - Grant access to paid creator features.
 *
 * All approval decisions belong to authorized
 * backend workflows.
 */

/**
 * ============================================================
 * SUBMIT CREATOR APPLICATION
 * ============================================================
 *
 * POST /api/creator/applications
 *
 * Expected body:
 *
 * {
 *   "motivation": "I want to create educational content..."
 * }
 */

export const submitCreatorApplicationSchema = z
  .object({
    motivation: z
      .string({
        required_error: "Application motivation is required.",
      })
      .trim()
      .min(
        30,
        "Please provide at least 30 characters describing your creator plans."
      )
      .max(
        1000,
        "Application motivation cannot exceed 1000 characters."
      ),
  })
  .strict();

/**
 * ============================================================
 * ADMINISTRATOR APPLICATION REVIEW
 * ============================================================
 *
 * Future endpoint:
 *
 * PATCH /api/admin/creator-applications/:userId
 *
 * Only authorized administrators may approve
 * or reject creator applications.
 *
 * The userId identifies the applicant.
 */

export const reviewCreatorApplicationParamsSchema = z
  .object({
    userId: z
      .string()
      .regex(
        /^[0-9a-fA-F]{24}$/,
        "A valid applicant ID is required."
      ),
  })
  .strict();

/**
 * ============================================================
 * ADMINISTRATOR REVIEW DECISION
 * ============================================================
 *
 * The client may submit a review decision,
 * but only the backend can authorize it.
 *
 * We deliberately do not accept:
 * - role
 * - reviewedBy
 * - ageVerification
 * - accountStatus
 */

export const reviewCreatorApplicationSchema = z
  .object({
    decision: z.enum(
      ["APPROVE", "REJECT"],
      {
        message:
          "Decision must be APPROVE or REJECT.",
      }
    ),
  })
  .strict();
