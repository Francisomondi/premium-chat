import { z } from "zod";

/**
 * ============================================================
 * SHARED VALIDATORS
 * ============================================================
 */

export const mongoIdSchema = z
  .string()
  .regex(
    /^[a-fA-F0-9]{24}$/,
    "Invalid MongoDB document ID."
  );

export const paginationSchema = z.object({
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
}).strict();

export const securityTestBodySchema = z.object({
  name: z
    .string()
    .trim()
    .min(2)
    .max(100),

  message: z
    .string()
    .trim()
    .min(1)
    .max(500),
}).strict();