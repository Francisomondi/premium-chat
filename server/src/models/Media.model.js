
import mongoose from "mongoose";

import {
  MEDIA_ACCESS_POLICIES,
} from "../constants/mediaAccess.constants.js";

/**
 * ============================================================
 * PREMIUMCHAT — MEDIA MODEL
 * ============================================================
 *
 * Stores metadata for creator-uploaded images/videos.
 *
 * SECURITY:
 * - Actual files are stored privately.
 * - Storage keys must never be exposed publicly.
 * - Pricing is controlled by the server.
 * - Payment status is never stored as a simple
 *   client-controlled media flag.
 * - Media cannot be delivered until approved.
 */

const MEDIA_TYPES = Object.freeze({
  IMAGE: "IMAGE",
  VIDEO: "VIDEO",
});

const MEDIA_STATUSES = Object.freeze({
  UPLOADING: "UPLOADING",
  PROCESSING: "PROCESSING",
  READY: "READY",
  FAILED: "FAILED",
  DELETED: "DELETED",
});

const MODERATION_STATUSES = Object.freeze({
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
});

const mediaSchema = new mongoose.Schema(
  {
    /**
     * ========================================================
     * OWNERSHIP
     * ========================================================
     */

    /**
     * The creator associated with this media.
     *
     * For conversation uploads, this is the conversation's
     * creator, regardless of which participant uploaded it.
     * It remains the attribution owner for paid media.
     *
     * Legacy records use creatorId as their uploader identity.
     */

    creatorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
      index: true,
    },

    /**
     * The authenticated account that uploaded the file.
     *
     * Optional only for backwards compatibility with
     * existing records created before uploader tracking.
     */

    uploaderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      immutable: true,
      default: null,
      index: true,
    },

    /**
     * Optional conversation association.
     *
     * For private chat media, this should be
     * the conversation where it was uploaded.
     */

    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      default: null,
      immutable: true,
    },

    /**
     * ========================================================
     * RIGHTS, CONSENT AND UPLOAD EXPIRY
     * ========================================================
     *
     * These fields record creator declarations.
     * They do not independently verify age, identity,
     * consent or ownership of uploaded content.
     */

    rightsConfirmed: {
      type: Boolean,
      required: true,
      immutable: true,
      validate: {
        validator: value => value === true,
        message: "Creator must confirm media rights.",
      },
    },

    allDepictedAdultsAndConsented: {
      type: Boolean,
      required: true,
      immutable: true,
      validate: {
        validator: value => value === true,
        message:
          "Adult status and consent confirmation is required.",
      },
    },

    attestationVersion: {
      type: String,
      required: true,
      trim: true,
      maxlength: 30,
      immutable: true,
    },

    attestedAt: {
      type: Date,
      required: true,
      immutable: true,
    },

    uploadExpiresAt: {
      type: Date,
      required: true,
    },

    /**
     * ========================================================
     * MEDIA DETAILS
     * ========================================================
     */

    mediaType: {
      type: String,
      enum: Object.values(MEDIA_TYPES),
      required: true,
    },

    mimeType: {
      type: String,
      required: true,
      trim: true,
    },

    fileSize: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isSafeInteger,
        message: "File size must be a valid integer.",
      },
    },

    /**
     * Private storage identifier.
     *
     * Never return this field to subscribers.
     */

    storageKey: {
      type: String,
      required: true,
      select: false,
    },

    /**
     * Optional safe preview identifier.
     *
     * Previews must be generated separately
     * and must not reveal protected content.
     */

    previewStorageKey: {
      type: String,
      default: null,
      select: false,
    },

    /**
     * ========================================================
     * ACCESS AND MONETIZATION
     * ========================================================
     */

    accessPolicy: {
      type: String,
      enum: Object.values(MEDIA_ACCESS_POLICIES),
      required: true,
      default: MEDIA_ACCESS_POLICIES.PURCHASE_ONLY,
    },

    priceMinor: {
      type: Number,
      min: 0,
      default: 0,
      validate: {
        validator: Number.isSafeInteger,
        message: "Media price must be a valid integer.",
      },
    },

    currency: {
      type: String,
      enum: ["KES", "USD"],
      default: "KES",
      required: true,
    },

    /**
     * ========================================================
     * UPLOAD STATUS
     * ========================================================
     */

    status: {
      type: String,
      enum: Object.values(MEDIA_STATUSES),
      default: MEDIA_STATUSES.UPLOADING,
      required: true,
    },

    /**
     * ========================================================
     * CONTENT MODERATION
     * ========================================================
     */

    moderationStatus: {
      type: String,
      enum: Object.values(MODERATION_STATUSES),
      default: MODERATION_STATUSES.PENDING,
      required: true,
    },

    moderatedAt: {
      type: Date,
      default: null,
    },

    moderatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    /**
     * ========================================================
     * SOFT DELETE
     * ========================================================
     */

    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

/**
 * ============================================================
 * MODEL VALIDATION
 * ============================================================
 */

mediaSchema.pre("validate", function () {
  const requiresPurchase =
    this.accessPolicy === MEDIA_ACCESS_POLICIES.PURCHASE_ONLY ||
    this.accessPolicy ===
      MEDIA_ACCESS_POLICIES.SUBSCRIPTION_OR_PURCHASE;

  if (
    requiresPurchase &&
    (!Number.isSafeInteger(this.priceMinor) ||
      this.priceMinor <= 0)
  ) {
    this.invalidate(
      "priceMinor",
      "Purchase-enabled media must have a positive price."
    );
  }

  if (
    !requiresPurchase &&
    this.priceMinor !== 0
  ) {
    this.invalidate(
      "priceMinor",
      "Media without purchase access must have a zero price."
    );
  }

  if (
    this.status === MEDIA_STATUSES.DELETED &&
    !this.deletedAt
  ) {
    this.invalidate(
      "deletedAt",
      "Deleted media must have a deletion timestamp."
    );
  }

  if (
    this.status !== MEDIA_STATUSES.DELETED &&
    this.deletedAt
  ) {
    this.invalidate(
      "deletedAt",
      "Only deleted media may have a deletion timestamp."
    );
  }
});

/**
 * ============================================================
 * INDEXES
 * ============================================================
 */

mediaSchema.index(
  {
    creatorId: 1,
    createdAt: -1,
  },
  {
    name: "creator_media_history",
  }
);

mediaSchema.index(
  {
    conversationId: 1,
    createdAt: -1,
  },
  {
    name: "conversation_media_history",
  }
);

mediaSchema.index(
  {
    status: 1,
    moderationStatus: 1,
  },
  {
    name: "media_processing_moderation",
  }
);

/**
 * ============================================================
 * MODEL EXPORTS
 * ============================================================
 */

const Media =
  mongoose.models.Media ||
  mongoose.model("Media", mediaSchema);

export {
  MEDIA_TYPES,
  MEDIA_STATUSES,
  MODERATION_STATUSES as MEDIA_MODERATION_STATUSES,
};

export default Media;
