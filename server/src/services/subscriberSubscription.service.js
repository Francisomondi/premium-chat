import mongoose from "mongoose";

import User from "../models/User.model.js";

import CreatorMonetization from "../models/CreatorMonetization.model.js";

import CreatorSubscriptionPlan from "../models/CreatorSubscriptionPlan.model.js";

import SubscriberSubscription, {
  SUBSCRIPTION_STATUSES,
} from "../models/SubscriberSubscription.model.js";

import AppError from "../utils/AppError.js";

/**
 * ============================================================
 * PREMIUMCHAT — SUBSCRIBER SUBSCRIPTION SERVICE
 * ============================================================
 *
 * Responsibilities:
 *
 * 1. Create pending subscription requests
 * 2. Validate creator and plan eligibility
 * 3. Prevent self-subscription
 * 4. Prevent duplicate requests
 * 5. Prevent overlapping subscriptions
 * 6. Retrieve subscriber subscriptions
 * 7. Retrieve creator subscriber records
 * 8. Cancel pending subscriptions
 * 9. Disable automatic renewal
 * 10. Expire completed subscription periods
 * 11. Check subscription entitlement
 *
 * SECURITY:
 *
 * This service NEVER:
 *
 * - Confirms payments
 * - Activates paid subscriptions
 * - Extends paid periods
 * - Accepts client-provided payment references
 * - Grants access based on PENDING status
 *
 * Paid activation will be implemented through a
 * trusted payment-confirmation workflow.
 */

/**
 * ============================================================
 * CONSTANTS
 * ============================================================
 */

const CURRENT_SUBSCRIPTION_STATUSES = [
  SUBSCRIPTION_STATUSES.PENDING,
  SUBSCRIPTION_STATUSES.ACTIVE,
  SUBSCRIPTION_STATUSES.PAST_DUE,
  SUBSCRIPTION_STATUSES.SUSPENDED,
];

const DEFAULT_PAGE_SIZE = 20;

const MAX_PAGE_SIZE = 100;

/**
 * ============================================================
 * VALIDATION HELPERS
 * ============================================================
 */

const hasOwn = (object, key) =>
  Object.prototype.hasOwnProperty.call(
    object,
    key
  );

const isPlainObject = (value) =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) ===
    Object.prototype;

const assertPlainObject = (value) => {
  if (!isPlainObject(value)) {
    throw new AppError(
      "Request body must be a JSON object.",
      400,
      "INVALID_REQUEST_BODY"
    );
  }
};

const assertAllowedFields = (
  payload,
  allowedFields
) => {
  for (const key of Object.keys(payload)) {
    if (!allowedFields.has(key)) {
      throw new AppError(
        `Unsupported subscription field: ${key}`,
        400,
        "INVALID_SUBSCRIPTION_FIELD"
      );
    }
  }
};

const validateObjectId = (
  value,
  fieldName = "identifier"
) => {
  if (
    typeof value !== "string" ||
    !mongoose.isObjectIdOrHexString(value)
  ) {
    throw new AppError(
      `Invalid ${fieldName}.`,
      400,
      "INVALID_IDENTIFIER"
    );
  }

  return value;
};

const validateClientRequestId = (value) => {
  if (
    typeof value !== "string" ||
    value.trim().length < 8 ||
    value.trim().length > 100
  ) {
    throw new AppError(
      "clientRequestId must contain 8–100 characters.",
      400,
      "INVALID_CLIENT_REQUEST_ID"
    );
  }

  return value.trim();
};

