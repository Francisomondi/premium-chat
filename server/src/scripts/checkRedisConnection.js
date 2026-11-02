import "dotenv/config";

import {
  connectRedis,
  disconnectRedis,
  redisKey,
} from "../config/redis.js";

const checkRedisConnection = async () => {
  try {
    console.log("Connecting to Upstash Redis...");

    const client = await connectRedis();

    if (!client?.isReady) {
      throw new Error(
        "Redis client did not become ready. Check REDIS_URL and your Upstash connection details."
      );
    }

    console.log("Redis connection successful.");

    const testKey = redisKey(
      "connection-check",
      Date.now()
    );

    await client.set(testKey, "ok", {
      EX: 30,
    });

    const result = await client.get(testKey);

    if (result !== "ok") {
      throw new Error(
        "Redis write/read verification failed."
      );
    }

    await client.del(testKey);

    console.log("Redis read/write verification successful.");
  } catch (error) {
    console.error("Redis connection check failed.");
    console.error("Error:", error.name || "UnknownError");
    console.error("Message:", error.message);

    process.exitCode = 1;
  } finally {
    await disconnectRedis();
  }
};

checkRedisConnection();