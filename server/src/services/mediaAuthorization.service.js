
import mongoose from "mongoose";

import User from "../models/User.model.js";

import {
  MEDIA_STATUSES,
  MEDIA_MODERATION_STATUSES,
} from "../models/Media.model.js";

import MediaPurchase, {
  MEDIA_PURCHASE_STATUSES,
} from "../models/MediaPurchase.model.js";

import {
  PAYMENT_PURPOSES,
} from "../constants/payment.constants.js";

import {
  verifyPaymentTransaction,
} from "./paymentVerification.service.js";

import {
  authorizeSubscriberAccess,
} from "./subscriptionAuthorization.service.js";

import {
  MEDIA_ACCESS_POLICIES,
  MEDIA_ACCESS_REASONS,
} from "../constants/mediaAccess.constants.js";

/**
 * ============================================================
 * PREMIUMCHAT — MEDIA AUTHORIZATION SERVICE
 * ============================================================
 *
 * SECURITY REQUIREMENTS:
 *
 * 1. Media must come from a trusted database record.
 * 2. Media must be READY and APPROVED.
 * 3. Deleted media must never be delivered.
 * 4. Every viewer must have an active account.
 * 5. Every viewer must have valid adult verification.
 * 6. Creators can access their own approved media.
 * 7. Subscriber access requires a valid subscription.
 * 8. Purchase access requires an active entitlement
 *    and a verified payment.
 * 9. Unknown policies are denied.
 *
 * This service authorizes access only.
 * It does not generate download URLs.
 */

/**
 * ============================================================
 * INTERNAL HELPERS
 * ============================================================
 */

const deny = (reason) => ({
  hasAccess: false,
  reason,
  accessType: null,
});

const allow = (accessType) => ({
  hasAccess: true,
  reason: MEDIA_ACCESS_REASONS.ACCESS_GRANTED,
  accessType,
});

const isValidObjectId = (value) => {
  return mongoose.isObjectIdOrHexString(value);
};

const normalizeId = (value) => {
  return String(value?._id ?? value);
};

const sameId = (left, right) => {
  return (
    Boolean(left && right) &&
    normalizeId(left) === normalizeId(right)
  );
};

/**
 * ============================================================
 * VERIFY INDIVIDUAL MEDIA PURCHASE
 * ============================================================
 *
 * Access requires BOTH:
 *
 * 1. An ACTIVE MediaPurchase entitlement.
 * 2. An authoritative verified MEDIA_PURCHASE payment
 *    matching the purchase and its financial snapshots.
 *
 * A pending, refunded, disputed or revoked purchase
 * cannot grant access.
 *
 * This function does not activate or modify purchases.
 */

const verifyMediaPurchase = async ({
  viewerId,
  mediaId,
  creatorId,
}) => {
  if (
    !isValidObjectId(viewerId) ||
    !isValidObjectId(mediaId) ||
    !isValidObjectId(creatorId)
  ) {
    return false;
  }

  /**
   * STEP 1 — FIND ACTIVE PURCHASE ENTITLEMENT
   *
   * Scope the query to the buyer, media and creator.
   */

  const purchase = await MediaPurchase.findOne({
    buyerId: viewerId,
    mediaId,
    creatorId,
    status: MEDIA_PURCHASE_STATUSES.ACTIVE,
  });

  if (!purchase) {
    return false;
  }

  /**
   * STEP 2 — REQUIRE A LINKED PAYMENT
   */

  if (!isValidObjectId(purchase.paymentId)) {
    return false;
  }

  /**
   * STEP 3 — VERIFY AUTHORITATIVE PAYMENT EVIDENCE
   *
   * This is a read-only verification operation.
   * It does not trust STK acceptance or client evidence.
   */

  const verification = await verifyPaymentTransaction({
    paymentId: normalizeId(purchase.paymentId),
  });

  if (
    !verification ||
    verification.verified !== true ||
    !verification.payment
  ) {
    return false;
  }

  const payment = verification.payment;

  /**
   * STEP 4 — MATCH PAYMENT OWNERSHIP AND PURPOSE
   */

  if (
    !sameId(payment.payerId, purchase.buyerId) ||
    !sameId(payment.creatorId, purchase.creatorId) ||
    payment.purpose !== PAYMENT_PURPOSES.MEDIA_PURCHASE ||
    payment.subscriptionId != null
  ) {
    return false;
  }

  /**
   * STEP 5 — MATCH PURCHASE FINANCIAL SNAPSHOTS
   *
   * The payment must match the amount and currency
   * recorded when the purchase was reserved.
   */

  if (
    payment.amountMinor !== purchase.amountMinor ||
    payment.currency !== purchase.currency
  ) {
    return false;
  }

  /**
   * STEP 6 — CONFIRM PAYMENT AND PURCHASE ASSOCIATION
   */

  if (
    !sameId(payment._id, purchase.paymentId) ||
    !sameId(purchase.mediaId, mediaId) ||
    !sameId(purchase.buyerId, viewerId) ||
    !sameId(purchase.creatorId, creatorId)
  ) {
    return false;
  }

  return true;
};

/**
 * ============================================================
 * AUTHORIZE MEDIA ACCESS
 * ============================================================
 */