const validatePagination = ({
  page = 1,
  limit = DEFAULT_PAGE_SIZE,
} = {}) => {
  const parsedPage = Number(page);

  const parsedLimit = Number(limit);

  if (
    !Number.isSafeInteger(parsedPage) ||
    parsedPage < 1
  ) {
    throw new AppError(
      "Page must be a positive integer.",
      400,
      "INVALID_PAGE"
    );
  }

  if (
    !Number.isSafeInteger(parsedLimit) ||
    parsedLimit < 1 ||
    parsedLimit > MAX_PAGE_SIZE
  ) {
    throw new AppError(
      "Limit must be between 1 and 100.",
      400,
      "INVALID_LIMIT"
    );
  }

  const skip =
    (parsedPage - 1) * parsedLimit;

  if (!Number.isSafeInteger(skip)) {
    throw new AppError(
      "Pagination offset is too large.",
      400,
      "INVALID_PAGE"
    );
  }

  return {
    page: parsedPage,
    limit: parsedLimit,
    skip,
  };
};

/**
 * ============================================================
 * DATABASE ERROR HANDLING
 * ============================================================
 */

const handleSubscriptionDatabaseError = (
  error
) => {
  if (error?.code === 11000) {
    throw new AppError(
      "A subscription request with this identifier already exists.",
      409,
      "DUPLICATE_SUBSCRIPTION_REQUEST"
    );
  }

  if (error?.name === "ValidationError") {
    throw new AppError(
      "Subscription validation failed.",
      400,
      "SUBSCRIPTION_VALIDATION_FAILED"
    );
  }

  if (error?.name === "VersionError") {
    throw new AppError(
      "Subscription was modified by another request. Refresh and try again.",
      409,
      "SUBSCRIPTION_UPDATE_CONFLICT"
    );
  }

  throw error;
};

/**
 * ============================================================
 * SUBSCRIPTION OWNERSHIP
 * ============================================================
 */

const getOwnedSubscription = async (
  subscriberId,
  subscriptionId
) => {
  validateObjectId(
    subscriberId,
    "subscriber identifier"
  );

  validateObjectId(
    subscriptionId,
    "subscription identifier"
  );

  const subscription =
    await SubscriberSubscription.findOne({
      _id: subscriptionId,
      subscriberId,
    });

  if (!subscription) {
    throw new AppError(
      "Subscription not found.",
      404,
      "SUBSCRIPTION_NOT_FOUND"
    );
  }

  return subscription;
};

/**
 * ============================================================
 * PLAN ELIGIBILITY
 * ============================================================
 */

const getEligibleSubscriptionPlan = async (
  planId
) => {
  validateObjectId(
    planId,
    "plan identifier"
  );

  const plan =
    await CreatorSubscriptionPlan.findById(
      planId
    );

  if (
    !plan ||
    plan.status !== "ACTIVE"
  ) {
    throw new AppError(
      "Subscription plan is unavailable.",
      404,
      "SUBSCRIPTION_PLAN_UNAVAILABLE"
    );
  }

  const creator =
    await User.findById(
      plan.creatorId
    );

  if (
    !creator ||
    !creator.canUseCreatorFeatures()
  ) {
    throw new AppError(
      "Creator is unavailable.",
      404,
      "CREATOR_UNAVAILABLE"
    );
  }

  const monetization =
    await CreatorMonetization.findOne({
      creatorId: plan.creatorId,
    });

  if (
    !monetization ||
    !monetization.isEnabled ||
    !monetization.subscription?.isEnabled
  ) {
    throw new AppError(
      "Creator subscriptions are currently unavailable.",
      403,
      "CREATOR_SUBSCRIPTIONS_DISABLED"
    );
  }

  if (
    plan.currency !==
    monetization.currency
  ) {
    throw new AppError(
      "Subscription plan currency is unavailable.",
      409,
      "PLAN_CURRENCY_MISMATCH"
    );
  }

  return {
    plan,
    creator,
  };
};

/**
 * ============================================================
 * CREATE PENDING SUBSCRIPTION
 * ============================================================
 */

