import { Router } from "express";

import {
  getDatabaseStatus,
  pingDatabase,
} from "../config/db.js";

const router = Router();

/**
 * ============================================================
 * BASIC HEALTH CHECK
 * GET /api/health
 * ============================================================
 *
 * Checks whether the Express process is alive.
 */

router.get("/", (req, res) => {
  return res.status(200).json({
    success: true,
    message: "Premium Chat API is running.",
    data: {
      status: "healthy",
      environment: process.env.NODE_ENV,
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
    },
  });
});

/**
 * ============================================================
 * DATABASE READINESS CHECK
 * GET /api/health/db
 * ============================================================
 *
 * Checks Mongoose connection state and database ping.
 */

router.get("/db", async (req, res) => {
  const database = getDatabaseStatus();

  if (!database.connected) {
    return res.status(503).json({
      success: false,
      message: "Database is not ready.",
      data: {
        database: database.status,
      },
    });
  }

  const isResponsive = await pingDatabase();

  if (!isResponsive) {
    return res.status(503).json({
      success: false,
      message: "Database is not responding.",
      data: {
        database: "unavailable",
      },
    });
  }

  return res.status(200).json({
    success: true,
    message: "Database is connected and responding.",
    data: {
      database: "connected",
      timestamp: new Date().toISOString(),
    },
  });
});

export default router;