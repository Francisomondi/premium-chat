import mongoose from "mongoose";

/**
 * ============================================================
 * PREMIUMCHAT — SUBSCRIBER SUBSCRIPTION MODEL
 * ============================================================
 *
 * Represents a subscription relationship between:
 *
 * - Subscriber
 * - Creator
 * - Creator subscription plan
 *
 * IMPORTANT:
 *
 * - Creating this document does not grant paid access.
 * - ACTIVE status must only be assigned by trusted
 *   server-side payment confirmation workflows.
 * - Never accept subscription status or payment
 *   confirmation directly from client requests.
 * - Subscription entitlement must be evaluated
 *   using status, payment verification, and dates.
 */

const {
  Schema,
} = mongoose;

/**
 * ============================================================
 * SUBSCRIPTION STATUS
 * ============================================================
 */

export const SUBSCRIPTION_STATUSES =
  Object.freeze({
    PENDING: "PENDING",
    ACTIVE: "ACTIVE",
    PAST_DUE: "PAST_DUE",
    CANCELED: "CANCELED",
    EXPIRED: "EXPIRED",
    SUSPENDED: "SUSPENDED",
  });

const SUBSCRIPTION_STATUS_VALUES =
  Object.values(SUBSCRIPTION_STATUSES);

/**
 * ============================================================
 * BILLING INTERVALS
 * ============================================================
 *
 * Monthly billing is the initial supported interval.
 */

export const SUBSCRIPTION_BILLING_INTERVALS =
  Object.freeze({
    MONTHLY: "MONTHLY",
  });

/**
 * ============================================================
 * PLAN SNAPSHOT
 * ============================================================
 *
 * Preserve the commercial terms agreed upon
 * when the subscriber selected the plan.
 *
 * This prevents subsequent plan edits from
 * silently changing existing subscriptions.
 */

const planSnapshotSchema = new Schema(
  {
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
      required: true,
    },

    monthlyPriceMinor: {
      type: Number,
      required: true,
      min: 1,
      max: 100000000,
      validate: {
        validator: Number.isSafeInteger,
        message:
          "Subscription price must be an integer in minor currency units.",
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
          "Subscription snapshot cannot contain more than 10 benefits.",
      },
    },
  },
  {
    _id: false,
  }
);

/**
 * ============================================================
 * SUBSCRIPTION SCHEMA
 * ============================================================
 */

