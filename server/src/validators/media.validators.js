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

const uploadDestinationSchema = z.enum([
  "CONVERSATION",
  "GALLERY",
]);

/**
 * POST /api/media/uploads
 *
 * Creates a private upload intent.
 *
 * CONVERSATION:
 * - Requires conversationId.
 *
 * GALLERY:
 * - Must not include conversationId.
 */
export const createMediaUploadSchema = z
  .object({
    destination: uploadDestinationSchema.default("CONVERSATION"),

    conversationId: objectIdSchema.optional(),

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
  .strict()
  .superRefine((data, ctx) => {
    if (
      data.destination === "CONVERSATION" &&
      !data.conversationId
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["conversationId"],
        message: "A conversation ID is required for conversation uploads.",
      });
    }

    if (
      data.destination === "GALLERY" &&
      data.conversationId
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["conversationId"],
        message: "Gallery uploads must not include a conversation ID.",
      });
    }
  });

/**
 * POST /api/media/:mediaId/complete
 */
export const mediaIdParamsSchema = z
  .object({
    mediaId: objectIdSchema,
  })
  .strict();