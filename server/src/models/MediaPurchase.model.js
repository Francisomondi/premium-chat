
import mongoose from "mongoose";

/**
 * ============================================================
 * PREMIUMCHAT — MEDIA PURCHASE MODEL
 * ============================================================
 *
 * Records individual media purchases and access entitlements.
 *
 * IMPORTANT:
 *
 * - PaymentTransaction remains the source of payment truth.
 * - A purchase becomes ACTIVE only after backend payment
 *   verification and entitlement activation.
 * - This model does not independently verify payments.
 * - Refunded and revoked purchases cannot grant access.
 * - Historical purchase pricing is preserved.
 */

export const MEDIA_PURCHASE_STATUSES = Object.freeze({
  PENDING: "PENDING",
  ACTIVE: "ACTIVE",
  REFUNDED: "REFUNDED",
  DISPUTED: "DISPUTED",
  REVOKED: "REVOKED",
});

const mediaPurchaseSchema = new mongoose.Schema(
  {
    /**
     * ========================================================
     * PURCHASE OWNERSHIP
     * ========================================================
     */

    mediaId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Media",
      required: true,
      immutable: true,
    },

    buyerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },

    creatorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },

    /**
     * ========================================================
     * PAYMENT REFERENCE
     * ========================================================
     */

    paymentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "PaymentTransaction",
    default: null,
    },

    /**
     * ========================================================
     * PURCHASE PRICE SNAPSHOT
     * ========================================================
     *
     * Values are copied from the server-controlled media
     * price when the purchase is initiated.
     *
     * KES 500.00 = 50000 minor units.
     */

    amountMinor: {
      type: Number,
      required: true,
      min: 1,
      immutable: true,
      validate: {
        validator: Number.isSafeInteger,
        message: "Purchase amount must be a valid integer.",
      },
    },

    currency: {
      type: String,
      enum: ["KES", "USD"],
      required: true,
      immutable: true,
    },

    /**
     * ========================================================
     * PURCHASE STATUS
     * ========================================================
     */

    status: {
      type: String,
      enum: Object.values(MEDIA_PURCHASE_STATUSES),
      default: MEDIA_PURCHASE_STATUSES.PENDING,
      required: true,
    },

    /**
     * ========================================================
     * ENTITLEMENT LIFECYCLE
     * ========================================================
     */

    activatedAt: {
      type: Date,
      default: null,
    },

    refundedAt: {
      type: Date,
      default: null,
    },

    revokedAt: {
      type: Date,
      default: null,
    },

    disputedAt: {
      type: Date,
      default: null,
    },

    revocationReason: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null,
    },

    /**
     * ========================================================
     * IDEMPOTENCY
     * ========================================================
     *
     * Identifies a purchase attempt and prevents duplicate
     * purchase records from being created on retries.
     */

    clientRequestId: {
      type: String,
      required: true,
      trim: true,
      maxlength: 128,
      immutable: true,
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

mediaPurchaseSchema.pre("validate", function () {
  if (
    this.status === MEDIA_PURCHASE_STATUSES.ACTIVE &&
    !this.activatedAt
  ) {
    this.invalidate(
      "activatedAt",
      "Active purchases require an activation timestamp."
    );
  }

  if (
    this.status === MEDIA_PURCHASE_STATUSES.REFUNDED &&
    !this.refundedAt
  ) {
    this.invalidate(
      "refundedAt",
      "Refunded purchases require a refund timestamp."
    );
  }

  if (
    this.status === MEDIA_PURCHASE_STATUSES.REVOKED &&
    !this.revokedAt
  ) {
    this.invalidate(
      "revokedAt",
      "Revoked purchases require a revocation timestamp."
    );
  }

  if (
    this.status === MEDIA_PURCHASE_STATUSES.DISPUTED &&
    !this.disputedAt
  ) {
    this.invalidate(
      "disputedAt",
      "Disputed purchases require a dispute timestamp."
    );
  }
});

/**
 * ============================================================
 * INDEXES
 * ============================================================
 */

/**
 * One purchase attempt per buyer and request ID.
 */

mediaPurchaseSchema.index(
  {
    buyerId: 1,
    clientRequestId: 1,
  },
  {
    unique: true,
    name: "unique_buyer_media_purchase_request",
  }
);

/**
 * A payment transaction can only fund one media purchase.
 */

mediaPurchaseSchema.index(
  {
    paymentId: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      paymentId: {
        $type: "objectId",
      },
    },
    name: "unique_media_purchase_payment",
  }
);

/**
 * Prevent multiple active or pending purchase entitlements
 * for the same buyer and media item.
 *
 * Refunded, disputed and revoked records do not block
 * a new purchase attempt.
 */

mediaPurchaseSchema.index(
  {
    buyerId: 1,
    mediaId: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      status: {
        $in: [
          MEDIA_PURCHASE_STATUSES.PENDING,
          MEDIA_PURCHASE_STATUSES.ACTIVE,
        ],
      },
    },
    name: "unique_active_or_pending_media_purchase",
  }
);

/**
 * Buyer purchase history.
 */

mediaPurchaseSchema.index(
  {
    buyerId: 1,
    createdAt: -1,
  },
  {
    name: "buyer_media_purchase_history",
  }
);

/**
 * Creator revenue and purchase history.
 */

mediaPurchaseSchema.index(
  {
    creatorId: 1,
    createdAt: -1,
  },
  {
    name: "creator_media_purchase_history",
  }
);

/**
 * Media purchase history.
 */

mediaPurchaseSchema.index(
  {
    mediaId: 1,
    createdAt: -1,
  },
  {
    name: "media_purchase_history",
  }
);

/**
 * ============================================================
 * MODEL EXPORT
 * ============================================================
 */

const MediaPurchase =
  mongoose.models.MediaPurchase ||
  mongoose.model("MediaPurchase", mediaPurchaseSchema);

export default MediaPurchase;
