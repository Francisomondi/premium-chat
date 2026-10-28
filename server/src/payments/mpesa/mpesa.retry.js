/**
 * ============================================================
 * PREMIUMCHAT — M-PESA RECONCILIATION RETRY POLICY
 * ============================================================
 *
 * Module 4.3.5.7.8.13.14
 *
 * - Exponential retry backoff.
 * - Maximum retry attempts.
 * - Bounded retry delay.
 * - No automatic STK Push retries.
 */

export const MPESA_RECONCILIATION_POLICY =
  Object.freeze({
    MAX_ATTEMPTS: 8,

    BASE_DELAY_MS: 60 * 1000,

    MAX_DELAY_MS: 60 * 60 * 1000,

    LEASE_DURATION_MS: 2 * 60 * 1000,
  });

/**
 * ============================================================
 * CALCULATE RETRY DELAY
 * ============================================================
 *
 * Attempt 1: 1 minute
 * Attempt 2: 2 minutes
 * Attempt 3: 4 minutes
 * Attempt 4: 8 minutes
 * Attempt 5: 16 minutes
 * Attempt 6: 32 minutes
 * Attempt 7: 60 minutes
 * Attempt 8: Manual review
 */

export const calculateMpesaRetryDelay = (
  attemptCount
) => {
  if (
    !Number.isSafeInteger(attemptCount) ||
    attemptCount < 1
  ) {
    throw new Error(
      "Retry attempt count must be a positive integer."
    );
  }

  const exponent =
    Math.min(attemptCount - 1, 20);

  const delay =
    MPESA_RECONCILIATION_POLICY.BASE_DELAY_MS *
    2 ** exponent;

  return Math.min(
    delay,
    MPESA_RECONCILIATION_POLICY.MAX_DELAY_MS
  );
};

/**
 * ============================================================
 * SHOULD REQUIRE MANUAL REVIEW
 * ============================================================
 */

export const requiresMpesaManualReview = (
  attemptCount
) => {
  return (
    Number.isSafeInteger(attemptCount) &&
    attemptCount >=
      MPESA_RECONCILIATION_POLICY.MAX_ATTEMPTS
  );
};

/**
 * ============================================================
 * NEXT RETRY TIME
 * ============================================================
 */

export const calculateMpesaNextAttemptAt = ({
  attemptCount,
  now = new Date(),
} = {}) => {
  if (
    !(now instanceof Date) ||
    Number.isNaN(now.getTime())
  ) {
    throw new Error(
      "Invalid retry calculation date."
    );
  }

  const delay =
    calculateMpesaRetryDelay(
      attemptCount
    );

  return new Date(
    now.getTime() + delay
  );
};