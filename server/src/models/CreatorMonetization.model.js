import mongoose from "mongoose";

/**
 * ============================================================
 * PREMIUMCHAT — CREATOR MONETIZATION MODEL
 * ============================================================
 *
 * Stores monetization preferences for approved creators.
 *
 * IMPORTANT:
 *
 * - User remains the source of truth for creator eligibility.
 * - Monetization settings do not grant content access.
 * - Payment verification is implemented separately.
 * - Prices are stored in minor currency units.
 *
 * Example:
 *
 * KES 500.00 = 50000 minor units.
 */

const creatorMonetizationSchema = new mongoose.Schema(
  {
    creatorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },

    isEnabled: {
      type: Boolean,
      default: false,
      required: true,
    },

    currency: {
      type: String,
      enum: ["KES", "USD"],
      default: "KES",
      required: true,
    },

    subscription: {
      isEnabled: {
        type: Boolean,
        default: false,
      },

      monthlyPriceMinor: {
        type: Number,
        default: 0,
        min: 0,
        max: 100000000,
        validate: {
          validator: Number.isSafeInteger,
          message:
            "Subscription price must be a whole number of minor currency units.",
        },
      },
    },

    paidMedia: {
      isEnabled: {
        type: Boolean,
        default: false,
      },
    },

    paidMessaging: {
      isEnabled: {
        type: Boolean,
        default: false,
      },
    },

    tips: {
      isEnabled: {
        type: Boolean,
        default: false,
      },
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

/**
 * ============================================================
 * VALIDATION
 * ============================================================
 */

creatorMonetizationSchema.pre(
  "validate",
  function () {
    /**
     * An enabled subscription must have a
     * positive monthly price.
     */

    if (
      this.subscription?.isEnabled &&
      (!Number.isSafeInteger(
        this.subscription.monthlyPriceMinor
      ) ||
        this.subscription.monthlyPriceMinor <= 0)
    ) {
      this.invalidate(
        "subscription.monthlyPriceMinor",
        "An enabled subscription requires a valid positive monthly price."
      );
    }
  }
);

/**
 * ============================================================
 * INDEXES
 * ============================================================
 */

/**
 * Each creator can have only one monetization
 * configuration.
 */

creatorMonetizationSchema.index(
  {
    creatorId: 1,
  },
  {
    unique: true,
    name: "unique_creator_monetization",
  }
);

/**
 * ============================================================
 * MODEL EXPORT
 * ============================================================
 */

const CreatorMonetization =
  mongoose.models.CreatorMonetization ||
  mongoose.model(
    "CreatorMonetization",
    creatorMonetizationSchema
  );

export default CreatorMonetization;