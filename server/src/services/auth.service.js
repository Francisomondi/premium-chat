import User from "../models/User.model.js";

import {
  ACCOUNT_ROLES,
  ACCOUNT_STATUSES,
  AGE_VERIFICATION_STATUSES,
  CREATOR_APPLICATION_STATUSES,
} from "../constants/account.constants.js";

import AppError from "../utils/AppError.js";
import {
  performDummyPasswordCheck,
} from "./password.service.js";

/**
 * ============================================================
 * REGISTER USER
 * ============================================================
 *
 * Password hashing happens in the User model's
 * pre-validation middleware.
 *
 * The database's unique email index is the final
 * protection against concurrent duplicate registration.
 */

export const registerUser = async ({
  displayName,
  email,
  password,
}) => {
  const normalizedEmail = email.trim().toLowerCase();

  const existingUser = await User.findOne({
    email: normalizedEmail,
  });

  if (existingUser) {
    throw new AppError(
      "An account with this email already exists.",
      409,
      "EMAIL_ALREADY_EXISTS"
    );
  }

  const user = new User({
    displayName: displayName.trim(),
    email: normalizedEmail,

    // Password virtual; never assign plaintext
    // to passwordHash.
    password,

    // Trusted server-side defaults.
    role: ACCOUNT_ROLES.USER,
    accountStatus: ACCOUNT_STATUSES.ACTIVE,

    ageVerification: {
      status: AGE_VERIFICATION_STATUSES.NOT_STARTED,
    },

    creatorApplication: {
      status: CREATOR_APPLICATION_STATUSES.NOT_APPLIED,
    },
  });

  try {
    await user.save();

    return user;
  } catch (error) {
    // MongoDB unique index violation.
    // This also handles simultaneous requests that
    // pass the initial findOne() check.
    if (
      error.code === 11000 &&
      (error.keyPattern?.email ||
        error.keyValue?.email)
    ) {
      throw new AppError(
        "An account with this email already exists.",
        409,
        "EMAIL_ALREADY_EXISTS"
      );
    }

    throw error;
  }
};


/**
 * ============================================================
 * LOGIN USER
 * ============================================================
 *
 * POST /api/auth/login
 *
 * Responsibilities:
 * 1. Normalize the email address.
 * 2. Find the user, including the password hash.
 * 3. Verify the submitted password.
 * 4. Reject suspended, banned or deactivated accounts.
 * 5. Record the successful login time.
 *
 * The controller will generate the JWT in a later step.
 */

export const loginUser = async ({
  email,
  password,
}) => {
  /**
   * STEP 1: NORMALIZE EMAIL
   */
  const normalizedEmail = email
    .trim()
    .toLowerCase();

  /**
   * STEP 2: FIND USER
   *
   * passwordHash is select:false in User.model.js.
   * We explicitly select it for authentication.
   */
  const user = await User.findOne({
    email: normalizedEmail,
  }).select("+passwordHash");

  /**
   * STEP 3: HANDLE UNKNOWN EMAIL
   *
   * A dummy bcrypt comparison reduces the
   * timing difference between existing and
   * nonexistent accounts.
   */
  if (!user) {
    await performDummyPasswordCheck(password);

    throw new AppError(
      "Invalid email or password.",
      401,
      "INVALID_CREDENTIALS"
    );
  }

  /**
   * STEP 4: VERIFY PASSWORD
   */
  const passwordMatches =
    await user.comparePassword(password);

  if (!passwordMatches) {
    throw new AppError(
      "Invalid email or password.",
      401,
      "INVALID_CREDENTIALS"
    );
  }

  /**
   * STEP 5: VERIFY ACCOUNT STATUS
   */
  if (
    user.accountStatus !==
    ACCOUNT_STATUSES.ACTIVE
  ) {
    throw new AppError(
      "This account is not available.",
      403,
      "ACCOUNT_UNAVAILABLE"
    );
  }

  /**
   * STEP 6: UPDATE LAST LOGIN
   */
  user.lastLoginAt = new Date();


  const loginUpdate = await User.updateOne(
    {
      _id: user._id,
      accountStatus: ACCOUNT_STATUSES.ACTIVE,
    },
    {
      $set: {
        lastLoginAt: user.lastLoginAt,
      },
    }
  );

  if (loginUpdate.matchedCount !== 1) {
    throw new AppError(
      "This account is not available.",
      403,
      "ACCOUNT_UNAVAILABLE"
    );
  }


  /**
   * STEP 7: RETURN AUTHENTICATED USER
   *
   * Do not return this raw user directly
   * in an HTTP response. The controller
   * will use toSafeUserResponse().
   */
  return user;
};
