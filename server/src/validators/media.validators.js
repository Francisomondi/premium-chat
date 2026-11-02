import { z } from "zod";

import {
  MEDIA_ACCESS_POLICIES,
} from "../constants/mediaAccess.constants.js";

const objectIdSchema = z
  .string()
  .regex(/^[a-f\d]{24}$/i, "Invalid ID.");

const mediaTypeSchema = z.enum([
  "IMAGE",
  "VIDEO",
]);

const mimeTypeSchema = z.enum([
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/webm",
]);

const currencySchema = z.enum([
  "KES",
  "USD",
]);

const accessPolicySchema = z.enum(
  Object.values(MEDIA_ACCESS_POLICIES)
);

/**
 * POST /api/media/uploads
 *
 * Creates a private upload intent.
 */
export const createMediaUploadSchema = z
  .object({
    conversationId: objectIdSchema,

    mediaType: mediaTypeSchema,

    mimeType: mimeTypeSchema,

    fileSize: z
      .number()
      .int()
      .positive()
      .max(209715200),

    accessPolicy: accessPolicySchema,

    priceMinor: z
      .number()
      .int()
      .nonnegative()
      .default(0),

    currency: currencySchema.default("KES"),

    rightsConfirmed: z.literal(true),

    allDepictedAdultsAndConsented: z.literal(true),

    attestationVersion: z.string().trim().min(1).max(30),
  })
  .strict();

/**
 * POST /api/media/:mediaId/complete
 */
export const mediaIdParamsSchema = z
  .object({
    mediaId: objectIdSchema,
  })
  .strict();