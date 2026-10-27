import mongoose from "mongoose";

import CreatorMonetization from "../models/CreatorMonetization.model.js";

import AppError from "../utils/AppError.js";

/**
 * ============================================================
 * PREMIUMCHAT — CREATOR MONETIZATION SERVICE
 * ============================================================
 *
 * Responsibilities:
 *
 * - Retrieve monetization settings
 * - Create default settings
 * - Validate settings updates
 * - Update monetization preferences
 *
 * IMPORTANT:
 *
 * - This service does not process payments.
 * - This service does not grant subscriptions.
 * - This service does not unlock premium media.
 * - Creator eligibility is checked separately.
 */

const ALLOWED_CURRENCIES = new Set([
  "KES",
  "USD",
]);

const MAX_PRICE_MINOR = 100000000;

/**
 * ============================================================
 * VALIDATION HELPERS
 * ============================================================
 */

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function assertAllowedKeys(
  object,
  allowedKeys,
  fieldName
) {
  for (const key of Object.keys(object)) {
    if (!allowedKeys.has(key)) {
      throw new AppError(
        `Unsupported field: ${fieldName}.${key}`,
        400,
        "INVALID_MONETIZATION_SETTINGS"
      );
    }
  }
}

function validateBoolean(value, fieldName) {
  if (typeof value !== "boolean") {
    throw new AppError(
      `${fieldName} must be a boolean.`,
      400,
      "INVALID_MONETIZATION_SETTINGS"
    );
  }

  return value;
}

function validatePrice(value) {
  if (
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > MAX_PRICE_MINOR
  ) {
    throw new AppError(
      "Subscription price must be a valid non-negative integer in minor currency units.",
      400,
      "INVALID_SUBSCRIPTION_PRICE"
    );
  }

  return value;
}

/**
 * ============================================================
 * GET OR CREATE SETTINGS
 * ============================================================
 */

export const getOrCreateCreatorMonetization =
  async (creatorId) => {
    if (!mongoose.isValidObjectId(creatorId)) {
      throw new AppError(
        "Invalid creator identifier.",
        400,
        "INVALID_CREATOR_ID"
      );
    }

    /**
     * Atomic upsert prevents duplicate settings.
     *
     * The unique creatorId index provides an
     * additional database-level guarantee.
     */

    try {
      return await CreatorMonetization.findOneAndUpdate(
        {
          creatorId,
        },
        {
          $setOnInsert: {
            creatorId,
          },
        },
        {
          new: true,
          upsert: true,
          runValidators: true,
          setDefaultsOnInsert: true,
        }
      );
    } catch (error) {
      /**
       * Concurrent upserts can occasionally race
       * during initial document creation.
       */

      if (error?.code === 11000) {
        const existing =
          await CreatorMonetization.findOne({
            creatorId,
          });

        if (existing) {
          return existing;
        }
      }

      throw error;
    }
  };

/**
 * ============================================================
 * UPDATE SETTINGS
 * ============================================================
 */

export const updateCreatorMonetization =
  async (creatorId, payload) => {
    if (!mongoose.isValidObjectId(creatorId)) {
      throw new AppError(
        "Invalid creator identifier.",
        400,
        "INVALID_CREATOR_ID"
      );
    }

    if (!isPlainObject(payload)) {
      throw new AppError(
        "Monetization settings must be an object.",
        400,
        "INVALID_MONETIZATION_SETTINGS"
      );
    }

    /**
     * Reject unexpected top-level fields.
     */

    const allowedTopLevelKeys = new Set([
      "isEnabled",
      "currency",
      "subscription",
      "paidMedia",
      "paidMessaging",
      "tips",
    ]);

    assertAllowedKeys(
      payload,
      allowedTopLevelKeys,
      "settings"
    );

    /**
     * Build a strict update object.
     *
     * Never spread untrusted request data
     * directly into MongoDB updates.
     */

    const updates = {};

    /**
     * GLOBAL MONETIZATION
     */

    if (
      Object.prototype.hasOwnProperty.call(
        payload,
        "isEnabled"
      )
    ) {
      updates.isEnabled = validateBoolean(
        payload.isEnabled,
        "isEnabled"
      );
    }

    /**
     * CURRENCY
     */

    if (
      Object.prototype.hasOwnProperty.call(
        payload,
        "currency"
      )
    ) {
      if (
        typeof payload.currency !== "string" ||
        !ALLOWED_CURRENCIES.has(
          payload.currency
        )
      ) {
        throw new AppError(
          "Unsupported currency.",
          400,
          "INVALID_CURRENCY"
        );
      }

      updates.currency = payload.currency;
    }

    /**
     * SUBSCRIPTION SETTINGS
     */

    if (
      Object.prototype.hasOwnProperty.call(
        payload,
        "subscription"
      )
    ) {
      if (!isPlainObject(payload.subscription)) {
        throw new AppError(
          "Subscription settings must be an object.",
          400,
          "INVALID_MONETIZATION_SETTINGS"
        );
      }

      assertAllowedKeys(
        payload.subscription,
        new Set([
          "isEnabled",
          "monthlyPriceMinor",
        ]),
        "subscription"
      );

      if (
        Object.prototype.hasOwnProperty.call(
          payload.subscription,
          "isEnabled"
        )
      ) {
        updates["subscription.isEnabled"] =
          validateBoolean(
            payload.subscription.isEnabled,
            "subscription.isEnabled"
          );
      }

      if (
        Object.prototype.hasOwnProperty.call(
          payload.subscription,
          "monthlyPriceMinor"
        )
      ) {
        updates["subscription.monthlyPriceMinor"] =
          validatePrice(
            payload.subscription.monthlyPriceMinor
          );
      }
    }

    /**
     * PAID MEDIA / MESSAGING / TIPS
     */

    for (const field of [
      "paidMedia",
      "paidMessaging",
      "tips",
    ]) {
      if (
        !Object.prototype.hasOwnProperty.call(
          payload,
          field
        )
      ) {
        continue;
      }

      if (!isPlainObject(payload[field])) {
        throw new AppError(
          `${field} must be an object.`,
          400,
          "INVALID_MONETIZATION_SETTINGS"
        );
      }

      assertAllowedKeys(
        payload[field],
        new Set(["isEnabled"]),
        field
      );

      if (
        Object.prototype.hasOwnProperty.call(
          payload[field],
          "isEnabled"
        )
      ) {
        updates[`${field}.isEnabled`] =
          validateBoolean(
            payload[field].isEnabled,
            `${field}.isEnabled`
          );
      }
    }

    /**
     * Reject empty updates.
     */

    if (Object.keys(updates).length === 0) {
      throw new AppError(
        "No valid monetization settings provided.",
        400,
        "EMPTY_MONETIZATION_UPDATE"
      );
    }

    /**
     * Ensure settings exist.
     */

    const settings =
      await getOrCreateCreatorMonetization(
        creatorId
      );

    /**
     * Apply updates to the document.
     *
     * Document validation checks the final
     * combined state, including partial updates.
     */

    for (const [path, value] of Object.entries(
      updates
    )) {
      settings.set(path, value);
    }

    await settings.save();

    return settings;
  };