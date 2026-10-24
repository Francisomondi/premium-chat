import mongoose from "mongoose";

import { env } from "./env.js";

/**
 * ============================================================
 * MONGODB CONNECTION MANAGER
 * ============================================================
 */

let listenersRegistered = false;
let connectionPromise = null;

/*
 * ============================================================
 * REGISTER CONNECTION EVENT LISTENERS
 * ============================================================
 */

const registerConnectionListeners = () => {
  if (listenersRegistered) return;

  listenersRegistered = true;

  mongoose.connection.on("connected", () => {
    console.log("MongoDB connection established.");
  });

  mongoose.connection.on("disconnected", () => {
    console.warn("MongoDB connection lost.");
  });

  mongoose.connection.on("reconnected", () => {
    console.log("MongoDB connection restored.");
  });

  mongoose.connection.on("error", (error) => {
    console.error("MongoDB connection error:", error.message);
  });
};

/*
 * ============================================================
 * CONNECT TO MONGODB
 * ============================================================
 */

export const connectDB = async () => {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (connectionPromise) {
    return connectionPromise;
  }

  registerConnectionListeners();

  connectionPromise = (async () => {
    try {
      console.log("Connecting to MongoDB Atlas...");

      await mongoose.connect(env.MONGODB_URI, {
        serverSelectionTimeoutMS:
          env.DB_SERVER_SELECTION_TIMEOUT_MS,

        maxPoolSize: 20,

        minPoolSize: 0,

        maxIdleTimeMS: 30000,

        autoIndex: !env.IS_PRODUCTION,
      });

      console.log(
        `MongoDB database: ${mongoose.connection.name}`
      );

      return mongoose.connection;
    } catch (error) {
      console.error(
        "MongoDB initial connection failed:",
        error.message
      );

      throw error;
    } finally {
      connectionPromise = null;
    }
  })();

  return connectionPromise;
};

/*
 * ============================================================
 * DISCONNECT FROM MONGODB
 * ============================================================
 */

export const disconnectDB = async () => {
  if (mongoose.connection.readyState === 0) {
    return;
  }

  console.log("Closing MongoDB connection...");

  await mongoose.disconnect();

  console.log("MongoDB connection closed.");
};

/*
 * ============================================================
 * DATABASE STATUS
 * ============================================================
 */

export const getDatabaseStatus = () => {
  const states = {
    0: "disconnected",
    1: "connected",
    2: "connecting",
    3: "disconnecting",
  };

  const readyState = mongoose.connection.readyState;

  return {
    status: states[readyState] || "unknown",
    connected: readyState === 1,
  };
};

/*
 * ============================================================
 * DATABASE PING
 * ============================================================
 */

export const pingDatabase = async () => {
  if (mongoose.connection.readyState !== 1) {
    return false;
  }

  try {
    const result = await mongoose.connection.db.admin().ping();

    return result.ok === 1;
  } catch (error) {
    console.error("MongoDB ping failed:", error.message);
    return false;
  }
};