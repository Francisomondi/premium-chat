import mongoose from "mongoose";

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
 * SECURITY PRINCIPLES:
 *
 * 1. Media ownership must come from a trusted
 *    database record.
 *
 * 2. Media access policy must come from a trusted
 *    database record.
 *
 * 3. Subscription access never automatically
 *    grants purchase-only access.
 *
 * 4. Purchase access requires a verified,
 *    media-specific entitlement.
 *
 * 5. Unknown access policies are denied.
 *
 * 6. Payment verification failures deny access.
 *
 * IMPORTANT:
 *
 * This module does not expose media files.
 *
 * Actual media delivery must independently
 * enforce these authorization rules.
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

  reason:
    MEDIA_ACCESS_REASONS.ACCESS_GRANTED,

  accessType,
});

const isValidObjectId = (value) => {
  return mongoose.isObjectIdOrHexString(
    value
  );
};

/**
 * ============================================================
 * VERIFY INDIVIDUAL MEDIA PURCHASE
 * ============================================================
 *
 * Payment integration is not implemented.
 *
 * Until a trusted purchase entitlement exists,
 * this function must return false.
 *
 * Never replace this with:
 *
 * return true;
 *
 * Never trust a client-supplied payment status.
 */

const verifyMediaPurchase = async ({
  viewerId,
  mediaId,
}) => {
  void viewerId;
  void mediaId;

  return false;
};

/**
 * ============================================================
 * AUTHORIZE MEDIA ACCESS
 * ============================================================
 *
 * PARAMETERS:
 *
 * viewerId:
 *   Authenticated user requesting media.
 *
 * media:
 *   Trusted media record already retrieved
 *   from the database.
 *
 * IMPORTANT:
 *
 * Never pass a client-supplied media object
 * directly into this service.
 */

export const authorizeMediaAccess = async ({
  viewerId,
  media,
}) => {
  /**
   * STEP 1:
   * Validate the media record.
   */

  if (
    !media ||
    !isValidObjectId(media._id) ||
    !isValidObjectId(media.creatorId)
  ) {
    return deny(
      MEDIA_ACCESS_REASONS.MEDIA_NOT_FOUND
    );
  }

  /**
   * STEP 2:
   * Validate the viewer.
   */

  if (!isValidObjectId(viewerId)) {
    return deny(
      MEDIA_ACCESS_REASONS.INVALID_VIEWER
    );
  }

  const normalizedViewerId =
    viewerId.toString();

  const creatorId =
    media.creatorId.toString();

  const mediaId =
    media._id.toString();

  /**
   * STEP 3:
   * Allow the creator to access
   * their own media.
   *
   * This assumes creator ownership
   * has already been established from
   * a trusted database record.
   */

  if (normalizedViewerId === creatorId) {
    return allow("CREATOR");
  }

  /**
   * STEP 4:
   * Determine the media access policy.
   */

  const policy = media.accessPolicy;

  /**
   * PUBLIC MEDIA
   */

  if (
    policy ===
    MEDIA_ACCESS_POLICIES.PUBLIC
  ) {
    return allow("PUBLIC");
  }

  /**
   * SUBSCRIBERS-ONLY MEDIA
   */

  if (
    policy ===
    MEDIA_ACCESS_POLICIES.SUBSCRIBERS_ONLY
  ) {
    const subscription =
      await authorizeSubscriberAccess({
        subscriberId:
          normalizedViewerId,

        creatorId,
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
   * A subscription must not bypass
   * this authorization requirement.
   */

  if (
    policy ===
    MEDIA_ACCESS_POLICIES.PURCHASE_ONLY
  ) {
    const purchased =
      await verifyMediaPurchase({
        viewerId:
          normalizedViewerId,

        mediaId,
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
   * Either verified entitlement may
   * independently grant access.
   */

  if (
    policy ===
    MEDIA_ACCESS_POLICIES.SUBSCRIPTION_OR_PURCHASE
  ) {
    const subscription =
      await authorizeSubscriberAccess({
        subscriberId:
          normalizedViewerId,

        creatorId,
      });

    if (subscription.hasAccess) {
      return allow("SUBSCRIPTION");
    }

    const purchased =
      await verifyMediaPurchase({
        viewerId:
          normalizedViewerId,

        mediaId,
      });

    if (purchased) {
      return allow("PURCHASE");
    }

    return deny(
      MEDIA_ACCESS_REASONS.ENTITLEMENT_REQUIRED
    );
  }

  /**
   * STEP 5:
   * Reject unsupported access policies.
   */

  return deny(
    MEDIA_ACCESS_REASONS.UNSUPPORTED_ACCESS_POLICY
  );
};

export default {
  authorizeMediaAccess,
};