import { z } from "zod";

import {
  MINIMUM_ACCOUNT_AGE,
} from "../constants/account.constants.js";

/**
 * Accept a calendar date in YYYY-MM-DD format.
 *
 * This is a self-declared date of birth, not
 * third-party identity verification.
 */
const dateOfBirthSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}$/,
    "Date of birth must use YYYY-MM-DD format."
  )
  .refine((value) => {
    const [year, month, day] = value
      .split("-")
      .map(Number);

    const date = new Date(
      Date.UTC(year, month - 1, day)
    );

    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }, "Please provide a valid date of birth.")
  .refine((value) => {
    const [year, month, day] = value
      .split("-")
      .map(Number);

    const today = new Date();

    let age =
      today.getFullYear() - year;

    const birthdayHasNotOccurred =
      today.getMonth() + 1 < month ||
      (
        today.getMonth() + 1 === month &&
        today.getDate() < day
      );

    if (birthdayHasNotOccurred) {
      age -= 1;
    }

    return age >= MINIMUM_ACCOUNT_AGE;
  }, `You must be at least ${MINIMUM_ACCOUNT_AGE} years old to use PremiumChat.`);

export const submitDateOfBirthSchema = z.object({
  dateOfBirth: dateOfBirthSchema,
});