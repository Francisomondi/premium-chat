
import mongoose from "mongoose";

/**
 * ============================================================
 * PREMIUMCHAT AUTHENTICATION SESSION MODEL
 * ============================================================
 *
 * Stores server-side authentication sessions.
 *
 * Each session belongs to one user.
 * A session may be revoked before its JWT expires.
 *
 * No raw JWTs or passwords are stored.
 */

const authSessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
      immutable: true,
    },

    expiresAt: {
      type: Date,
      required: true,
      immutable: true,
    },

    revokedAt: {
      type: Date,
      default: null,
    },

    lastUsedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    strict: "throw",
  }
);

/**
 * Efficiently find sessions belonging to a user.
 */
authSessionSchema.index({
  userId: 1,
  revokedAt: 1,
});

/**
 * Automatically remove expired session records.
 *
 * MongoDB TTL cleanup runs asynchronously.
 * Authentication must still check expiresAt.
 */
authSessionSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0 }
);

/**
 * Determine whether a session is currently valid.
 */
authSessionSchema.methods.isActive = function () {
  return (
    this.revokedAt === null &&
    this.expiresAt instanceof Date &&
    this.expiresAt.getTime() > Date.now()
  );
};

const AuthSession =
  mongoose.models.AuthSession ||
  mongoose.model(
    "AuthSession",
    authSessionSchema
  );

export default AuthSession;
