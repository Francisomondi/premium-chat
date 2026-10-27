/**
 * ============================================================
 * PREMIUMCHAT — SUBSCRIPTION BILLING PERIOD UTILITIES
 * ============================================================
 *
 * Calendar-aware UTC monthly billing.
 *
 * SECURITY:
 *
 * - Billing periods are calculated server-side.
 * - Client-provided dates are never trusted.
 * - Invalid dates are rejected.
 */

/**
 * ============================================================
 * VALIDATE DATE
 * ============================================================
 */

const assertValidDate = (date) => {
  if (
    !(date instanceof Date) ||
    Number.isNaN(date.getTime())
  ) {
    throw new TypeError(
      "A valid Date instance is required."
    );
  }
};

/**
 * ============================================================
 * ADD CALENDAR MONTHS
 * ============================================================
 *
 * Examples:
 *
 * January 31 -> February 28
 * January 31 -> February 29 in leap years
 * March 30 -> April 30
 *
 * The optional anchorDay preserves the original
 * billing day across successive renewals.
 */

export const addCalendarMonthsUTC = (
  date,
  months = 1,
  anchorDay = date?.getUTCDate()
) => {
  assertValidDate(date);

  if (
    !Number.isSafeInteger(months) ||
    months < 1
  ) {
    throw new TypeError(
      "Months must be a positive integer."
    );
  }

  if (
    !Number.isInteger(anchorDay) ||
    anchorDay < 1 ||
    anchorDay > 31
  ) {
    throw new TypeError(
      "Billing anchor day must be between 1 and 31."
    );
  }

  const targetMonth = new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth() + months,
      1,
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds()
    )
  );

  const lastDayOfTargetMonth =
    new Date(
      Date.UTC(
        targetMonth.getUTCFullYear(),
        targetMonth.getUTCMonth() + 1,
        0
      )
    ).getUTCDate();

  const billingDay = Math.min(
    anchorDay,
    lastDayOfTargetMonth
  );

  targetMonth.setUTCDate(
    billingDay
  );

  return targetMonth;
};

/**
 * ============================================================
 * CALCULATE INITIAL BILLING PERIOD
 * ============================================================
 */

export const calculateInitialBillingPeriod = (
  startDate = new Date()
) => {
  assertValidDate(startDate);

  const periodStart =
    new Date(startDate.getTime());

  const anchorDay =
    periodStart.getUTCDate();

  const periodEnd =
    addCalendarMonthsUTC(
      periodStart,
      1,
      anchorDay
    );

  return {
    periodStart,
    periodEnd,
    anchorDay,
  };
};

/**
 * ============================================================
 * CALCULATE RENEWAL BILLING PERIOD
 * ============================================================
 *
 * Preserves an existing paid period.
 *
 * If the current period is still active,
 * renewal begins at its end.
 *
 * If the current period has expired,
 * renewal begins at the current time.
 *
 * IMPORTANT:
 *
 * anchorDay must come from a trusted
 * server-stored billing anchor.
 */

export const calculateRenewalBillingPeriod =
  ({
    currentPeriodEnd,
    now = new Date(),
    anchorDay,
  }) => {
    assertValidDate(
      currentPeriodEnd
    );

    assertValidDate(now);

    if (
      !Number.isInteger(anchorDay) ||
      anchorDay < 1 ||
      anchorDay > 31
    ) {
      throw new TypeError(
        "A valid stored billing anchor day is required."
      );
    }

    const periodStart =
      currentPeriodEnd > now
        ? new Date(
            currentPeriodEnd.getTime()
          )
        : new Date(
            now.getTime()
          );

    const periodEnd =
      addCalendarMonthsUTC(
        periodStart,
        1,
        anchorDay
      );

    return {
      periodStart,
      periodEnd,
      anchorDay,
    };
  };