export const authorizeMediaAccess = async ({
  viewerId,
  media,
}) => {
  /**
   * STEP 1 — VALIDATE MEDIA RECORD
   */

  if (!media) {
    return deny(
      MEDIA_ACCESS_REASONS.MEDIA_NOT_FOUND
    );
  }

  const mediaId = media._id;
  const creatorId = media.creatorId?._id ?? media.creatorId;

  if (
    !isValidObjectId(mediaId) ||
    !isValidObjectId(creatorId)
  ) {
    return deny(
      MEDIA_ACCESS_REASONS.MEDIA_NOT_FOUND
    );
  }

  /**
   * STEP 2 — CHECK MEDIA AVAILABILITY
   *
   * No user, including the creator, can access
   * media that has not passed processing and moderation.
   */

if (
  media.status !== MEDIA_STATUSES.READY ||
  media.moderationStatus !==
    MEDIA_MODERATION_STATUSES.APPROVED ||
  media.deletedAt != null
) {
  return deny(MEDIA_ACCESS_REASONS.MEDIA_NOT_FOUND);
}

  /**
   * STEP 3 — VALIDATE VIEWER ID
   */

  if (!isValidObjectId(viewerId)) {
    return deny(
      MEDIA_ACCESS_REASONS.INVALID_VIEWER
    );
  }

  const normalizedViewerId = normalizeId(viewerId);
  const normalizedCreatorId = normalizeId(creatorId);
  const normalizedMediaId = normalizeId(mediaId);

  /**
   * STEP 4 — VERIFY VIEWER ACCOUNT AND AGE
   *
   * Always query the database.
   * Never trust account or age-verification
   * information supplied by the client.
   */

  const viewer = await User.findById(
    normalizedViewerId
  );

  if (
    !viewer ||
    !viewer.canAccessRestrictedContent()
  ) {
    return deny(
      MEDIA_ACCESS_REASONS.VIEWER_NOT_ELIGIBLE
    );
  }

  /**
   * STEP 5 — CREATOR OWNERSHIP
   *
   * Ownership does not bypass account eligibility,
   * media readiness, approval or deletion checks.
   */

  if (
    normalizedViewerId === normalizedCreatorId
  ) {
    if (!viewer.canUseCreatorFeatures()) {
      return deny(
        MEDIA_ACCESS_REASONS.VIEWER_NOT_ELIGIBLE
      );
    }

    return allow("CREATOR");
  }

  /**
   * STEP 6 — DETERMINE ACCESS POLICY
   */

  const policy = media.accessPolicy;

  /**
   * PUBLIC MEDIA
   *
   * Public means no subscription or purchase
   * is required. Authentication and adult
   * verification are still mandatory.
   */

  if (
    policy === MEDIA_ACCESS_POLICIES.PUBLIC
  ) {
    return allow("PUBLIC");
  }

  /**
   * SUBSCRIBERS-ONLY MEDIA
   */

  if (
    policy === MEDIA_ACCESS_POLICIES.SUBSCRIBERS_ONLY
  ) {
    const subscription =
      await authorizeSubscriberAccess({
        subscriberId: normalizedViewerId,
        creatorId: normalizedCreatorId,
      });

    if (!subscription.hasAccess) {
      return deny(
        MEDIA_ACCESS_REASONS.SUBSCRIPTION_REQUIRED
      );
    }

    return allow("SUBSCRIPTION");
  }

  /**
   * PURCHASE-ONLY MEDIA
   *
   * Subscription access must never bypass
   * an individual purchase requirement.
   */

  if (
    policy === MEDIA_ACCESS_POLICIES.PURCHASE_ONLY
  ) {
    const purchased =
      await verifyMediaPurchase({
        viewerId: normalizedViewerId,
        mediaId: normalizedMediaId,
        creatorId: normalizedCreatorId,
      });

    if (!purchased) {
      return deny(
        MEDIA_ACCESS_REASONS.PURCHASE_REQUIRED
      );
    }

    return allow("PURCHASE");
  }

  /**
   * SUBSCRIPTION OR PURCHASE
   *
   * Either entitlement may independently
   * grant access.
   */

  if (
    policy ===
    MEDIA_ACCESS_POLICIES.SUBSCRIPTION_OR_PURCHASE
  ) {
    const subscription =
      await authorizeSubscriberAccess({
        subscriberId: normalizedViewerId,
        creatorId: normalizedCreatorId,
      });

    if (subscription.hasAccess) {
      return allow("SUBSCRIPTION");
    }

    const purchased =
      await verifyMediaPurchase({
        viewerId: normalizedViewerId,
        mediaId: normalizedMediaId,
        creatorId: normalizedCreatorId,
      });

    if (purchased) {
      return allow("PURCHASE");
    }

    return deny(
      MEDIA_ACCESS_REASONS.ENTITLEMENT_REQUIRED
    );
  }

  /**
   * STEP 7 — DENY UNKNOWN POLICIES
   */

  return deny(
    MEDIA_ACCESS_REASONS.UNSUPPORTED_ACCESS_POLICY
  );
};

export default {
  authorizeMediaAccess,
};
