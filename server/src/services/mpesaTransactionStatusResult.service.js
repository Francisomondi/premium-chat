import { createHash } from "node:crypto";

import PaymentTransaction from "../models/PaymentTransaction.model.js";

import {
  PAYMENT_PROVIDERS,
} from "../constants/payment.constants.js";

/**
 * ============================================================
 * PREMIUMCHAT — M-PESA TRANSACTION STATUS RESULT SERVICE
 * ============================================================
 *
 * Module 4.3.5.7.8.13.25
 *
 * Handles:
 * - Transaction Status result notifications.
 * - Transaction Status timeout notifications.
 * - Conversation identifier correlation.
 * - Duplicate notification detection.
 * - Conflicting notification escalation.
 *
 * SECURITY:
 * - Incoming HTTP notifications are untrusted.
 * - No financial verification is performed here.
 * - No payment or subscription is activated here.
 */

const validIdentifier = (value) =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= 255;

const validReceipt = (value) =>
  typeof value === "string" &&
  /^[A-Za-z0-9]{8,30}$/.test(value);

const isObject = (value) =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value);

/**
 * Extract provider notification identifiers.
 *
 * Transaction Status result notifications
 * normally contain a Result object.
 *
 * Timeout notifications may use a different
 * structure. Both must provide enough
 * information for strict correlation.
 */

const parseNotification = (payload, type) => {
  if (!isObject(payload)) {
    return {
      valid: false,
      reason: "INVALID_NOTIFICATION_PAYLOAD",
    };
  }

  const body =
    type === "RESULT"
      ? payload.Result
      : isObject(payload.Result)
        ? payload.Result
        : payload;

  if (!isObject(body)) {
    return {
      valid: false,
      reason: "INVALID_NOTIFICATION_BODY",
    };
  }

  const conversationId =
    body.ConversationID;

  const originatorConversationId =
    body.OriginatorConversationID;

  if (
    !validIdentifier(conversationId) ||
    !validIdentifier(originatorConversationId)
  ) {
    return {
      valid: false,
      reason: "INVALID_CONVERSATION_IDENTIFIERS",
    };
  }

  if (
    type === "RESULT" &&
    !(
      typeof body.ResultCode === "number" &&
      Number.isSafeInteger(body.ResultCode)
    )
  ) {
    return {
      valid: false,
      reason: "INVALID_RESULT_CODE",
    };
  }

  return {
    valid: true,
    conversationId,
    originatorConversationId,
    resultCode:
      type === "RESULT"
        ? body.ResultCode
        : null,
  };
};

/**
 * Build a deterministic fingerprint.
 *
 * Hashing the received JSON provides duplicate
 * detection, not authentication.
 */

const digestNotification = (payload, type) =>
  createHash("sha256")
    .update(
      JSON.stringify({
        type,
        payload,
      })
    )
    .digest("hex");

/**
 * ============================================================
 * PROCESS NOTIFICATION
 * ============================================================
 */

