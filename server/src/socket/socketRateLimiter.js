/**
 * ============================================================
 * PREMIUMCHAT SOCKET.IO RATE LIMITER
 * ============================================================
 *
 * Sliding-window rate limiting.
 *
 * Features:
 * - Per-user rate limits.
 * - Multiple rate-limit policies.
 * - Retry-after information.
 * - Automatic cleanup of expired records.
 *
 * Current implementation:
 * - Single Node.js process.
 * - In-memory storage.
 *
 * Production scaling:
 * - Replace with a shared Redis-backed limiter
 *   when running multiple server instances.
 */

/**
 * Rate-limit policies.
 */
export const SOCKET_RATE_LIMITS = Object.freeze({
  MESSAGE: Object.freeze({
    maxRequests: 10,
    windowMs: 10_000,
  }),

  MESSAGE_BURST: Object.freeze({
    maxRequests: 3,
    windowMs: 2_000,
  }),

  CONVERSATION_JOIN: Object.freeze({
    maxRequests: 20,
    windowMs: 60_000,
  }),
});

/**
 * Store:
 *
 * Map<policy:userId, number[]>
 *
 * Each number represents a request timestamp.
 */
const requestStore = new Map();

/**
 * Periodically remove expired entries.
 *
 * The longest configured window determines
 * how long request timestamps must be retained.
 */
const MAX_WINDOW_MS = Math.max(
  ...Object.values(SOCKET_RATE_LIMITS).map(
    (policy) => policy.windowMs
  )
);

const CLEANUP_INTERVAL_MS = 60_000;

const cleanupExpiredRecords = () => {
  const now = Date.now();

  for (const [key, timestamps] of requestStore) {
    const activeTimestamps = timestamps.filter(
      (timestamp) =>
        now - timestamp < MAX_WINDOW_MS
    );

    if (activeTimestamps.length === 0) {
      requestStore.delete(key);
    } else {
      requestStore.set(key, activeTimestamps);
    }
  }
};

const cleanupTimer = setInterval(
  cleanupExpiredRecords,
  CLEANUP_INTERVAL_MS
);

/**
 * Do not keep Node.js running solely
 * because of the cleanup timer.
 */
cleanupTimer.unref?.();

/**
 * ============================================================
 * CHECK RATE LIMIT
 * ============================================================
 *
 * This function consumes one request when allowed.
 *
 * Returns:
 *
 * {
 *   allowed: boolean,
 *   retryAfterMs: number,
 *   remaining: number
 * }
 */
export const checkSocketRateLimit = ({
  userId,
  policyName,
}) => {
  if (
    typeof userId !== "string" ||
    !userId.trim()
  ) {
    return {
      allowed: false,
      retryAfterMs: 0,
      remaining: 0,
    };
  }

  const policy = SOCKET_RATE_LIMITS[policyName];

  if (!policy) {
    throw new Error(
      `Unknown socket rate-limit policy: ${policyName}`
    );
  }

  const now = Date.now();

  const key = `${policyName}:${userId}`;

  const previousTimestamps =
    requestStore.get(key) ?? [];

  /**
   * Retain only timestamps inside
   * this policy's window.
   */
  const activeTimestamps =
    previousTimestamps.filter(
      (timestamp) =>
        now - timestamp < policy.windowMs
    );

  /**
   * Reject requests exceeding the limit.
   */
  if (
    activeTimestamps.length >=
    policy.maxRequests
  ) {
    const oldestTimestamp =
      activeTimestamps[0];

    const retryAfterMs = Math.max(
      1,
      policy.windowMs -
        (now - oldestTimestamp)
    );

    requestStore.set(
      key,
      activeTimestamps
    );

    return {
      allowed: false,
      retryAfterMs,
      remaining: 0,
    };
  }

  /**
   * Consume one request.
   */
  activeTimestamps.push(now);

  requestStore.set(
    key,
    activeTimestamps
  );

  return {
    allowed: true,

    retryAfterMs: 0,

    remaining:
      policy.maxRequests -
      activeTimestamps.length,
  };
};

/**
 * ============================================================
 * CHECK MULTIPLE POLICIES
 * ============================================================
 *
 * Used when one event must satisfy
 * both sustained and burst limits.
 *
 * All policies are evaluated before
 * any counters are consumed.
 *
 * This avoids consuming a sustained-limit
 * slot when the burst limit rejects a request.
 */
export const checkMultipleSocketRateLimits = ({
  userId,
  policyNames,
}) => {
  if (
    typeof userId !== "string" ||
    !userId.trim()
  ) {
    return {
      allowed: false,
      retryAfterMs: 0,
      remaining: 0,
    };
  }

  if (
    !Array.isArray(policyNames) ||
    policyNames.length === 0
  ) {
    throw new Error(
      "At least one rate-limit policy is required."
    );
  }

  const uniquePolicyNames = [
    ...new Set(policyNames),
  ];

  const now = Date.now();

  const evaluations = uniquePolicyNames.map(
    (policyName) => {
      const policy =
        SOCKET_RATE_LIMITS[policyName];

      if (!policy) {
        throw new Error(
          `Unknown socket rate-limit policy: ${policyName}`
        );
      }

      const key = `${policyName}:${userId}`;

      const activeTimestamps = (
        requestStore.get(key) ?? []
      ).filter(
        (timestamp) =>
          now - timestamp < policy.windowMs
      );

      return {
        policy,
        key,
        activeTimestamps,
      };
    }
  );

  /**
   * Determine whether any policy rejects
   * the request.
   */
  const blockedEvaluations =
    evaluations.filter(
      ({ policy, activeTimestamps }) =>
        activeTimestamps.length >=
        policy.maxRequests
    );

  if (blockedEvaluations.length > 0) {
    const retryAfterMs = Math.max(
      ...blockedEvaluations.map(
        ({ policy, activeTimestamps }) => {
          const oldestTimestamp =
            activeTimestamps[0];

          return Math.max(
            1,
            policy.windowMs -
              (now - oldestTimestamp)
          );
        }
      )
    );

    return {
      allowed: false,
      retryAfterMs,
      remaining: 0,
    };
  }

  /**
   * All policies allow the request.
   *
   * Consume one slot in every policy.
   */
  let remaining = Infinity;

  for (const evaluation of evaluations) {
    evaluation.activeTimestamps.push(now);

    requestStore.set(
      evaluation.key,
      evaluation.activeTimestamps
    );

    remaining = Math.min(
      remaining,
      evaluation.policy.maxRequests -
        evaluation.activeTimestamps.length
    );
  }

  return {
    allowed: true,
    retryAfterMs: 0,
    remaining,
  };
};