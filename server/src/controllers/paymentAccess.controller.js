import mongoose from "mongoose";

import PaymentTransaction from "../models/PaymentTransaction.model.js";

import {
  authorizeSubscriberAccess,
} from "../services/subscriptionAuthorization.service.js";

/**
 * ============================================================
 * PREMIUMCHAT — PAYMENT ACCESS CONTROLLER
 * ============================================================
 *
 * STEP 18.33
 *
 * SECURITY:
 *
 * - Requires an authenticated user.
 * - Users can inspect only their own payments.
 * - No payment initiation.
 * - No settlement recording.
 * - No subscription activation.
 * - No sensitive provider credentials returned.
 */

const validId = (value) =>
  typeof value === "string" &&
  mongoose.isObjectIdOrHexString(value);

const sameId = (a, b) =>
  Boolean(a && b) &&
  a.toString() === b.toString();

/**
 * ============================================================
 * GET PAYMENT STATUS
 * ============================================================
 *
 * GET /api/payments/:paymentId/status
 */

export const getPaymentAccessStatus = async (
  req,
  res,
  next
) => {
  try {
    const userId = req.user?.id?.toString();
    const { paymentId } = req.params;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    if (!validId(paymentId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment identifier.",
      });
    }

    const payment =
      await PaymentTransaction.findById(paymentId)
        .select(
          "_id payerId creatorId subscriptionId " +
          "provider purpose amountMinor currency " +
          "status verificationStatus " +
          "createdAt paidAt entitlementAppliedAt"
        )
        .lean();

    /*
     * Return the same response for missing payments
     * and payments belonging to another user.
     */

    if (
      !payment ||
      !sameId(payment.payerId, userId)
    ) {
      return res.status(404).json({
        success: false,
        message: "Payment not found.",
      });
    }

    /*
     * Entitlement authorization is independent
     * of the payment's displayed status.
     */

    let access = {
      authorized: false,
      hasAccess: false,
      reason: "ENTITLEMENT_NOT_AVAILABLE",
      expiresAt: null,
    };

    if (payment.creatorId) {
      access = await authorizeSubscriberAccess({
        subscriberId: userId,
        creatorId:
          payment.creatorId.toString(),
      });
    }

    return res.status(200).json({
      success: true,

      payment: {
        id: payment._id.toString(),

        provider: payment.provider,
        purpose: payment.purpose,

        amountMinor: payment.amountMinor,
        currency: payment.currency,

        status: payment.status,

        verificationStatus:
          payment.verificationStatus,

        createdAt: payment.createdAt,
        paidAt: payment.paidAt,

        entitlementApplied:
          Boolean(payment.entitlementAppliedAt),
      },

      entitlement: {
        hasAccess: access.authorized === true,
        expiresAt: access.expiresAt ?? null,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * ============================================================
 * GET CREATOR SUBSCRIPTION ACCESS
 * ============================================================
 *
 * GET /api/subscriptions/access/:creatorId
 */

export const getCreatorSubscriptionAccess = async (
  req,
  res,
  next
) => {
  try {
    const subscriberId =
      req.user?.id?.toString();

    const { creatorId } = req.params;

    if (!subscriberId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    if (!validId(creatorId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid creator identifier.",
      });
    }

    const result =
      await authorizeSubscriberAccess({
        subscriberId,
        creatorId,
      });

    /*
     * A read-only access check returns 200
     * with hasAccess=false for denied access.
     *
     * Actual protected-content routes must
     * return 403 when authorization fails.
     */

    return res.status(200).json({
      success: true,

      entitlement: {
        hasAccess: result.authorized === true,

        subscriptionId:
          result.authorized
            ? result.subscriptionId
            : null,

        expiresAt:
          result.authorized
            ? result.expiresAt
            : null,
      },
    });
  } catch (error) {
    next(error);
  }
};

export default {
  getPaymentAccessStatus,
  getCreatorSubscriptionAccess,
};