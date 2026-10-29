import mongoose from "mongoose";

import MpesaCallbackEvent, {
  MPESA_CALLBACK_EVENT_STATUSES,
} from "../models/MpesaCallbackEvent.model.js";

import {
  MPESA_EVIDENCE_STATUSES,
} from "../models/MpesaPaymentEvidence.model.js";

/**
 * ============================================================
 * PREMIUMCHAT — RECONCILIATION CONFLICT COORDINATION
 * ============================================================
 *
 * MODULE 4.3.5.7.8.13.17.6.8
 *
 * PURPOSE:
 *
 * Escalate conflicting provider-query evidence
 * without granting financial entitlement.
 *
 * SECURITY:
 *
 * - No payment success assignment.
 * - No subscription activation.
 * - No premium content authorization.
 * - No callback lease takeover.
 *
 * A conflict must not be overwritten by
 * a concurrent reconciliation finalization.
 */

const isValidId = (value) =>
  mongoose.isObjectIdOrHexString(value);

/**
 * ============================================================
 * ESCALATE PROVIDER-QUERY CONFLICT
 * ============================================================
 */

export const escalateMpesaReconciliationConflict =
  async ({
    callbackEventId,
    evidenceStatus,
    reason,
  } = {}) => {
    if (!isValidId(callbackEventId)) {
      return {
        escalated: false,
        reason: "INVALID_CALLBACK_EVENT_ID",
      };
    }

    if (
      evidenceStatus !==
      MPESA_EVIDENCE_STATUSES.CONFLICT
    ) {
      return {
        escalated: false,
        reason: "NO_RECONCILIATION_CONFLICT",
      };
    }

    const now = new Date();

    /**
     * Atomically mark the callback for
     * manual review.
     *
     * This invalidates any existing lease.
     *
     * A concurrent worker finalization
     * must use status + leaseOwner +
     * hasConflict conditions.
     */

    const updated =
      await MpesaCallbackEvent.findOneAndUpdate(
        {
          _id: callbackEventId,

          hasConflict: false,
        },
        {
          $set: {
            hasConflict: true,

            status:
              MPESA_CALLBACK_EVENT_STATUSES.MANUAL_REVIEW,

            lastConflictAt: now,

            lastConflictReason:
              reason ||
              "PROVIDER_QUERY_CONFLICT",

            manualReviewRequiredAt: now,

            manualReviewReason:
              "CALLBACK_PROVIDER_CONFLICT",

            nextAttemptAt: null,

            leaseOwner: null,

            leaseExpiresAt: null,
          },

          $inc: {
            conflictCount: 1,
            __v: 1,
          },
        },
        {
          new: true,
        }
      );

    if (updated) {
      return {
        escalated: true,

        callbackEventId:
          updated._id.toString(),

        status:
          updated.status,

        requiresManualReview: true,
      };
    }

    /**
     * Another worker may have already
     * escalated the event.
     */

    const existing =
      await MpesaCallbackEvent.findById(
        callbackEventId
      );

    if (
      existing?.hasConflict &&
      existing.status ===
        MPESA_CALLBACK_EVENT_STATUSES.MANUAL_REVIEW
    ) {
      return {
        escalated: true,

        alreadyEscalated: true,

        callbackEventId:
          existing._id.toString(),

        status:
          existing.status,

        requiresManualReview: true,
      };
    }

    return {
      escalated: false,
      reason: "CALLBACK_CONFLICT_ESCALATION_FAILED",
    };
  };