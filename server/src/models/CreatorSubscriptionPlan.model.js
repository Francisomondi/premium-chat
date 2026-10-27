import mongoose from "mongoose";

/**
 * ============================================================
 * PREMIUMCHAT — CREATOR SUBSCRIPTION PLAN MODEL
 * ============================================================
 *
 * A creator can offer multiple subscription plans.
 *
 * This model stores plan configuration only.
 *
 * It does NOT:
 * - Process payments
 * - Create active subscriptions
 * - Grant premium-content access
 * - Calculate creator earnings
 *
 * Prices are stored in minor currency units.
 */

const creatorSubscriptionPlanSchema = new mongoose.Schema(
  {
    creatorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
      index: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 60,
    },

    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },

    currency: {
      type: String,
      enum: ["KES", "USD"],
      default: "KES",
      required: true,
      immutable: true,
    },

    monthlyPriceMinor: {
      type: Number,
      required: true,
      min: 1,
      max: 100000000,
      validate: {
        validator: Number.isSafeInteger,
        message:
          "Price must be a whole number in minor currency units.",
      },
    },

    benefits: {
      type: [
        {
          type: String,
          trim: true,
          minlength: 3,
          maxlength: 120,
        },
      ],
      default: [],
      validate: {
        validator(value) {
          return value.length <= 10;
        },
        message:
          "A subscription plan cannot have more than 10 benefits.",
      },
    },

    status: {
      type: String,
      enum: ["DRAFT", "ACTIVE", "ARCHIVED"],
      default: "DRAFT",
      required: true,
    },

    sortOrder: {
      type: Number,
      default: 0,
      min: 0,
      validate: {
        validator: Number.isSafeInteger,
        message: "Sort order must be an integer.",
      },
    },
  },
  {
    timestamps: true,
    versionKey: "__v",
    optimisticConcurrency: true,
  }
);

/**
 * ============================================================
 * INDEXES
 * ============================================================
 */

/**
 * Efficiently retrieve a creator's plans.
 */

creatorSubscriptionPlanSchema.index(
  {
    creatorId: 1,
    status: 1,
    sortOrder: 1,
  },
  {
    name: "creator_subscription_plans",
  }
);

/**
 * Prevent duplicate plan names for the same creator.
 *
 * Collation makes name comparison case-insensitive.
 */

creatorSubscriptionPlanSchema.index(
  {
    creatorId: 1,
    name: 1,
  },
  {
    unique: true,
    name: "unique_creator_plan_name",
    collation: {
      locale: "en",
      strength: 2,
    },
  }
);

/**
 * ============================================================
 * MODEL EXPORT
 * ============================================================
 */

const CreatorSubscriptionPlan =
  mongoose.models.CreatorSubscriptionPlan ||
  mongoose.model(
    "CreatorSubscriptionPlan",
    creatorSubscriptionPlanSchema
  );

export default CreatorSubscriptionPlan;