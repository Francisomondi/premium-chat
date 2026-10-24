import { z } from "zod";

/**
 * ============================================================
 * PREMIUMCHAT REGISTRATION VALIDATION
 * ============================================================
 *
 * Only these three fields are accepted.
 *
 * Clients cannot submit:
 * role, accountStatus, ageVerification,
 * creatorApplication, or passwordHash.
 */

export const registerSchema = z
  .object({
    displayName: z
      .string()
      .trim()
      .min(2, "Display name must contain at least 2 characters.")
      .max(100, "Display name cannot exceed 100 characters."),

    email: z
      .string()
      .trim()
      .toLowerCase()
      .max(254, "Email address is too long.")
      .email("Please provide a valid email address."),

    password: z
      .string()
      .min(12, "Password must contain at least 12 characters.")
      .refine(
        (password) => Buffer.byteLength(password, "utf8") <= 72,
        "Password must not exceed 72 UTF-8 bytes."
      ),
  })
  .strict();




  
/**
 * ============================================================
 * LOGIN REQUEST VALIDATION
 * ============================================================
 *
 * POST /api/auth/login
 *
 * Expected request body:
 * {
 *   email: "user@example.com",
 *   password: "user-password"
 * }
 *
 * Security:
 * - Rejects missing credentials.
 * - Validates email format.
 * - Normalizes email to lowercase.
 * - Rejects unexpected request fields.
 * - Does not expose password information.
 */

export const loginSchema = z
  .object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .max(254)
      .email("Please provide a valid email address."),

    password: z
      .string()
      .min(1, "Password is required.")
      .max(1024, "Password input is too long."),
  })
  .strict();
