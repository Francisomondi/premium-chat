import cors from "cors";
import helmet from "helmet";

import { env } from "./env.js";

/**
 * ============================================================
 * HELMET SECURITY HEADERS
 * ============================================================
 */

export const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },

  crossOriginResourcePolicy: {
    policy: "same-site",
  },
});

/**
 * ============================================================
 * CORS CONFIGURATION
 * ============================================================
 */

export const corsMiddleware = cors({
  origin(origin, callback) {
    // Requests without an Origin header may be accepted
    // by CORS, but still require normal API authorization.
    if (!origin) {
      return callback(null, true);
    }

    if (env.CLIENT_URLS.includes(origin)) {
      return callback(null, true);
    }

    const error = new Error(
      "Origin not allowed by CORS."
    );

    error.statusCode = 403;
    error.code = "CORS_ORIGIN_DENIED";

    return callback(error);
  },

  credentials: true,

  methods: [
    "GET",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "OPTIONS",
  ],

  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Request-ID",
  ],

  maxAge: 600,
});