export const processMpesaTransactionStatusNotification =
  async ({
    payload,
    type,
  } = {}) => {
    if (!["RESULT", "TIMEOUT"].includes(type)) {
      return {
        processed: false,
        reason: "INVALID_NOTIFICATION_TYPE",
      };
    }

    const parsed = parseNotification(
      payload,
      type
    );

    if (!parsed.valid) {
      return {
        processed: false,
        reason: parsed.reason,
      };
    }

    const {
      conversationId,
      originatorConversationId,
    } = parsed;

    const digest = digestNotification(
      payload,
      type
    );

    /**
     * Locate the original accepted enquiry.
     *
     * Both identifiers must match.
     */

    const payment =
      await PaymentTransaction.findOne({
        provider: PAYMENT_PROVIDERS.MPESA,

        "transactionStatusEnquiry.conversationId":
          conversationId,

        "transactionStatusEnquiry.originatorConversationId":
          originatorConversationId,
      });

    if (!payment) {
      return {
        processed: false,
        reason: "ENQUIRY_NOT_FOUND",
      };
    }

    const enquiry =
      payment.transactionStatusEnquiry;

    if (
      !validReceipt(enquiry?.receiptNumber)
    ) {
      return {
        processed: false,
        reason: "ENQUIRY_RECEIPT_INVALID",
      };
    }

    /**
     * An identical notification is idempotent.
     */

    if (
      enquiry.notificationDigest === digest
    ) {
      return {
        processed: true,
        duplicate: true,
        reason: "NOTIFICATION_ALREADY_RECORDED",
      };
    }

    /**
     * A different notification for an enquiry
     * that already has a notification must
     * not overwrite the first observation.
     *
     * Escalate the conflict for review.
     */

    if (enquiry.notificationDigest) {
      await PaymentTransaction.updateOne(
        {
          _id: payment._id,

          "transactionStatusEnquiry.notificationDigest":
            enquiry.notificationDigest,
        },
        {
          $set: {
            "transactionStatusEnquiry.status":
              "MANUAL_REVIEW",

            "transactionStatusEnquiry.lastErrorCode":
              "CONFLICTING_PROVIDER_NOTIFICATIONS",
          },
        }
      );

      return {
        processed: false,
        reason: "CONFLICTING_NOTIFICATION",
        requiresManualReview: true,
      };
    }

    /**
     * Only accepted enquiries may receive
     * their first recorded notification.
     *
     * A result arriving before the enquiry
     * identifiers were persisted cannot be
     * safely correlated by this service.
     */

    if (enquiry.status !== "ACCEPTED") {
      return {
        processed: false,
        reason: "ENQUIRY_NOT_ACCEPTED",
      };
    }

    /**
     * Record the observation atomically.
     *
     * The unique first-write condition ensures
     * concurrent notifications cannot both
     * become the initial observation.
     *
     * MANUAL_REVIEW is intentional:
     * this webhook has not been authenticated.
     */

    const updated =
      await PaymentTransaction.findOneAndUpdate(
        {
          _id: payment._id,

          "transactionStatusEnquiry.status":
            "ACCEPTED",

          "transactionStatusEnquiry.conversationId":
            conversationId,

          "transactionStatusEnquiry.originatorConversationId":
            originatorConversationId,

          "transactionStatusEnquiry.notificationDigest":
            null,
        },
        {
          $set: {
            "transactionStatusEnquiry.status":
              "MANUAL_REVIEW",

            "transactionStatusEnquiry.notificationType":
              type,

            "transactionStatusEnquiry.notificationDigest":
              digest,

            "transactionStatusEnquiry.notificationReceivedAt":
              new Date(),

            "transactionStatusEnquiry.completedAt":
              new Date(),

            "transactionStatusEnquiry.lastErrorCode":
              type === "TIMEOUT"
                ? "PROVIDER_TIMEOUT_UNAUTHENTICATED"
                : "PROVIDER_RESULT_UNAUTHENTICATED",
          },
        },
        {
          new: true,
          runValidators: true,
        }
      );

    if (!updated) {
      return {
        processed: false,
        reason: "CONCURRENT_NOTIFICATION_CONFLICT",
      };
    }

    return {
      processed: true,

      duplicate: false,

      reason:
        type === "TIMEOUT"
          ? "TIMEOUT_RECORDED_FOR_REVIEW"
          : "RESULT_RECORDED_FOR_REVIEW",

      paymentId:
        updated._id.toString(),

      requiresManualReview: true,

      paymentVerified: false,

      subscriptionActivated: false,
    };
  };

export const processMpesaTransactionStatusResult =
  async (payload) =>
    processMpesaTransactionStatusNotification({
      payload,
      type: "RESULT",
    });

export const processMpesaTransactionStatusTimeout =
  async (payload) =>
    processMpesaTransactionStatusNotification({
      payload,
      type: "TIMEOUT",
    });

export default {
  processMpesaTransactionStatusNotification,
  processMpesaTransactionStatusResult,
  processMpesaTransactionStatusTimeout,
};