import {
  createClient,
} from "redis";

/**
 * ============================================================
 * PREMIUMCHAT — REDIS CONFIGURATION
 * ============================================================
 *
 * Redis responsibilities:
 *
 * - Shared rate limiting
 * - Temporary upload state
 * - Short-lived caching
 * - Future Socket.IO scaling
 *
 * IMPORTANT:
 *
 * Redis is not the source of truth for
 * payment transactions or media purchases.
 */

const redisUrl =
  process.env.REDIS_URL?.trim() || "";

const redisKeyPrefix =
  process.env.REDIS_KEY_PREFIX?.trim() ||
  "premiumchat:";

let redisClient = null;

let connectionPromise = null;

/**
 * ============================================================
 * GET REDIS CLIENT
 * ============================================================
 */

export const getRedisClient = () => {
  return redisClient;
};

/**
 * ============================================================
 * CONNECT REDIS
 * ============================================================
 */

export const connectRedis = async () => {
  if (!redisUrl) {
    console.warn(
      "[Redis] REDIS_URL is not configured."
    );

    return null;
  }

  if (
    redisClient?.isReady
  ) {
    return redisClient;
  }

  if (connectionPromise) {
    return connectionPromise;
  }

  const client = createClient({
    url: redisUrl,

    socket: {
      connectTimeout: 10000,

      reconnectStrategy: (retries) => {
        if (retries >= 5) {
          return new Error(
            "Redis reconnection attempts exceeded."
          );
        }

        return Math.min(
          retries * 200,
          3000
        );
      },
    },
  });

  client.on("error", (error) => {
    console.error(
      "[Redis] Connection error:",
      error.message
    );
  });

  client.on("ready", () => {
    console.info(
      "[Redis] Connection ready."
    );
  });

  client.on("end", () => {
    console.info(
      "[Redis] Connection closed."
    );
  });

  redisClient = client;

  connectionPromise = client
    .connect()
    .then(() => client)
    .catch(async (error) => {
      console.error(
        "[Redis] Unable to connect:",
        error.message
      );

      redisClient = null;

      try {
        if (client.isOpen) {
          await client.disconnect();
        }
      } catch {
        // Connection cleanup is best-effort.
      }

      return null;
    })
    .finally(() => {
      connectionPromise = null;
    });

  return connectionPromise;
};

/**
 * ============================================================
 * REQUIRE REDIS
 * ============================================================
 *
 * Security-sensitive operations must not
 * silently bypass Redis when it is required.
 */

export const requireRedis = () => {
  if (!redisClient?.isReady) {
    const error = new Error(
      "Redis is currently unavailable."
    );

    error.statusCode = 503;
    error.code = "REDIS_UNAVAILABLE";

    throw error;
  }

  return redisClient;
};

/**
 * ============================================================
 * BUILD NAMESPACED REDIS KEYS
 * ============================================================
 */

export const redisKey = (...parts) => {
  return (
    redisKeyPrefix +
    parts.map(String).join(":")
  );
};

/**
 * ============================================================
 * DISCONNECT REDIS
 * ============================================================
 */

export const disconnectRedis = async () => {
  if (!redisClient) {
    return;
  }

  const client = redisClient;

  redisClient = null;

  if (client.isOpen) {
    await client.quit();
  }
};

export default {
  connectRedis,
  getRedisClient,
  requireRedis,
  redisKey,
  disconnectRedis,
};