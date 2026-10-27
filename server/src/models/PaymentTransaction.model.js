import mongoose from "mongoose";

import {
  PAYMENT_PURPOSES,
  PAYMENT_STATUSES,
  PAYMENT_PROVIDERS,
  PAYMENT_VERIFICATION_STATUSES,
  PAYMENT_CURRENCIES,
  PAYMENT_INITIATION_STATUSES,
} from "../constants/payment.constants.js";


/**
 * ============================================================
 * PREMIUMCHAT — PAYMENT TRANSACTION MODEL
 * ============================================================
 *
 * Responsibilities:
 *
 * - Record payment attempts.
 * - Preserve payment amounts and currencies.
 * - Associate payments with subscriptions.
 * - Store trusted provider references.
 * - Track verification status.
 * - Support initial payments and renewals.
 * - Prevent duplicate provider transaction records.
 *
 * SECURITY:
 *
 * - Payment success is never client-controlled.
 * - Provider references must come from trusted
 *   payment initialization or verification.
 * - Subscription access must not depend on
 *   payment status alone.
 */

const { Schema } = mongoose;

/**
 * ============================================================
 * PAYMENT SCHEMA
 * ============================================================
 */

const paymentTransactionSchema = new Schema(
  {
    /**
     * User responsible for payment.
     */

    payerId: {
      type: Schema.Types.ObjectId,

      ref: "User",

      required: true,

      immutable: true,

      index: true,
    },

    /**
     * Creator receiving the payment.
     *
     * This identifies the creator associated
     * with the transaction.
     *
     * It is not a payout ledger.
     */

    creatorId: {
      type: Schema.Types.ObjectId,

      ref: "User",

      required: true,

      immutable: true,
    },

    /**
     * Payment purpose.
     */

    purpose: {
      type: String,

      enum: Object.values(PAYMENT_PURPOSES),

      required: true,

      immutable: true,
    },

    /**
     * Subscription associated with payment.
     *
     * Required for subscription payments.
     */

    subscriptionId: {
      type: Schema.Types.ObjectId,

      ref: "SubscriberSubscription",

      default: null,

      immutable: true,
    },

    /**
     * Provider used for payment.
     */

    provider: {
      type: String,

      enum: Object.values(PAYMENT_PROVIDERS),

      required: true,

      immutable: true,
    },

    /**
     * Payment amount in minor currency units.
     *
     * KES 500.00 = 50000
     *
     * USD 10.00 = 1000
     */

    amountMinor: {
      type: Number,

      required: true,

      min: 1,

      max: 100000000000,

      immutable: true,

      validate: {
        validator: Number.isSafeInteger,

        message:
          "Payment amount must be a safe integer.",
      },
    },

    /**
     * Currency.
     */

    currency: {
      type: String,

      enum: Object.values(PAYMENT_CURRENCIES),

      required: true,

      immutable: true,
    },

    /**
     * Payment status.
     */

    status: {
      type: String,

      enum: Object.values(PAYMENT_STATUSES),

      default: PAYMENT_STATUSES.PENDING,

      required: true,
    },

    /**
     * Payment verification status.
     */

    verificationStatus: {
      type: String,

      enum: Object.values(
        PAYMENT_VERIFICATION_STATUSES
      ),

      default:
        PAYMENT_VERIFICATION_STATUSES.UNVERIFIED,

      required: true,
    },

    /**
     * Internal idempotency identifier.
     *
     * Prevents duplicate payment attempts
     * for the same payer and request key.
     */

    clientRequestId: {
      type: String,

      required: true,

      immutable: true,

      trim: true,

      minlength: 8,

      maxlength: 100,
    },

    /**
     * Provider transaction identifier.
     *
     * Examples:
     *
     * - Stripe PaymentIntent ID
     * - M-Pesa CheckoutRequestID
     *
     * This is not necessarily the final
     * settlement receipt.
     */

    providerTransactionId: {
      type: String,

      default: null,

      trim: true,

      maxlength: 255,
    },

    /**
     * Final provider payment reference.
     *
     * Examples:
     *
     * - M-Pesa receipt
     * - Provider charge identifier
     */

    providerReceipt: {
      type: String,

      default: null,

      trim: true,

      maxlength: 255,
    },

    /**
     * Timestamp of successful verification.
     */

    verifiedAt: {
      type: Date,

      default: null,
    },

    /**
     * Timestamp of successful payment.
     */

    paidAt: {
      type: Date,

      default: null,
    },

    /**
     * Failed payment details.
     */

    failureReason: {
      type: String,

      trim: true,

      maxlength: 100,

      default: null,
    },

    /**
     * Provider-independent failure message.
     *
     * Avoid storing sensitive payment details.
     */

    failureMessage: {
      type: String,

      trim: true,

      maxlength: 500,

      default: null,
    },

    /**
     * Billing period associated with payment.
     *
     * These values must eventually be
     * generated and verified server-side.
     */

    periodStart: {
      type: Date,

      default: null,
    },

    periodEnd: {
      type: Date,

      default: null,
    },
    /**
 * ============================================================
 * PROVIDER INITIATION TRACKING
 * ============================================================
 */

initiationStatus: {
  type: String,

  enum: Object.values(
    PAYMENT_INITIATION_STATUSES
  ),

  default:
    PAYMENT_INITIATION_STATUSES.RESERVED,

  required: true,
},

initiationClaimedAt: {
  type: Date,

  default: null,
},

initiationAcceptedAt: {
  type: Date,

  default: null,
},

/**
 * M-Pesa MerchantRequestID.
 *
 * Must match the corresponding provider response.
 */

merchantRequestId: {
  type: String,

  default: null,

  trim: true,

  maxlength: 255,
},

/**
 * Last known initiation error code.
 *
 * Do not store credentials or sensitive
 * provider response bodies.
 */

initiationErrorCode: {
  type: String,

  default: null,

  maxlength: 100,
},

    /**
     * Whether this payment has been applied
     * to the subscription lifecycle.
     *
     * A verified payment is not necessarily
     * an applied subscription entitlement.
     */

    entitlementAppliedAt: {
      type: Date,

      default: null,
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

paymentTransactionSchema.pre(
  "validate",
  function () {
    const subscriptionPurposes = [
      PAYMENT_PURPOSES.SUBSCRIPTION_INITIAL,
      PAYMENT_PURPOSES.SUBSCRIPTION_RENEWAL,
    ];

    /**
     * Subscription payments require
     * an associated subscription.
     */

    if (
      subscriptionPurposes.includes(this.purpose) &&
      !this.subscriptionId
    ) {
      this.invalidate(
        "subscriptionId",
        "Subscription payments require a subscription."
      );
    }

    /**
     * Validate billing-period chronology.
     */

    if (
      this.periodStart &&
      this.periodEnd &&
      this.periodEnd <= this.periodStart
    ) {
      this.invalidate(
        "periodEnd",
        "Payment period end must be after its start."
      );
    }

    /**
     * Verified payments require
     * a verification timestamp.
     */

    if (
      this.verificationStatus ===
        PAYMENT_VERIFICATION_STATUSES.VERIFIED &&
      !this.verifiedAt
    ) {
      this.invalidate(
        "verifiedAt",
        "Verified payments require a verification timestamp."
      );
    }

    /**
     * Successful payments must
     * have verified evidence.
     */

    if (
      this.status === PAYMENT_STATUSES.SUCCEEDED
    ) {
      if (
        this.verificationStatus !==
          PAYMENT_VERIFICATION_STATUSES.VERIFIED ||
        !this.verifiedAt ||
        !this.paidAt
      ) {
        this.invalidate(
          "status",
          "Successful payments require trusted verification and payment timestamps."
        );
      }
    }

    /**
     * Applied entitlements must
     * belong to verified payments.
     */

    if (
      this.entitlementAppliedAt &&
      (
        this.status !==
          PAYMENT_STATUSES.SUCCEEDED ||
        this.verificationStatus !==
          PAYMENT_VERIFICATION_STATUSES.VERIFIED
      )
    ) {
      this.invalidate(
        "entitlementAppliedAt",
        "Only verified successful payments may be applied."
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
 * Prevent duplicate payment requests.
 */

paymentTransactionSchema.index(
  {
    payerId: 1,

    clientRequestId: 1,
  },
  {
    unique: true,

    name: "unique_payment_request",
  }
);

/**
 * Prevent duplicate provider transaction IDs.
 */

paymentTransactionSchema.index(
  {
    provider: 1,

    providerTransactionId: 1,
  },
  {
    unique: true,

    name: "unique_provider_transaction",

    partialFilterExpression: {
      providerTransactionId: {
        $type: "string",
      },
    },
  }
);

/**
 * Prevent duplicate provider receipts.
 */

paymentTransactionSchema.index(
  {
    provider: 1,

    providerReceipt: 1,
  },
  {
    unique: true,

    name: "unique_provider_receipt",

    partialFilterExpression: {
      providerReceipt: {
        $type: "string",
      },
    },
  }
);

/**
 * Subscription payment history.
 */

paymentTransactionSchema.index(
  {
    subscriptionId: 1,

    createdAt: -1,
  },
  {
    name: "subscription_payment_history",
  }
);

/**
 * Renewal payment lookup.
 */

paymentTransactionSchema.index(
  {
    purpose: 1,

    status: 1,

    createdAt: 1,
  },
  {
    name: "payment_processing_lookup",
  }
);

/**
 * Provider reconciliation lookup.
 */

paymentTransactionSchema.index(
  {
    provider: 1,

    verificationStatus: 1,

    createdAt: 1,
  },
  {
    name: "payment_verification_lookup",
  }
);

paymentTransactionSchema.index(
  {
    subscriptionId: 1,
    purpose: 1,
    provider: 1,
    status: 1,
    createdAt: -1,
  },
  {
    name: "subscription_payment_attempt_lookup",
  }
);

paymentTransactionSchema.index(
  {
    subscriptionId: 1,
    purpose: 1,
    provider: 1,
  },
  {
    unique: true,

    name: "unique_open_initial_mpesa_payment",

    partialFilterExpression: {
      purpose: "SUBSCRIPTION_INITIAL",

      provider: "MPESA",

      status: {
        $in: [
          "PENDING",
          "PROCESSING",
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

const PaymentTransaction =
  mongoose.models.PaymentTransaction ||
  mongoose.model(
    "PaymentTransaction",
    paymentTransactionSchema
  );

export default PaymentTransaction;