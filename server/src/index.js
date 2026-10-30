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

import {
  startMpesaStkReconciliationWorker,
  stopMpesaStkReconciliationWorker,
} from "./workers/mpesaStkReconciliation.worker.js";

/**
 * ============================================================
 * PREMIUMCHAT — HTTP + SOCKET.IO SERVER
 * ============================================================
 *
 * STEP 19.8.15.5
 *
 * Responsibilities:
 *
 * - Connect MongoDB.
 * - Initialize Socket.IO.
 * - Start HTTP server.
 * - Start M-Pesa reconciliation worker.
 * - Handle server errors.
 * - Gracefully shut down all services.
 *
 * STARTUP ORDER:
 *
 * 1. MongoDB
 * 2. Socket.IO
 * 3. HTTP server
 * 4. M-Pesa reconciliation worker
 *
 * SHUTDOWN ORDER:
 *
 * 1. Stop M-Pesa worker
 * 2. Close Socket.IO
 * 3. Close HTTP server
 * 4. Disconnect MongoDB
 *
 * SECURITY:
 *
 * - Worker never activates subscriptions directly.
 * - Worker never trusts callback financial claims.
 * - Worker uses authenticated Daraja STK Query.
 * - Financial verification remains independent.
 */

const httpServer = createServer(app);

let isShuttingDown = false;

let shutdownPromise = null;

/**
 * ============================================================
 * CLOSE HTTP SERVER
 * ============================================================
 */

const closeHttpServer = async () => {
  if (!httpServer.listening) {
    return;
  }

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
};

/**
 * ============================================================
 * GRACEFUL SHUTDOWN
 * ============================================================
 */

const shutdown = (signal) => {
  if (shutdownPromise) {
    return shutdownPromise;
  }

  isShuttingDown = true;

  console.log(
    `${signal} received. Shutting down...`
  );

  shutdownPromise = (async () => {
    const forceExitTimer = setTimeout(() => {
      console.error(
        "Forced shutdown after timeout."
      );

      process.exit(1);
    }, 10_000);

    forceExitTimer.unref();

    let exitCode = 0;

    /**
     * Track cleanup independently.
     *
     * A failure in one component should
     * not prevent cleanup of the others.
     */

    try {
      /**
       * STEP 1 — STOP M-PESA WORKER
       *
       * Stop scheduling reconciliation cycles
       * and wait for the current cycle.
       *
       * MongoDB must remain connected while
       * the worker finishes.
       */

      try {
        await stopMpesaStkReconciliationWorker();

        console.log(
          "M-Pesa reconciliation worker stopped."
        );
      } catch (workerError) {
        exitCode = 1;

        console.error(
          "M-Pesa worker shutdown error:",
          workerError.message
        );
      }

      /**
       * STEP 2 — CLOSE SOCKET.IO
       */

      try {
        await closeSocketServer();

        console.log(
          "Socket.IO server closed."
        );
      } catch (socketError) {
        exitCode = 1;

        console.error(
          "Socket.IO shutdown error:",
          socketError.message
        );
      }

      /**
       * STEP 3 — CLOSE HTTP SERVER
       */

      try {
        await closeHttpServer();

        console.log(
          "HTTP server closed."
        );
      } catch (httpError) {
        exitCode = 1;

        console.error(
          "HTTP shutdown error:",
          httpError.message
        );
      }

      /**
       * STEP 4 — DISCONNECT MONGODB
       */

      try {
        await disconnectDB();

        console.log(
          "MongoDB disconnected."
        );
      } catch (dbError) {
        exitCode = 1;

        console.error(
          "Database shutdown error:",
          dbError.message
        );
      }

      if (exitCode === 0) {
        console.log(
          "Shutdown completed successfully."
        );
      }
    } finally {
      clearTimeout(forceExitTimer);

      process.exit(exitCode);
    }
  })();

  return shutdownPromise;
};

/**
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

/**
 * ============================================================
 * START APPLICATION
 * ============================================================
 */

const startServer = async () => {
  try {
    console.log(
      "=================================="
    );

    console.log(
      " PREMIUM CHAT BACKEND"
    );

    console.log(
      "=================================="
    );

    /**
     * STEP 1 — CONNECT MONGODB
     *
     * MongoDB must be connected before
     * starting HTTP or background workers.
     */

    await connectDB();

    if (isShuttingDown) {
      return;
    }

    console.log(
      "MongoDB: Connected"
    );

    /**
     * STEP 2 — INITIALIZE SOCKET.IO
     *
     * Express and Socket.IO share
     * the same HTTP server.
     */

    initializeSocketServer(httpServer);

    if (isShuttingDown) {
      return;
    }

    /**
     * STEP 3 — START HTTP SERVER
     */

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

      httpServer.listen(
        env.PORT,
        () => {
          httpServer.off(
            "error",
            onListeningError
          );

          resolve();
        }
      );
    });

    if (isShuttingDown) {
      return;
    }

    /**
     * STEP 4 — START M-PESA WORKER
     *
     * The worker reads its enabled flag
     * from the environment.
     *
     * It starts only after MongoDB
     * and HTTP initialization succeed.
     */

    const mpesaWorkerStarted =
      startMpesaStkReconciliationWorker();

    if (isShuttingDown) {
      return;
    }

    /**
     * STEP 5 — STARTUP SUMMARY
     */

    console.log(
      "=================================="
    );

    console.log(
      `Environment: ${env.NODE_ENV}`
    );

    console.log(
      `Server: http://localhost:${env.PORT}`
    );

    console.log(
      `API: http://localhost:${env.PORT}/api`
    );

    console.log(
      `Health: http://localhost:${env.PORT}/api/health`
    );

    console.log(
      `Database: http://localhost:${env.PORT}/api/health/db`
    );

    console.log(
      "Socket.IO: Initialized"
    );

    console.log(
      "MongoDB: Connected"
    );

    console.log(
      `M-Pesa STK Worker: ${
        mpesaWorkerStarted
          ? "Running"
          : "Disabled"
      }`
    );

    console.log(
      "=================================="
    );
  } catch (error) {
    console.error(
      "Application startup failed:",
      error.message
    );

    process.exitCode = 1;

    /**
     * ========================================================
     * STARTUP FAILURE CLEANUP
     * ========================================================
     *
     * Stop the worker before disconnecting
     * MongoDB, even if startup failed.
     */

    try {
      await stopMpesaStkReconciliationWorker();
    } catch (workerError) {
      console.error(
        "M-Pesa worker cleanup failed:",
        workerError.message
      );
    }

    /**
     * Close Socket.IO.
     */

    try {
      await closeSocketServer();
    } catch (socketError) {
      console.error(
        "Socket.IO cleanup failed:",
        socketError.message
      );
    }

    /**
     * Close HTTP server.
     */

    try {
      await closeHttpServer();
    } catch (httpError) {
      console.error(
        "HTTP cleanup failed:",
        httpError.message
      );
    }

    /**
     * Disconnect MongoDB.
     */

    try {
      await disconnectDB();
    } catch (disconnectError) {
      console.error(
        "MongoDB cleanup failed:",
        disconnectError.message
      );
    }

    process.exit(1);
  }
};

/**
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

/**
 * ============================================================
 * BOOTSTRAP
 * ============================================================
 */

startServer();