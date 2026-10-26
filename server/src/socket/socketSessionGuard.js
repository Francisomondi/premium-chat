
import User from "../models/User.model.js";

import {
  ACCOUNT_STATUSES,
} from "../constants/account.constants.js";

import {
  getActiveSession,
} from "../services/session.service.js";
import {
  disconnectSocket,
} from "./socketRegistry.js";
/**
 * ============================================================
 * PREMIUMCHAT SOCKET SESSION GUARD
 * ============================================================
 *
 * Responsibilities:
 *
 * 1. Enforce authenticated session expiration.
 * 2. Detect revoked or expired MongoDB sessions.
 * 3. Detect suspended, banned, or deleted accounts.
 * 4. Provide reusable validation for protected events.
 *
 * This module does not authorize conversation access.
 * Messaging permissions must be checked separately.
 */

const SESSION_CHECK_INTERVAL_MS = 30 * 1000;

/**
 * ============================================================
 * VALIDATE AN ACTIVE SOCKET SESSION
 * ============================================================
 */

export const validateSocketSession = async (socket) => {
  const {
    userId,
    sessionId,
    expiresAt,
  } = socket.data ?? {};

  if (
    typeof userId !== "string" ||
    typeof sessionId !== "string" ||
    !Number.isFinite(expiresAt)
  ) {
    return false;
  }

  if (Date.now() >= expiresAt) {
    return false;
  }

  const session = await getActiveSession(
    sessionId,
    userId
  );

  if (!session) {
    return false;
  }

  const user = await User.findById(userId)
    .select("_id role accountStatus")
    .lean();

  if (
    !user ||
    user.accountStatus !== ACCOUNT_STATUSES.ACTIVE
  ) {
    return false;
  }

  /*
   * Keep the role synchronized with the database.
   * This does not replace per-event authorization.
   */
  socket.data.role = user.role;

  return true;
};

/**
 * ============================================================
 * DISCONNECT INVALID AUTHENTICATION SESSION
 * ============================================================
 */

const disconnectInvalidSocket = (socket) => {
  disconnectSocket(socket, {
    code: "SOCKET_SESSION_INVALID",

    message:
      "Your authentication session has expired or is no longer valid.",
  });
};
/**
 * ============================================================
 * START SESSION MONITORING
 * ============================================================
 *
 * Called after Socket.IO authentication succeeds.
 *
 * Returns a cleanup function for the socket's
 * disconnect handler.
 */

export const startSocketSessionGuard = (socket) => {
  const expiresAt = socket.data?.expiresAt;

  if (
    !Number.isFinite(expiresAt) ||
    expiresAt <= Date.now()
  ) {
    disconnectInvalidSocket(socket);

    return () => {};
  }

  let stopped = false;
  let checkInProgress = false;

  /*
   * Disconnect at the exact authenticated
   * expiration time, subject to timer scheduling.
   */
  const remainingMs = expiresAt - Date.now();

  const expirationTimer = setTimeout(() => {
    disconnectInvalidSocket(socket);
  }, remainingMs);

  /*
   * Revalidate the MongoDB session and user
   * account periodically.
   */
  const intervalTimer = setInterval(async () => {
    if (
      stopped ||
      !socket.connected ||
      checkInProgress
    ) {
      return;
    }

    checkInProgress = true;

    try {
      const valid = await validateSocketSession(
        socket
      );

      if (!stopped && !valid) {
        disconnectInvalidSocket(socket);
      }
    } catch (error) {
      console.error(
        "Socket session validation failed:",
        error.message
      );

      /*
       * Fail closed if authentication state
       * cannot be verified.
       */
      if (!stopped) {
        disconnectInvalidSocket(socket);
      }
    } finally {
      checkInProgress = false;
    }
  }, SESSION_CHECK_INTERVAL_MS);

  /**
   * ==========================================================
   * CLEANUP
   * ==========================================================
   */

  const cleanup = () => {
    if (stopped) {
      return;
    }

    stopped = true;

    clearTimeout(expirationTimer);
    clearInterval(intervalTimer);
  };

  socket.once("disconnect", cleanup);

  return cleanup;
};

/**
 * ============================================================
 * REQUIRE VALID SESSION FOR PROTECTED EVENTS
 * ============================================================
 *
 * Future messaging handlers should call this before
 * performing database mutations or emitting messages.
 *
 * Session validation is necessary but not sufficient:
 * handlers must also verify conversation membership,
 * account permissions, and message ownership.
 */

export const requireValidSocketSession = async (
  socket
) => {
  try {
    const valid = await validateSocketSession(
      socket
    );

    if (!valid) {
      disconnectInvalidSocket(socket);

      return false;
    }

    return socket.connected;
  } catch (error) {
    console.error(
      "Protected socket session check failed:",
      error.message
    );

    disconnectInvalidSocket(socket);

    return false;
  }
};
