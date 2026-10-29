import mongoose from "mongoose";

import MpesaCallbackEvent, {
  MPESA_CALLBACK_EVENT_STATUSES,
} from "../models/MpesaCallbackEvent.model.js";

import MpesaCallbackConflict, {
  MPESA_CALLBACK_CONFLICT_REASONS,
} from "../models/MpesaCallbackConflict.model.js";

import AppError from "../utils/AppError.js";

/**
 * ============================================================
 * PREMIUMCHAT — CALLBACK CONFLICT RECORDING
 * ============================================================
 *
 * MODULE 4.3.5.7.8.13.17.6.7
 *
 * RESPONSIBILITIES:
 *
 * - Record contradictory callback evidence.
 * - Atomically escalate callback to manual review.
 * - Invalidate active reconciliation leases.
 * - Preserve callback conflict history.
 *
 * SECURITY:
 *
 * - No payment verification.
 * - No payment status changes.
 * - No subscription activation.
 * - No premium entitlement changes.
 */

const validString = (value) =>
  typeof value === "string" &&
  value.trim().length > 0;

const fail = (
  message,
  code,
  status = 409
) => {
  throw new AppError(
    message,
    status,
    code
  );
};

/**
 * ============================================================
 * RECORD CALLBACK CONFLICT
 * ============================================================
 */

export const recordMpesaCallbackConflict =
  async ({
    callbackEventId,
    incoming,
    reason,
  } = {}) => {
    if (
      !mongoose.isValidObjectId(
        callbackEventId
      )
    ) {
      fail(
        "Invalid callback event identifier.",
        "INVALID_CALLBACK_EVENT_ID",
        400
      );
    }

    if (
      !incoming ||
      !validString(
        incoming.checkoutRequestId
      ) ||
      !validString(
        incoming.merchantRequestId
      ) ||
      !Number.isInteger(
        incoming.resultCode
      )
    ) {
      fail(
        "Invalid conflicting callback data.",
        "INVALID_CALLBACK_CONFLICT_DATA",
        400
      );
    }

    if (
      !Object.values(
        MPESA_CALLBACK_CONFLICT_REASONS
      ).includes(reason)
    ) {
      fail(
        "Unsupported callback conflict reason.",
        "INVALID_CALLBACK_CONFLICT_REASON",
        400
      );
    }

    let result;

    await mongoose.connection.transaction(
      async (session) => {
        /**
         * STEP 1:
         * Load the existing callback event.
         */

        const event =
          await MpesaCallbackEvent.findById(
            callbackEventId
          ).session(session);

        if (!event) {
          fail(
            "Callback event not found.",
            "CALLBACK_EVENT_NOT_FOUND",
            404
          );
        }

        /**
         * STEP 2:
         * Create an auditable conflict record.
         */

        const now = new Date();

        const conflicts =
          await MpesaCallbackConflict.create(
            [
              {
                callbackEventId:
                  event._id,

                checkoutRequestId:
                  incoming.checkoutRequestId,

                merchantRequestId:
                  incoming.merchantRequestId,

                originalResultCode:
                  event.resultCode,

                conflictingResultCode:
                  incoming.resultCode,

                reason,

                receivedAt:
                  now,
              },
            ],
            {
              session,
            }
          );

        /**
         * STEP 3:
         * Escalate callback to manual review.
         *
         * Clear the current reconciliation lease
         * so the previous lease holder cannot
         * finalize the callback afterward.
         */

        const updated =
          await MpesaCallbackEvent.updateOne(
            {
              _id:
                event._id,

              __v:
                event.__v,
            },
            {
              $set: {
                hasConflict:
                  true,

                lastConflictAt:
                  now,

                lastConflictReason:
                  reason,

                status:
                  MPESA_CALLBACK_EVENT_STATUSES.MANUAL_REVIEW,

                manualReviewRequiredAt:
                  event.manualReviewRequiredAt ||
                  now,

                manualReviewReason:
                  "CONFLICTING_CALLBACK_DELIVERY",

                nextAttemptAt:
                  null,

                leaseOwner:
                  null,

                leaseExpiresAt:
                  null,
              },

              $inc: {
                conflictCount: 1,

                __v: 1,
              },
            },
            {
              session,
            }
          );

        if (
          updated.modifiedCount !== 1
        ) {
          fail(
            "Callback changed during conflict recording.",
            "CALLBACK_CONFLICT_WRITE_CONFLICT"
          );
        }

        /**
         * STEP 4:
         * Return conflict recording result.
         */

        result = {
          recorded: true,

          callbackEventId:
            event._id.toString(),

          conflictId:
            conflicts[0]._id.toString(),

          reason,

          status:
            MPESA_CALLBACK_EVENT_STATUSES.MANUAL_REVIEW,

          requiresManualReview:
            true,

          paymentVerified:
            false,

          subscriptionActivated:
            false,
        };
      }
    );

    return result;
  };

export default {
  recordMpesaCallbackConflict,
};