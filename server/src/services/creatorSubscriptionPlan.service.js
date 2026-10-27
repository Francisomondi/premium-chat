import mongoose from "mongoose";

import CreatorSubscriptionPlan from "../models/CreatorSubscriptionPlan.model.js";

import CreatorMonetization from "../models/CreatorMonetization.model.js";

import User from "../models/User.model.js";

import AppError from "../utils/AppError.js";

/**
 * ============================================================
 * PREMIUMCHAT — CREATOR SUBSCRIPTION PLAN SERVICE
 * ============================================================
 *
 * Responsibilities:
 *
 * - Create subscription plans
 * - Retrieve creator-owned plans
 * - Update plan details
 * - Manage plan lifecycle
 * - Retrieve public active plans
 *
 * Security:
 *
 * - Creator identity comes from authenticated context.
 * - Plan ownership is enforced in database queries.
 * - Public discovery returns active plans only.
 * - Monetization must be enabled before activation.
 *
 * IMPORTANT:
 *
 * This service does not:
 *
 * - Process payments
 * - Create customer subscriptions
 * - Grant content access
 * - Calculate earnings
 */

const ALLOWED_CURRENCIES = new Set([
  "KES",
  "USD",
]);

const ALLOWED_STATUSES = new Set([
  "DRAFT",
  "ACTIVE",
  "ARCHIVED",
]);

const MAX_PRICE_MINOR = 100000000;

const MAX_BENEFITS = 10;

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

const assertObject = (value) => {
  if (!isPlainObject(value)) {
    throw new AppError(
      "Request body must be a JSON object.",
      400,
      "INVALID_REQUEST_BODY"
    );
  }
};

