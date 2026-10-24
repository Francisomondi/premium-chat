/**
 * ============================================================
 * PREMIUMCHAT ACCOUNT CONSTANTS
 * ============================================================
 */

export const ACCOUNT_ROLES = Object.freeze({
  USER: "USER",
  CREATOR: "CREATOR",
  ADMIN: "ADMIN",
});

export const ACCOUNT_STATUSES = Object.freeze({
  ACTIVE: "ACTIVE",
  SUSPENDED: "SUSPENDED",
  BANNED: "BANNED",
  DEACTIVATED: "DEACTIVATED",
});

export const AGE_VERIFICATION_STATUSES = Object.freeze({
  NOT_STARTED: "NOT_STARTED",
  PENDING: "PENDING",
  VERIFIED: "VERIFIED",
  REJECTED: "REJECTED",
  EXPIRED: "EXPIRED",
});

export const CREATOR_APPLICATION_STATUSES = Object.freeze({
  NOT_APPLIED: "NOT_APPLIED",
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
});

export const MINIMUM_ACCOUNT_AGE = 18;

export const ROLE_VALUES = Object.values(ACCOUNT_ROLES);

export const ACCOUNT_STATUS_VALUES =
  Object.values(ACCOUNT_STATUSES);

export const AGE_VERIFICATION_STATUS_VALUES =
  Object.values(AGE_VERIFICATION_STATUSES);

export const CREATOR_APPLICATION_STATUS_VALUES =
  Object.values(CREATOR_APPLICATION_STATUSES);