export const createPendingSubscription =
  async (
    subscriberId,
    payload
  ) => {
    validateObjectId(
      subscriberId,
      "subscriber identifier"
    );

    assertPlainObject(payload);

    assertAllowedFields(
      payload,
      new Set([
        "planId",
        "clientRequestId",
      ])
    );

    if (
      !hasOwn(payload, "planId") ||
      !hasOwn(
        payload,
        "clientRequestId"
      )
    ) {
      throw new AppError(
        "planId and clientRequestId are required.",
        400,
        "MISSING_SUBSCRIPTION_FIELDS"
      );
    }

    const planId =
      validateObjectId(
        payload.planId,
        "plan identifier"
      );

    const clientRequestId =
      validateClientRequestId(
        payload.clientRequestId
      );

    /**
     * ========================================================
     * IDEMPOTENCY
     * ========================================================
     *
     * A repeated request with the same key
     * returns the original subscription.
     */

    const existingRequest =
      await SubscriberSubscription.findOne({
        subscriberId,
        clientRequestId,
      });

    if (existingRequest) {
      if (
        existingRequest.planId.toString() !==
        planId
      ) {
        throw new AppError(
          "This request identifier was already used for a different plan.",
          409,
          "IDEMPOTENCY_KEY_REUSED"
        );
      }

      return {
        subscription: existingRequest,
        created: false,
      };
    }

    /**
     * ========================================================
     * VALIDATE PLAN
     * ========================================================
     */

    const {
      plan,
      creator,
    } = await getEligibleSubscriptionPlan(
      planId
    );

    /**
     * ========================================================
     * PREVENT SELF-SUBSCRIPTION
     * ========================================================
     */

    if (
      creator._id.toString() ===
      subscriberId
    ) {
      throw new AppError(
        "You cannot subscribe to yourself.",
        400,
        "SELF_SUBSCRIPTION_NOT_ALLOWED"
      );
    }

    /**
     * ========================================================
     * VALIDATE SUBSCRIBER
     * ========================================================
     */

    const subscriber =
      await User.findById(
        subscriberId
      );

    if (
      !subscriber ||
      !subscriber.isAccountActive()
    ) {
      throw new AppError(
        "Subscriber account is unavailable.",
        403,
        "SUBSCRIBER_UNAVAILABLE"
      );
    }

    /**
     * Restricted creator subscriptions
     * require adult verification.
     */

    if (
      !subscriber.canAccessRestrictedContent()
    ) {
      throw new AppError(
        "Adult verification is required before subscribing.",
        403,
        "ADULT_VERIFICATION_REQUIRED"
      );
    }

    /**
     * ========================================================
     * PREVENT OVERLAPPING SUBSCRIPTIONS
     * ========================================================
     */

    const existingCurrentSubscription =
      await SubscriberSubscription.findOne({
        subscriberId,

        creatorId: creator._id,

        status: {
          $in:
            CURRENT_SUBSCRIPTION_STATUSES,
        },
      });

    if (existingCurrentSubscription) {
      throw new AppError(
        "You already have a current subscription or pending subscription request for this creator.",
        409,
        "SUBSCRIPTION_ALREADY_EXISTS"
      );
    }

    /**
     * ========================================================
     * CREATE PLAN SNAPSHOT
     * ========================================================
     */

    const planSnapshot = {
      name: plan.name,

      description:
        plan.description || "",

      currency: plan.currency,

      monthlyPriceMinor:
        plan.monthlyPriceMinor,

      benefits: [
        ...(plan.benefits || []),
      ],
    };

    /**
     * ========================================================
     * CREATE PENDING SUBSCRIPTION
     * ========================================================
     *
     * No paid access is granted.
     */

    try {
      const subscription =
        await SubscriberSubscription.create({
          subscriberId,

          creatorId:
            creator._id,

          planId:
            plan._id,

          planSnapshot,

          status:
            SUBSCRIPTION_STATUSES.PENDING,

          billingInterval:
            "MONTHLY",

          autoRenew:
            false,

          cancelAtPeriodEnd:
            false,

          clientRequestId,
        });

      return {
        subscription,
        created: true,
      };
    } catch (error) {
      /**
       * Handle concurrent retries using
       * the same idempotency key.
       */

      if (error?.code === 11000) {
        const existing =
          await SubscriberSubscription.findOne({
            subscriberId,
            clientRequestId,
          });

        if (existing) {
          if (
            existing.planId.toString() !==
            planId
          ) {
            throw new AppError(
              "This request identifier was already used for a different plan.",
              409,
              "IDEMPOTENCY_KEY_REUSED"
            );
          }

          return {
            subscription: existing,
            created: false,
          };
        }
      }

      handleSubscriptionDatabaseError(
        error
      );
    }
  };