const assertAllowedKeys = (
  payload,
  allowedKeys
) => {
  for (const key of Object.keys(payload)) {
    if (!allowedKeys.has(key)) {
      throw new AppError(
        `Unsupported field: ${key}`,
        400,
        "INVALID_PLAN_FIELD"
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

const validateName = (value) => {
  if (typeof value !== "string") {
    throw new AppError(
      "Plan name must be a string.",
      400,
      "INVALID_PLAN_NAME"
    );
  }

  const name = value.trim();

  if (name.length < 3 || name.length > 60) {
    throw new AppError(
      "Plan name must contain 3–60 characters.",
      400,
      "INVALID_PLAN_NAME"
    );
  }

  return name;
};

const validateDescription = (value) => {
  if (typeof value !== "string") {
    throw new AppError(
      "Description must be a string.",
      400,
      "INVALID_PLAN_DESCRIPTION"
    );
  }

  const description = value.trim();

  if (description.length > 500) {
    throw new AppError(
      "Description cannot exceed 500 characters.",
      400,
      "INVALID_PLAN_DESCRIPTION"
    );
  }

  return description;
};

const validateCurrency = (value) => {
  if (
    typeof value !== "string" ||
    !ALLOWED_CURRENCIES.has(value)
  ) {
    throw new AppError(
      "Unsupported currency.",
      400,
      "INVALID_CURRENCY"
    );
  }

  return value;
};

const validatePrice = (value) => {
  if (
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > MAX_PRICE_MINOR
  ) {
    throw new AppError(
      "Monthly price must be a positive integer in minor currency units.",
      400,
      "INVALID_PLAN_PRICE"
    );
  }

  return value;
};

const validateBenefits = (value) => {
  if (!Array.isArray(value)) {
    throw new AppError(
      "Benefits must be an array.",
      400,
      "INVALID_PLAN_BENEFITS"
    );
  }

  if (value.length > MAX_BENEFITS) {
    throw new AppError(
      "A plan cannot contain more than 10 benefits.",
      400,
      "INVALID_PLAN_BENEFITS"
    );
  }

  const benefits = value.map((benefit) => {
    if (typeof benefit !== "string") {
      throw new AppError(
        "Each benefit must be a string.",
        400,
        "INVALID_PLAN_BENEFITS"
      );
    }

    const normalized = benefit.trim();

    if (
      normalized.length < 3 ||
      normalized.length > 120
    ) {
      throw new AppError(
        "Each benefit must contain 3–120 characters.",
        400,
        "INVALID_PLAN_BENEFITS"
      );
    }

    return normalized;
  });

  const uniqueBenefits = new Set(
    benefits.map((benefit) =>
      benefit.toLowerCase()
    )
  );

  if (uniqueBenefits.size !== benefits.length) {
    throw new AppError(
      "Duplicate benefits are not allowed.",
      400,
      "DUPLICATE_PLAN_BENEFITS"
    );
  }

  return benefits;
};

const validateSortOrder = (value) => {
  if (
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new AppError(
      "Sort order must be a non-negative integer.",
      400,
      "INVALID_SORT_ORDER"
    );
  }

  return value;
};

/**
 * ============================================================
 * DATABASE ERROR HANDLING
 * ============================================================
 */

const handlePlanDatabaseError = (error) => {
  if (
    error?.code === 11000 &&
    (
      error?.keyPattern?.name ||
      error?.keyValue?.name
    )
  ) {
    throw new AppError(
      "You already have a subscription plan with this name.",
      409,
      "DUPLICATE_PLAN_NAME"
    );
  }

  if (error?.name === "ValidationError") {
    throw new AppError(
      "Subscription plan validation failed.",
      400,
      "PLAN_VALIDATION_FAILED"
    );
  }

  if (error?.name === "VersionError") {
    throw new AppError(
      "This plan was modified by another request. Refresh and try again.",
      409,
      "PLAN_UPDATE_CONFLICT"
    );
  }

  throw error;
};

/**
 * ============================================================
 * CREATOR MONETIZATION CHECK
 * ============================================================
 */

const getEnabledCreatorMonetization = async (
  creatorId
) => {
  const settings =
    await CreatorMonetization.findOne({
      creatorId,
    });

  if (
    !settings ||
    !settings.isEnabled ||
    !settings.subscription?.isEnabled
  ) {
    throw new AppError(
      "Enable creator monetization and subscriptions before activating a plan.",
      403,
      "SUBSCRIPTION_MONETIZATION_DISABLED"
    );
  }

  return settings;
};

/**
 * ============================================================
 * CREATE SUBSCRIPTION PLAN
 * ============================================================
 */

export const createCreatorSubscriptionPlan =
  async (creatorId, payload) => {
    validateObjectId(
      creatorId,
      "creator identifier"
    );

    assertObject(payload);

    const allowedFields = new Set([
      "name",
      "description",
      "currency",
      "monthlyPriceMinor",
      "benefits",
      "sortOrder",
    ]);

    assertAllowedKeys(
      payload,
      allowedFields
    );

    if (
      !hasOwn(payload, "name") ||
      !hasOwn(payload, "monthlyPriceMinor")
    ) {
      throw new AppError(
        "Plan name and monthly price are required.",
        400,
        "MISSING_PLAN_FIELDS"
      );
    }

    const monetization =
      await CreatorMonetization.findOne({
        creatorId,
      });

    /**
     * Use the creator's configured currency
     * when available.
     */

    const currency =
      monetization?.currency || "KES";

    if (
      hasOwn(payload, "currency") &&
      validateCurrency(payload.currency) !==
        currency
    ) {
      throw new AppError(
        "Plan currency must match the creator's monetization currency.",
        400,
        "PLAN_CURRENCY_MISMATCH"
      );
    }

    const planData = {
      creatorId,

      name: validateName(payload.name),

      description: hasOwn(
        payload,
        "description"
      )
        ? validateDescription(
            payload.description
          )
        : "",

      currency,

      monthlyPriceMinor: validatePrice(
        payload.monthlyPriceMinor
      ),

      benefits: hasOwn(payload, "benefits")
        ? validateBenefits(payload.benefits)
        : [],

      sortOrder: hasOwn(
        payload,
        "sortOrder"
      )
        ? validateSortOrder(
            payload.sortOrder
          )
        : 0,

      status: "DRAFT",
    };

    try {
      const plan =
        await CreatorSubscriptionPlan.create(
          planData
        );

      return plan;
    } catch (error) {
      handlePlanDatabaseError(error);
    }
  };

/**
 * ============================================================
 * GET MY SUBSCRIPTION PLANS
 * ============================================================
 */

export const getMyCreatorSubscriptionPlans =
  async (creatorId) => {
    validateObjectId(
      creatorId,
      "creator identifier"
    );

    return CreatorSubscriptionPlan.find({
      creatorId,
    }).sort({
      sortOrder: 1,
      createdAt: -1,
    });
  };

/**
 * ============================================================
 * UPDATE SUBSCRIPTION PLAN
 * ============================================================
 */

export const updateCreatorSubscriptionPlan =
  async (
    creatorId,
    planId,
    payload
  ) => {
    validateObjectId(
      creatorId,
      "creator identifier"
    );

    validateObjectId(
      planId,
      "plan identifier"
    );

    assertObject(payload);

    const allowedFields = new Set([
      "name",
      "description",
      "monthlyPriceMinor",
      "benefits",
      "sortOrder",
    ]);

    assertAllowedKeys(
      payload,
      allowedFields
    );

    if (Object.keys(payload).length === 0) {
      throw new AppError(
        "No plan updates provided.",
        400,
        "EMPTY_PLAN_UPDATE"
      );
    }

    const plan =
      await CreatorSubscriptionPlan.findOne({
        _id: planId,
        creatorId,
      });

    if (!plan) {
      throw new AppError(
        "Subscription plan not found.",
        404,
        "PLAN_NOT_FOUND"
      );
    }

    if (plan.status === "ARCHIVED") {
      throw new AppError(
        "Archived plans cannot be edited.",
        400,
        "PLAN_ARCHIVED"
      );
    }

    /**
     * Prevent changes to published pricing.
     *
     * Price changes should eventually create
     * a new billing version.
     */

    if (
      plan.status === "ACTIVE" &&
      hasOwn(
        payload,
        "monthlyPriceMinor"
      )
    ) {
      throw new AppError(
        "Active plan pricing cannot be modified. Create a new plan instead.",
        409,
        "ACTIVE_PLAN_PRICE_LOCKED"
      );
    }

    if (hasOwn(payload, "name")) {
      plan.name = validateName(
        payload.name
      );
    }

    if (
      hasOwn(payload, "description")
    ) {
      plan.description =
        validateDescription(
          payload.description
        );
    }

    if (
      hasOwn(
        payload,
        "monthlyPriceMinor"
      )
    ) {
      plan.monthlyPriceMinor =
        validatePrice(
          payload.monthlyPriceMinor
        );
    }

    if (hasOwn(payload, "benefits")) {
      plan.benefits =
        validateBenefits(
          payload.benefits
        );
    }

    if (hasOwn(payload, "sortOrder")) {
      plan.sortOrder =
        validateSortOrder(
          payload.sortOrder
        );
    }

    try {
      await plan.save();

      return plan;
    } catch (error) {
      handlePlanDatabaseError(error);
    }
  };

/**
 * ============================================================
 * UPDATE SUBSCRIPTION PLAN STATUS
 * ============================================================
 */

export const updateCreatorSubscriptionPlanStatus =
  async (
    creatorId,
    planId,
    payload
  ) => {
    validateObjectId(
      creatorId,
      "creator identifier"
    );

    validateObjectId(
      planId,
      "plan identifier"
    );

    assertObject(payload);

    assertAllowedKeys(
      payload,
      new Set(["status"])
    );

    if (
      !hasOwn(payload, "status") ||
      !ALLOWED_STATUSES.has(payload.status)
    ) {
      throw new AppError(
        "Invalid subscription plan status.",
        400,
        "INVALID_PLAN_STATUS"
      );
    }

    const plan =
      await CreatorSubscriptionPlan.findOne({
        _id: planId,
        creatorId,
      });

    if (!plan) {
      throw new AppError(
        "Subscription plan not found.",
        404,
        "PLAN_NOT_FOUND"
      );
    }

    /**
     * Archived plans are terminal.
     */

    if (plan.status === "ARCHIVED") {
      throw new AppError(
        "Archived plans cannot be reactivated.",
        409,
        "PLAN_ARCHIVED"
      );
    }

    /**
     * Allowed lifecycle:
     *
     * DRAFT -> ACTIVE
     * DRAFT -> ARCHIVED
     * ACTIVE -> ARCHIVED
     *
     * DRAFT -> DRAFT and ACTIVE -> ACTIVE
     * are harmless no-op requests.
     */

    if (
      plan.status === "ACTIVE" &&
      payload.status === "DRAFT"
    ) {
      throw new AppError(
        "Active plans cannot return to draft.",
        409,
        "INVALID_PLAN_TRANSITION"
      );
    }

    if (
      payload.status === "ACTIVE"
    ) {
      const monetization =
        await getEnabledCreatorMonetization(
          creatorId
        );

      if (
        plan.currency !==
        monetization.currency
      ) {
        throw new AppError(
          "Plan currency does not match the creator's current monetization currency.",
          409,
          "PLAN_CURRENCY_MISMATCH"
        );
      }
    }

    plan.status = payload.status;

    try {
      await plan.save();

      return plan;
    } catch (error) {
      handlePlanDatabaseError(error);
    }
  };

/**
 * ============================================================
 * PUBLIC CREATOR SUBSCRIPTION PLANS
 * ============================================================
 */

export const getPublicCreatorSubscriptionPlans =
  async (creatorId) => {
    validateObjectId(
      creatorId,
      "creator identifier"
    );

    /**
     * Never expose plans for an ineligible
     * creator.
     */

    const creator = await User.findById(
      creatorId
    );

    if (
      !creator ||
      !creator.canUseCreatorFeatures()
    ) {
      throw new AppError(
        "Creator not found.",
        404,
        "CREATOR_NOT_FOUND"
      );
    }

    const monetization =
      await CreatorMonetization.findOne({
        creatorId,
      });

    /**
     * Monetization disabled:
     * return an empty public catalog.
     */

    if (
      !monetization?.isEnabled ||
      !monetization.subscription?.isEnabled
    ) {
      return [];
    }

    const plans =
      await CreatorSubscriptionPlan.find({
        creatorId,
        status: "ACTIVE",
        currency:
          monetization.currency,
      })
        .select(
          "name description currency monthlyPriceMinor benefits sortOrder"
        )
        .sort({
          sortOrder: 1,
          monthlyPriceMinor: 1,
        })
        .lean();

    return plans;
  };