const subscriberSubscriptionSchema =
  new Schema(
    {
      /**
       * Subscriber purchasing access.
       */

      subscriberId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
        immutable: true,
      },

      /**
       * Creator receiving the subscription.
       */

      creatorId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
        immutable: true,
      },

      /**
       * Original subscription plan.
       */

      planId: {
        type: Schema.Types.ObjectId,
        ref: "CreatorSubscriptionPlan",
        required: true,
        immutable: true,
      },

      /**
       * Commercial terms at subscription creation.
       */

      planSnapshot: {
        type: planSnapshotSchema,
        required: true,
      },

      /**
       * Current subscription status.
       */

      status: {
        type: String,
        enum: SUBSCRIPTION_STATUS_VALUES,
        default: SUBSCRIPTION_STATUSES.PENDING,
        required: true,
      },

      /**
       * Billing interval.
       */

      billingInterval: {
        type: String,
        enum: Object.values(
          SUBSCRIPTION_BILLING_INTERVALS
        ),
        default:
          SUBSCRIPTION_BILLING_INTERVALS.MONTHLY,
        required: true,
      },

      /**
       * When the first verified paid period begins.
       */

      startedAt: {
        type: Date,
        default: null,
      },

      /**
       * Start of the current paid period.
       */

      currentPeriodStart: {
        type: Date,
        default: null,
      },

      /**
       * End of the current paid period.
       *
       * Access must not continue beyond this
       * timestamp without a verified renewal.
       */

      currentPeriodEnd: {
        type: Date,
        default: null,
      },

      /**
       * Whether automatic renewal is requested.
       *
       * This setting alone does not authorize
       * charging a payment method.
       */

      autoRenew: {
        type: Boolean,
        default: false,
      },

      /**
       * Cancellation preferences.
       */

      cancelAtPeriodEnd: {
        type: Boolean,
        default: false,
      },

      canceledAt: {
        type: Date,
        default: null,
      },

      /**
       * Subscription expiration.
       */

      expiredAt: {
        type: Date,
        default: null,
      },

      /**
       * Administrative suspension.
       */

      suspendedAt: {
        type: Date,
        default: null,
      },

      suspensionReason: {
        type: String,
        trim: true,
        maxlength: 500,
        default: null,
      },

      /**
       * Last successful payment reference.
       *
       * Payment records will be implemented
       * in the payment module.
       */

      lastPaymentId: {
        type: Schema.Types.ObjectId,
        default: null,
      },

      /**
     * Original UTC calendar day used for
     * monthly renewal calculations.
     *
     * Set only by the trusted payment
     * application workflow.
     */

    billingAnchorDay: {
    type: Number,

    min: 1,

    max: 31,

    default: null,

    validate: {
        validator(value) {
        return (
            value == null ||
            Number.isInteger(value)
        );
        },

        message:
        "Billing anchor day must be an integer.",
    },
    },

      /**
       * Idempotency reference for the
       * initial subscription request.
       *
       * A unique compound index prevents
       * duplicate creation when the same
       * client request is retried.
       */

      clientRequestId: {
        type: String,
        required: true,
        immutable: true,
        trim: true,
        minlength: 8,
        maxlength: 100,
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
 * VALIDATION
 * ============================================================
 */

subscriberSubscriptionSchema.pre(
  "validate",
  function () {
    /**
     * Prevent self-subscription.
     */

    if (
      this.subscriberId &&
      this.creatorId &&
      this.subscriberId.toString() ===
        this.creatorId.toString()
    ) {
      this.invalidate(
        "creatorId",
        "Users cannot subscribe to themselves."
      );
    }

    /**
     * Validate paid-period chronology.
     */

    if (
      this.currentPeriodStart &&
      this.currentPeriodEnd &&
      this.currentPeriodEnd <=
        this.currentPeriodStart
    ) {
      this.invalidate(
        "currentPeriodEnd",
        "Subscription period end must be after its start."
      );
    }

    /**
     * ACTIVE subscriptions require
     * a complete paid period.
     */

    if (
      this.status ===
      SUBSCRIPTION_STATUSES.ACTIVE
    ) {
      if (
        !this.startedAt ||
        !this.currentPeriodStart ||
        !this.currentPeriodEnd
      ) {
        this.invalidate(
          "status",
          "Active subscriptions require valid billing period dates."
        );
      }
    }

    /**
     * Suspended subscriptions must record
     * when suspension occurred.
     */

    if (
      this.status ===
        SUBSCRIPTION_STATUSES.SUSPENDED &&
      !this.suspendedAt
    ) {
      this.invalidate(
        "suspendedAt",
        "Suspended subscriptions require a suspension timestamp."
      );
    }
  }
);

/**
 * ============================================================
 * ENTITLEMENT CHECK
 * ============================================================
 *
 * Returns whether the subscription is within
 * a valid paid period.
 *
 * IMPORTANT:
 *
 * This method assumes ACTIVE status was set
 * only after verified payment.
 *
 * Final authorization must additionally check
 * creator/content eligibility and any payment
 * revocation or administrative restrictions.
 */

subscriberSubscriptionSchema.methods.hasActiveAccess =
  function (now = new Date()) {
    if (
      this.status !==
      SUBSCRIPTION_STATUSES.ACTIVE
    ) {
      return false;
    }

    if (
      !this.currentPeriodStart ||
      !this.currentPeriodEnd
    ) {
      return false;
    }

    if (
      this.currentPeriodStart > now ||
      this.currentPeriodEnd <= now
    ) {
      return false;
    }

    if (this.suspendedAt) {
      return false;
    }

    return true;
  };

/**
 * ============================================================
 * INDEXES
 * ============================================================
 */

/**
 * Prevent duplicate subscription requests
 * from the same subscriber.
 */

subscriberSubscriptionSchema.index(
  {
    subscriberId: 1,
    clientRequestId: 1,
  },
  {
    unique: true,
    name: "unique_subscriber_request",
  }
);

/**
 * Subscriber subscription history.
 */

subscriberSubscriptionSchema.index(
  {
    subscriberId: 1,
    createdAt: -1,
  },
  {
    name: "subscriber_subscription_history",
  }
);

/**
 * Creator subscriber management.
 */

subscriberSubscriptionSchema.index(
  {
    creatorId: 1,
    status: 1,
    createdAt: -1,
  },
  {
    name: "creator_subscriber_lookup",
  }
);

/**
 * Subscription plan lookup.
 */

subscriberSubscriptionSchema.index(
  {
    planId: 1,
    status: 1,
  },
  {
    name: "subscription_plan_status",
  }
);

/**
 * Subscription expiration processing.
 */

subscriberSubscriptionSchema.index(
  {
    status: 1,
    currentPeriodEnd: 1,
  },
  {
    name: "subscription_expiration_lookup",
  }
);
/**
 * ============================================================
 * PREVENT OVERLAPPING CURRENT SUBSCRIPTIONS
 * ============================================================
 *
 * A subscriber may have only one current
 * subscription relationship with a creator.
 *
 * Historical CANCELED and EXPIRED subscriptions
 * remain available.
 */

subscriberSubscriptionSchema.index(
  {
    subscriberId: 1,
    creatorId: 1,
  },
  {
    unique: true,

    name: "unique_current_subscriber_creator",

    partialFilterExpression: {
      status: {
        $in: [
          "PENDING",
          "ACTIVE",
          "PAST_DUE",
          "SUSPENDED",
        ],
      },
    },
  }
);

/**
 * ============================================================
 * MODEL EXPORT
 * ============================================================
 */

const SubscriberSubscription =
  mongoose.models.SubscriberSubscription ||
  mongoose.model(
    "SubscriberSubscription",
    subscriberSubscriptionSchema
  );

export default SubscriberSubscription;