/**
 * ============================================================
 * GET MY SUBSCRIPTIONS
 * ============================================================
 */

export const getMySubscriptions =
  async (
    subscriberId,
    pagination = {}
  ) => {
    validateObjectId(
      subscriberId,
      "subscriber identifier"
    );

    const {
      page,
      limit,
      skip,
    } = validatePagination(
      pagination
    );

    const filter = {
      subscriberId,
    };

    const [
      subscriptions,
      total,
    ] = await Promise.all([
      SubscriberSubscription.find(
        filter
      )
        .sort({
          createdAt: -1,
          _id: -1,
        })
        .skip(skip)
        .limit(limit),

      SubscriberSubscription.countDocuments(
        filter
      ),
    ]);

    return {
      subscriptions,

      pagination: {
        page,
        limit,
        total,
        totalPages:
          Math.ceil(
            total / limit
          ),
      },
    };
  };

/**
 * ============================================================
 * GET CREATOR SUBSCRIBERS
 * ============================================================
 */

export const getCreatorSubscribers =
  async (
    creatorId,
    pagination = {}
  ) => {
    validateObjectId(
      creatorId,
      "creator identifier"
    );

    const {
      page,
      limit,
      skip,
    } = validatePagination(
      pagination
    );

    const filter = {
      creatorId,
    };

    const [
      subscriptions,
      total,
    ] = await Promise.all([
      SubscriberSubscription.find(
        filter
      )
        .sort({
          createdAt: -1,
          _id: -1,
        })
        .skip(skip)
        .limit(limit)
        .populate(
          "subscriberId",
          "displayName avatarUrl"
        ),

      SubscriberSubscription.countDocuments(
        filter
      ),
    ]);

    return {
      subscriptions,

      pagination: {
        page,
        limit,
        total,
        totalPages:
          Math.ceil(
            total / limit
          ),
      },
    };
  };

/**
 * ============================================================
 * CANCEL SUBSCRIPTION
 * ============================================================
 *
 * PENDING:
 * - Cancel immediately.
 *
 * ACTIVE:
 * - Disable renewal.
 * - Preserve current paid period.
 *
 * PAST_DUE:
 * - Disable renewal.
 * - Do not restore access.
 *
 * SUSPENDED:
 * - Disable renewal.
 * - Do not restore access.
 *
 * CANCELED / EXPIRED:
 * - Return existing terminal state.
 */

export const cancelMySubscription =
  async (
    subscriberId,
    subscriptionId
  ) => {
    const subscription =
      await getOwnedSubscription(
        subscriberId,
        subscriptionId
      );

    const now = new Date();

    if (
      subscription.status ===
      SUBSCRIPTION_STATUSES.CANCELED ||
      subscription.status ===
      SUBSCRIPTION_STATUSES.EXPIRED
    ) {
      return subscription;
    }

    /**
     * Pending subscriptions can be
     * canceled immediately.
     */

    if (
      subscription.status ===
      SUBSCRIPTION_STATUSES.PENDING
    ) {
      subscription.status =
        SUBSCRIPTION_STATUSES.CANCELED;

      subscription.canceledAt = now;

      subscription.autoRenew = false;

      subscription.cancelAtPeriodEnd = false;
    } else {
      /**
       * Preserve paid access until the
       * current paid period ends.
       */

      subscription.autoRenew = false;

      subscription.cancelAtPeriodEnd = true;

      subscription.canceledAt ??= now;
    }

    try {
      await subscription.save();

      return subscription;
    } catch (error) {
      handleSubscriptionDatabaseError(
        error
      );
    }
  };

