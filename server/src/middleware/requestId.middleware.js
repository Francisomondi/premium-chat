import { randomUUID } from "node:crypto";

/**
 * ============================================================
 * REQUEST IDENTIFICATION
 * ============================================================
 */

export const requestIdMiddleware = (req, res, next) => {
  const requestId = randomUUID();

  req.requestId = requestId;

  res.setHeader("X-Request-ID", requestId);

  next();
};