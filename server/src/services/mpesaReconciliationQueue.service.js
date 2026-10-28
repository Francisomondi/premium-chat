import { randomUUID } from "node:crypto";

import MpesaCallbackEvent, {
  MPESA_CALLBACK_EVENT_STATUSES,
} from "../models/MpesaCallbackEvent.model.js";

import {
  MPESA_RECONCILIATION_POLICY,
  calculateMpesaNextAttemptAt,
  requiresMpesaManualReview,
} from "../payments/mpesa/mpesa.retry.js";

/**
 * ============================================================
 * PREMIUMCHAT — M-PESA RECONCILIATION QUEUE
 * ============================================================
 *
 * Responsibilities:
 *
 * - Atomically claim eligible events.
 * - Prevent concurrent processing.
 * - Schedule retries.
 * - Recover expired leases.
 * - Escalate exhausted attempts.
 *
 * SECURITY:
 *
 * - Does not initiate STK Push.
 * - Does not verify financial settlement.
 * - Does not activate subscriptions.
 */

const CLAIMABLE_STATUSES = [
  MPESA_CALLBACK_EVENT_STATUSES.RECEIVED,
  MPESA_CALLBACK_EVENT_STATUSES.RETRY_SCHEDULED,
  MPESA_CALLBACK_EVENT_STATUSES.UNRESOLVED,
];

/**
 * ============================================================
 * CLAIM NEXT EVENT
 * ============================================================
 */

export const claimNextMpesaReconciliationEvent =
  async ({
    workerId,
    now = new Date(),
  } = {}) => {
    if (
      typeof workerId !== "string" ||
      workerId.length < 1 ||
      workerId.length > 60
    ) {
      throw new Error(
        "Invalid reconciliation worker identifier."
      );
    }

    const leaseOwner =
      `${workerId}:${randomUUID()}`;

    const leaseExpiresAt = new Date(
      now.getTime() +
        MPESA_RECONCILIATION_POLICY.LEASE_DURATION_MS
    );

    /**
     * Atomic claim:
     *
     * Eligible if:
     *
     * - Retry is due.
     * - No active lease exists.
     * - Status is claimable.
     *
     * An expired PROCESSING lease may
     * also be recovered.
     */

    const event =
      await MpesaCallbackEvent.findOneAndUpdate(
        {
          $and: [
            {
              $or: [
                {
                  status: {
                    $in: CLAIMABLE_STATUSES,
                  },
                },
                {
                  status:
                    MPESA_CALLBACK_EVENT_STATUSES.PROCESSING,

                  leaseExpiresAt: {
                    $lte: now,
                  },
                },
              ],
            },
            {
              $or: [
                {
                  nextAttemptAt: {
                    $lte: now,
                  },
                },
                {
                  nextAttemptAt: null,
                },
              ],
            },
            {
              $or: [
                {
                  leaseExpiresAt: null,
                },
                {
                  leaseExpiresAt: {
                    $lte: now,
                  },
                },
              ],
            },
          ],
        },
        {
          $set: {
            status:
              MPESA_CALLBACK_EVENT_STATUSES.PROCESSING,

            leaseOwner,

            leaseExpiresAt,

            reconciliationAttemptedAt:
              now,
          },

          $inc: {
            attemptCount: 1,
            __v: 1,
          },
        },
        {
          new: true,

          sort: {
            nextAttemptAt: 1,
            receivedAt: 1,
          },
        }
      );

    return event;
  };

/**
 * ============================================================
 * FINALIZE RECONCILIATION
 * ============================================================
 *
 * Only the lease holder can finalize.
 */

export const finalizeMpesaReconciliationEvent =
  async ({
    event,
    result,
    now = new Date(),
  } = {}) => {
    if (!event?._id || !event.leaseOwner) {
      throw new Error(
        "A claimed event is required."
      );
    }

    const attemptCount =
      event.attemptCount;

    const providerOutcomeConclusive =
      result?.checked === true &&
      [
        "QUERY_SUCCESS",
        "QUERY_FAILURE",
      ].includes(result.evidenceStatus);

    const hasConflict =
      event.hasConflict ||
      result?.evidenceStatus === "CONFLICT";

    let status;

    let nextAttemptAt = null;

    let manualReviewReason = null;

    if (hasConflict) {
      status =
        MPESA_CALLBACK_EVENT_STATUSES.MANUAL_REVIEW;

      manualReviewReason =
        "CALLBACK_PROVIDER_CONFLICT";
    } else if (providerOutcomeConclusive) {
      status =
        MPESA_CALLBACK_EVENT_STATUSES.RECONCILED;
    } else if (
      requiresMpesaManualReview(attemptCount)
    ) {
      status =
        MPESA_CALLBACK_EVENT_STATUSES.MANUAL_REVIEW;

      manualReviewReason =
        "MAX_RECONCILIATION_ATTEMPTS";
    } else {
      status =
        MPESA_CALLBACK_EVENT_STATUSES.RETRY_SCHEDULED;

      nextAttemptAt =
        calculateMpesaNextAttemptAt({
          attemptCount,
          now,
        });
    }

    const updated =
      await MpesaCallbackEvent.findOneAndUpdate(
        {
          _id: event._id,

          status:
            MPESA_CALLBACK_EVENT_STATUSES.PROCESSING,

          leaseOwner:
            event.leaseOwner,

          leaseExpiresAt: {
            $gt: now,
          },
        },
        {
          $set: {
            status,

            nextAttemptAt,

            leaseOwner: null,

            leaseExpiresAt: null,

            reconciledAt:
              status ===
              MPESA_CALLBACK_EVENT_STATUSES.RECONCILED
                ? now
                : null,

            manualReviewRequiredAt:
              status ===
              MPESA_CALLBACK_EVENT_STATUSES.MANUAL_REVIEW
                ? now
                : null,

            manualReviewReason,

            lastErrorCode:
              result?.reason || null,
          },

          $inc: {
            __v: 1,
          },
        },
        {
          new: true,
        }
      );

    if (!updated) {
      return {
        finalized: false,
        reason: "LEASE_LOST",
      };
    }

    return {
      finalized: true,

      status:
        updated.status,

      attemptCount:
        updated.attemptCount,

      nextAttemptAt:
        updated.nextAttemptAt,
    };
  };