/**
 * ============================================================
 * EXPIRE SUBSCRIPTIONS
 * ============================================================
 *
 * This function is intended for trusted
 * backend jobs only.
 *
 * It must not be exposed as a public API.
 *
 * Expiration is based on currentPeriodEnd.
 */

export const expireSubscriptions =
  async ({
    now = new Date(),
    batchSize = 500,
  } = {}) => {
    if (
      !(now instanceof Date) ||
      Number.isNaN(now.getTime())
    ) {
      throw new AppError(
        "Invalid expiration timestamp.",
        400,
        "INVALID_EXPIRATION_DATE"
      );
    }

    if (
      !Number.isSafeInteger(
        batchSize
      ) ||
      batchSize < 1 ||
      batchSize > 1000
    ) {
      throw new AppError(
        "Batch size must be between 1 and 1000.",
        400,
        "INVALID_BATCH_SIZE"
      );
    }

    /**
     * Only subscriptions whose paid
     * period has actually ended
     * are eligible.
     */

    const candidates =
      await SubscriberSubscription.find({
        status: {
          $in: [
            SUBSCRIPTION_STATUSES.ACTIVE,
            SUBSCRIPTION_STATUSES.PAST_DUE,
          ],
        },

        currentPeriodEnd: {
          $lte: now,
        },
      })
        .sort({
          currentPeriodEnd: 1,
        })
        .limit(batchSize)
        .select("_id");

    let expiredCount = 0;

    for (const candidate of candidates) {
      /**
       * Conditional update prevents
       * overwriting a subscription whose
       * period was extended concurrently.
       */

      const result =
        await SubscriberSubscription.updateOne(
          {
            _id: candidate._id,

            status: {
              $in: [
                SUBSCRIPTION_STATUSES.ACTIVE,
                SUBSCRIPTION_STATUSES.PAST_DUE,
              ],
            },

            currentPeriodEnd: {
              $lte: now,
            },
          },
          {
            $set: {
              status:
                SUBSCRIPTION_STATUSES.EXPIRED,

              expiredAt: now,

              autoRenew: false,

              cancelAtPeriodEnd: false,
            },
          },
          {
            runValidators: true,
          }
        );

      expiredCount +=
        result.modifiedCount;
    }

    return {
      expiredCount,
      checkedCount:
        candidates.length,
    };
  };

/**
 * ============================================================
 * CHECK SUBSCRIPTION ENTITLEMENT
 * ============================================================
 *
 * This function evaluates whether a subscriber
 * currently has paid access to a creator.
 *
 * IMPORTANT:
 *
 * This assumes ACTIVE status was assigned
 * only after verified payment.
 *
 * Future modules must also validate:
 *
 * - Payment reversals
 * - Creator eligibility
 * - Content-specific restrictions
 * - Administrative revocations
 */

export const checkSubscriberEntitlement =
  async (
    subscriberId,
    creatorId
  ) => {
    validateObjectId(
      subscriberId,
      "subscriber identifier"
    );

    validateObjectId(
      creatorId,
      "creator identifier"
    );

    const now = new Date();

    const subscription =
      await SubscriberSubscription.findOne({
        subscriberId,

        creatorId,

        status:
          SUBSCRIPTION_STATUSES.ACTIVE,

        currentPeriodStart: {
          $lte: now,
        },

        currentPeriodEnd: {
          $gt: now,
        },

        suspendedAt: null,
      }).sort({
        currentPeriodEnd: -1,
      });

    if (!subscription) {
      return {
        hasAccess: false,
        subscription: null,
      };
    }

    /**
     * Defense-in-depth:
     * validate model entitlement.
     */

    if (
      !subscription.hasActiveAccess(
        now
      )
    ) {
      return {
        hasAccess: false,
        subscription: null,
      };
    }

    return {
      hasAccess: true,
      subscription,
    };
  };