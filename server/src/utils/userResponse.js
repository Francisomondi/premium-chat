/**
 * ============================================================
 * SAFE USER RESPONSE
 * ============================================================
 *
 * Explicit allowlist of fields returned to clients.
 * Never serialize the entire Mongoose document.
 */

export const toSafeUserResponse = (user) => {
  if (!user) return null;

  return {
    id: user._id.toString(),
    displayName: user.displayName,
    email: user.email,
    role: user.role,
    accountStatus: user.accountStatus,

    emailVerified: Boolean(user.emailVerifiedAt),

    ageVerificationStatus:
      user.ageVerification?.status ?? "NOT_STARTED",

    creatorApplicationStatus:
      user.creatorApplication?.status ?? "NOT_APPLIED",

    createdAt: user.createdAt ?? null,
  };
};