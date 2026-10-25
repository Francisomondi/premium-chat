
import "dotenv/config";

import { createServer } from "node:http";

import app from "./app.js";

import { env } from "./config/env.js";

import {
  connectDB,
  disconnectDB,
} from "./config/db.js";

import {
  initializeSocketServer,
  closeSocketServer,
} from "./socket/socket.server.js";

/**
 * ============================================================
 * PREMIUMCHAT HTTP + SOCKET.IO SERVER
 * ============================================================
 *
 * Express and Socket.IO share the same HTTP server.
 *
 * Socket authentication will be implemented in
 * Module 3.2. Until then, all socket connections
 * are rejected by the Socket.IO middleware.
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
      /*
       * Socket.IO closes its connections and may
       * also close the underlying HTTP server.
       *
       * Close it before attempting to close HTTP.
       */
      await closeSocketServer();

      /*
       * If Socket.IO has already closed HTTP,
       * do not attempt to close it again.
       */
      if (httpServer.listening) {
        await new Promise((resolve, reject) => {
          httpServer.close((error) => {
            if (
              error &&
              error.code !== "ERR_SERVER_NOT_RUNNING"
            ) {
              reject(error);
            } else {
              resolve();
            }
          });
        });
      }

      console.log("HTTP server closed.");

      await disconnectDB();

      console.log("Shutdown completed successfully.");
    } catch (error) {
      exitCode = 1;

      console.error(
        "Error during shutdown:",
        error.message
      );

      /*
       * Best-effort cleanup if an earlier
       * shutdown operation failed.
       */
      try {
        if (httpServer.listening) {
          await new Promise((resolve, reject) => {
            httpServer.close((closeError) => {
              if (
                closeError &&
                closeError.code !== "ERR_SERVER_NOT_RUNNING"
              ) {
                reject(closeError);
              } else {
                resolve();
              }
            });
          });
        }
      } catch (httpError) {
        console.error(
          "HTTP shutdown error:",
          httpError.message
        );
      }

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
  console.error(
    "HTTP server error:",
    error.message
  );

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

    /*
     * Connect to MongoDB before accepting
     * HTTP requests or Socket.IO connections.
     */
    await connectDB();

    if (isShuttingDown) {
      return;
    }

    /*
     * Attach Socket.IO to the existing
     * HTTP server before it starts listening.
     */
    initializeSocketServer(httpServer);

    if (isShuttingDown) {
      return;
    }

    await new Promise((resolve, reject) => {
      const onListeningError = (error) => {
        httpServer.off(
          "error",
          onListeningError
        );

        reject(error);
      };

      httpServer.once(
        "error",
        onListeningError
      );

      httpServer.listen(env.PORT, () => {
        httpServer.off(
          "error",
          onListeningError
        );

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
    console.log("Socket.IO: Initialized");
    console.log("Socket authentication: Pending");
    console.log("MongoDB: Connected");
    console.log("==================================");
  } catch (error) {
    console.error(
      "Application startup failed:",
      error.message
    );

    process.exitCode = 1;

    /*
     * Cleanup Socket.IO and HTTP before
     * disconnecting MongoDB.
     */
    try {
      await closeSocketServer();
    } catch (socketError) {
      console.error(
        "Socket.IO cleanup failed:",
        socketError.message
      );
    }

    try {
      if (httpServer.listening) {
        await new Promise((resolve, reject) => {
          httpServer.close((closeError) => {
            if (
              closeError &&
              closeError.code !== "ERR_SERVER_NOT_RUNNING"
            ) {
              reject(closeError);
            } else {
              resolve();
            }
          });
        });
      }
    } catch (httpError) {
      console.error(
        "HTTP cleanup failed:",
        httpError.message
      );
    }

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
