import {
  S3Client,
} from "@aws-sdk/client-s3";

/**
 * ============================================================
 * PREMIUMCHAT — PRIVATE S3 STORAGE CONFIGURATION
 * ============================================================
 *
 * SECURITY:
 *
 * - Never expose S3 credentials to the frontend.
 * - Never configure public-read access.
 * - Use private buckets.
 * - Keep original media inaccessible through
 *   unrestricted public URLs.
 */

const requiredVariables = [
  "S3_ENDPOINT",
  "S3_REGION",
  "S3_BUCKET",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
];

const missingVariables =
  requiredVariables.filter(
    (name) => !process.env[name]?.trim()
  );

/**
 * Do not initialize an unusable client.
 *
 * Storage is optional during initial application
 * startup, but any storage operation must fail
 * closed until configuration is complete.
 */

export const isMediaStorageConfigured =
  missingVariables.length === 0;

export const MEDIA_STORAGE_BUCKET =
  process.env.S3_BUCKET || null;

export const getMediaStorageConfigStatus = () => ({
  configured: isMediaStorageConfigured,
  missingVariables: [...missingVariables],
});

export const mediaStorageClient =
  isMediaStorageConfigured
    ? new S3Client({
        region: process.env.S3_REGION,

        endpoint: process.env.S3_ENDPOINT,

        forcePathStyle:
          process.env.S3_FORCE_PATH_STYLE !==
          "false",

        credentials: {
          accessKeyId:
            process.env.S3_ACCESS_KEY_ID,

          secretAccessKey:
            process.env.S3_SECRET_ACCESS_KEY,
        },

        maxAttempts: 3,
      })
    : null;

/**
 * ============================================================
 * REQUIRE STORAGE CONFIGURATION
 * ============================================================
 */

export const requireMediaStorage = () => {
  if (
    !isMediaStorageConfigured ||
    !mediaStorageClient ||
    !MEDIA_STORAGE_BUCKET
  ) {
    const error = new Error(
      "Private media storage is not configured."
    );

    error.statusCode = 503;
    error.code = "MEDIA_STORAGE_UNAVAILABLE";

    throw error;
  }

  return {
    client: mediaStorageClient,
    bucket: MEDIA_STORAGE_BUCKET,
  };
};

export default mediaStorageClient;