
/**
 * ============================================================
 * ENVIRONMENT CONFIGURATION
 * ============================================================
 */

const getRequiredEnv = (key) => {
  const value = process.env[key]?.trim();

  if (!value) {
    throw new Error(
      `Missing required environment variable: ${key}`
    );
  }

  return value;
};

const getPositiveInteger = (key, fallback) => {
  const raw = process.env[key];

  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }

  const value = Number(raw);

  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(
      `${key} must be a positive integer.`
    );
  }

  return value;
};

const validateMongoUri = (uri) => {
  if (
    !uri.startsWith("mongodb://") &&
    !uri.startsWith("mongodb+srv://")
  ) {
    throw new Error(
      "MONGODB_URI must be a MongoDB connection URI."
    );
  }

  const placeholders = [
    "USERNAME",
    "PASSWORD",
    "YOUR_CLUSTER",
    "example.mongodb.net",
  ];

  if (placeholders.some((value) => uri.includes(value))) {
    throw new Error(
      "Replace the placeholder values in MONGODB_URI."
    );
  }

  return uri;
};

const parseTrustProxy = (value) => {
  const normalized = (value || "false").trim();

  if (normalized === "false") return false;

  const hops = Number(normalized);

  if (
    !Number.isSafeInteger(hops) ||
    hops < 1 ||
    hops > 10
  ) {
    throw new Error(
      "TRUST_PROXY must be false or a positive hop count (1–10)."
    );
  }

  return hops;
};

/**
 * ============================================================
 * JWT CONFIGURATION VALIDATION
 * ============================================================
 */

const validateJwtSecret = (secret) => {
  if (
    typeof secret !== "string" ||
    secret.trim().length < 64
  ) {
    throw new Error(
      "JWT_ACCESS_SECRET must contain at least 64 characters."
    );
  }

  return secret.trim();
};

const validateJwtExpiry = (value) => {
  const expiry = value?.trim() || "15m";

  // Step 2.3 uses a fixed 15-minute access-token
  // lifetime. Other durations require reviewing
  // the cookie and token expiration together.
  if (expiry !== "15m") {
    throw new Error(
      "JWT_ACCESS_EXPIRES_IN must currently be 15m."
    );
  }

  return expiry;
};

/**
 * ============================================================
 * NODE ENVIRONMENT
 * ============================================================
 */

const nodeEnv =
  process.env.NODE_ENV?.trim() || "development";

if (
  !["development", "test", "production"].includes(nodeEnv)
) {
  throw new Error("Invalid NODE_ENV.");
}

/**
 * ============================================================
 * SERVER PORT
 * ============================================================
 */

const port = getPositiveInteger("PORT", 5000);

if (port > 65535) {
  throw new Error("PORT must not exceed 65535.");
}

/**
 * ============================================================
 * CLIENT URL VALIDATION
 * ============================================================
 */

const clientUrls = (
  process.env.CLIENT_URL || "http://localhost:5173"
)
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean);

if (clientUrls.length === 0) {
  throw new Error("CLIENT_URL cannot be empty.");
}

for (const clientUrl of clientUrls) {
  let parsed;

  try {
    parsed = new URL(clientUrl);
  } catch {
    throw new Error(`Invalid CLIENT_URL: ${clientUrl}`);
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("CLIENT_URL must use HTTP or HTTPS.");
  }

  if (
    nodeEnv === "production" &&
    parsed.protocol !== "https:"
  ) {
    throw new Error(
      "Production CLIENT_URL must use HTTPS."
    );
  }

  if (
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash ||
    parsed.origin !== clientUrl
  ) {
    throw new Error(
      "CLIENT_URL must contain only an origin, without a path or trailing slash."
    );
  }
}

/**
 * ============================================================
 * API PREFIX
 * ============================================================
 */

const apiPrefix =
  process.env.API_PREFIX?.trim() || "/api";

if (apiPrefix !== "/api") {
  throw new Error(
    "This application currently requires API_PREFIX=/api."
  );
}

/**
 * ============================================================
 * REQUEST BODY LIMITS
 * ============================================================
 */

const jsonBodyLimit =
  process.env.JSON_BODY_LIMIT?.trim() || "1mb";

const urlencodedBodyLimit =
  process.env.URLENCODED_BODY_LIMIT?.trim() || "1mb";

const validBodyLimit = /^\d+(b|kb|mb)$/i;

if (
  !validBodyLimit.test(jsonBodyLimit) ||
  !validBodyLimit.test(urlencodedBodyLimit)
) {
  throw new Error(
    "Body limits must use formats such as 100kb or 1mb."
  );
}

/**
 * ============================================================
 * JWT SETTINGS
 * ============================================================
 */

const jwtAccessSecret = validateJwtSecret(
  getRequiredEnv("JWT_ACCESS_SECRET")
);

const jwtAccessExpiresIn = validateJwtExpiry(
  process.env.JWT_ACCESS_EXPIRES_IN
);

/**
 * ============================================================
 * EXPORTED ENVIRONMENT CONFIGURATION
 * ============================================================
 */

export const env = Object.freeze({
  NODE_ENV: nodeEnv,
  IS_PRODUCTION: nodeEnv === "production",

  PORT: port,
  API_PREFIX: apiPrefix,
  CLIENT_URLS: clientUrls,

  MONGODB_URI: validateMongoUri(
    getRequiredEnv("MONGODB_URI")
  ),

  DB_SERVER_SELECTION_TIMEOUT_MS:
    getPositiveInteger(
      "DB_SERVER_SELECTION_TIMEOUT_MS",
      10000
    ),

  TRUST_PROXY: parseTrustProxy(
    process.env.TRUST_PROXY
  ),

  JSON_BODY_LIMIT: jsonBodyLimit,
  URLENCODED_BODY_LIMIT: urlencodedBodyLimit,

  GLOBAL_RATE_LIMIT_WINDOW_MS:
    getPositiveInteger(
      "GLOBAL_RATE_LIMIT_WINDOW_MS",
      900000
    ),

  GLOBAL_RATE_LIMIT_MAX:
    getPositiveInteger(
      "GLOBAL_RATE_LIMIT_MAX",
      300
    ),

  AUTH_RATE_LIMIT_WINDOW_MS:
    getPositiveInteger(
      "AUTH_RATE_LIMIT_WINDOW_MS",
      900000
    ),

  AUTH_RATE_LIMIT_MAX:
    getPositiveInteger(
      "AUTH_RATE_LIMIT_MAX",
      10
    ),

  /**
   * JWT AUTHENTICATION
   */
  JWT_ACCESS_SECRET: jwtAccessSecret,
  JWT_ACCESS_EXPIRES_IN: jwtAccessExpiresIn,
});
