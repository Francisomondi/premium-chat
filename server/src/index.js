import "dotenv/config";

import { createServer } from "node:http";

import app from "./app.js";

import { env } from "./config/env.js";

import {
  connectDB,
  disconnectDB,
} from "./config/db.js";

/**
 * ============================================================
 * HTTP SERVER
 * ============================================================
 *
 * Socket.IO will attach to this HTTP server in the
 * real-time chat module.
 */

const httpServer = createServer(app);

let isShuttingDown = false;
let shutdownPromise = null;

/*
 * ============================================================
 * GRACEFUL SHUTDOWN
 * ============================================================
 */

const shutdown = (signal) => {
  if (shutdownPromise) {
    return shutdownPromise;
  }

  isShuttingDown = true;

  console.log(`${signal} received. Shutting down...`);

  shutdownPromise = (async () => {
    const forceExitTimer = setTimeout(() => {
      console.error("Forced shutdown after timeout.");
      process.exit(1);
    }, 10000);

    forceExitTimer.unref();

    let exitCode = 0;

    try {
      if (httpServer.listening) {
        await new Promise((resolve, reject) => {
          httpServer.close((error) => {
            if (error) {
              reject(error);
            } else {
              resolve();
            }
          });
        });

        console.log("HTTP server closed.");
      }

      await disconnectDB();

      console.log("Shutdown completed successfully.");
    } catch (error) {
      exitCode = 1;

      console.error(
        "Error during shutdown:",
        error.message
      );

      try {
        await disconnectDB();
      } catch (dbError) {
        console.error(
          "Database shutdown error:",
          dbError.message
        );
      }
    } finally {
      clearTimeout(forceExitTimer);
      process.exit(exitCode);
    }
  })();

  return shutdownPromise;
};

/*
 * ============================================================
 * SERVER ERROR HANDLING
 * ============================================================
 */

httpServer.on("error", (error) => {
  console.error("HTTP server error:", error.message);

  if (!isShuttingDown) {
    shutdown("HTTP_SERVER_ERROR");
  }
});

/*
 * ============================================================
 * START APPLICATION
 * ============================================================
 */

const startServer = async () => {
  try {
    console.log("==================================");
    console.log(" PREMIUM CHAT BACKEND");
    console.log("==================================");

    // Connect to MongoDB before accepting requests.
    await connectDB();

    if (isShuttingDown) {
      return;
    }

    await new Promise((resolve, reject) => {
      const onListeningError = (error) => {
        httpServer.off("error", onListeningError);
        reject(error);
      };

      httpServer.once("error", onListeningError);

      httpServer.listen(env.PORT, () => {
        httpServer.off("error", onListeningError);
        resolve();
      });
    });

    if (isShuttingDown) {
      return;
    }

    console.log("==================================");
    console.log(`Environment: ${env.NODE_ENV}`);
    console.log(`Server: http://localhost:${env.PORT}`);
    console.log(`API: http://localhost:${env.PORT}/api`);
    console.log(
      `Health: http://localhost:${env.PORT}/api/health`
    );
    console.log(
      `Database: http://localhost:${env.PORT}/api/health/db`
    );
    console.log("MongoDB: Connected");
    console.log("==================================");
  } catch (error) {
    console.error(
      "Application startup failed:",
      error.message
    );

    process.exitCode = 1;

    try {
      await disconnectDB();
    } catch (disconnectError) {
      console.error(
        "Cleanup failed:",
        disconnectError.message
      );
    }

    process.exit(1);
  }
};

/*
 * ============================================================
 * PROCESS SIGNAL HANDLERS
 * ============================================================
 */

process.on("SIGINT", () => {
  shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  shutdown("SIGTERM");
});

/*
 * ============================================================
 * BOOTSTRAP
 * ============================================================
 */

startServer();