import User from "../models/User.model.js";

import {
  AGE_VERIFICATION_STATUSES,
  MINIMUM_ACCOUNT_AGE,
} from "../constants/account.constants.js";

import AppError from "../utils/AppError.js";

/**
 * ============================================================
 * SELF-DECLARED DATE-OF-BIRTH AGE CHECK
 * ============================================================
 *
 * This is a self-declared age check.
 * It is NOT third-party identity verification.
 *
 * The service independently validates the date instead of
 * relying only on frontend validation.
 */

const calculateAge = (dateOfBirth, today = new Date()) => {
  let age =
    today.getFullYear() - dateOfBirth.getUTCFullYear();

  const birthdayHasNotOccurred =
    today.getMonth() + 1 < dateOfBirth.getUTCMonth() + 1 ||
    (
      today.getMonth() + 1 === dateOfBirth.getUTCMonth() + 1 &&
      today.getDate() < dateOfBirth.getUTCDate()
    );

  if (birthdayHasNotOccurred) {
    age -= 1;
  }

  return age;
};

const parseDateOfBirth = (value) => {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    throw new AppError(
      "Date of birth must use YYYY-MM-DD format.",
      400,
      "INVALID_DATE_OF_BIRTH"
    );
  }

  const [year, month, day] = value
    .split("-")
    .map(Number);

  const dateOfBirth = new Date(
    Date.UTC(year, month - 1, day)
  );

  const isValidDate =
    dateOfBirth.getUTCFullYear() === year &&
    dateOfBirth.getUTCMonth() === month - 1 &&
    dateOfBirth.getUTCDate() === day;

  if (!isValidDate) {
    throw new AppError(
      "Please provide a valid date of birth.",
      400,
      "INVALID_DATE_OF_BIRTH"
    );
  }

  return dateOfBirth;
};

/**
 * ============================================================
 * SUBMIT DATE OF BIRTH
 * ============================================================
 *
 * Updates the authenticated user's DOB and age status.
 *
 * The client cannot submit the verification status.
 */

export const submitDateOfBirth = async ({
  userId,
  dateOfBirth: dateOfBirthInput,
}) => {
  const dateOfBirth =
    parseDateOfBirth(dateOfBirthInput);

  const age = calculateAge(dateOfBirth);

  if (age < MINIMUM_ACCOUNT_AGE) {
    throw new AppError(
      `You must be at least ${MINIMUM_ACCOUNT_AGE} years old to use PremiumChat.`,
      403,
      "MINIMUM_AGE_REQUIREMENT_NOT_MET"
    );
  }

  const user = await User.findById(userId);

  if (!user) {
    throw new AppError(
      "User account not found.",
      404,
      "USER_NOT_FOUND"
    );
  }

  user.dateOfBirth = dateOfBirth;

  user.ageVerification = {
    status: AGE_VERIFICATION_STATUSES.VERIFIED,
    provider: "SELF_DECLARED",
    providerReference: null,
    verifiedAt: new Date(),
    expiresAt: null,
  };

  await user.save();

  return user;
};