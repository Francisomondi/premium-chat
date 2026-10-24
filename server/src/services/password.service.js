import bcrypt from "bcryptjs";

/**
 * ============================================================
 * PASSWORD SECURITY SERVICE
 * ============================================================
 */

const BCRYPT_ROUNDS = 12;

const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_BYTES = 72;

const DUMMY_PASSWORD_HASH =
  "$2b$12$C6UzMDM.H6dfI/f/IKcEeO5M3I0Y0Kq/4.NI7s6j3M.mK7hVZLfUe";

/**
 * Validate a plaintext password before hashing.
 */
export const validatePassword = (password) => {
  if (typeof password !== "string") {
    throw new Error("Password must be a string.");
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `Password must contain at least ${MIN_PASSWORD_LENGTH} characters.`
    );
  }

  if (
    Buffer.byteLength(password, "utf8") >
    MAX_PASSWORD_BYTES
  ) {
    throw new Error(
      `Password must not exceed ${MAX_PASSWORD_BYTES} UTF-8 bytes.`
    );
  }

  return true;
};

/**
 * Hash a plaintext password.
 */
export const hashPassword = async (password) => {
  validatePassword(password);

  return bcrypt.hash(password, BCRYPT_ROUNDS);
};

/**
 * Verify a plaintext password against a stored hash.
 */
export const verifyPassword = async (
  password,
  passwordHash
) => {
  if (
    typeof password !== "string" ||
    typeof passwordHash !== "string" ||
    !passwordHash.startsWith("$2")
  ) {
    return false;
  }

  try {
    return await bcrypt.compare(
      password,
      passwordHash
    );
  } catch {
    return false;
  }
};

/**
 * Perform a comparable password-hashing operation
 * when an account does not exist.
 *
 * Future login controllers may use this to reduce
 * obvious account-enumeration timing differences.
 */
export const performDummyPasswordCheck = async (
  password
) => {
  await bcrypt.compare(
    typeof password === "string" ? password : "",
    DUMMY_PASSWORD_HASH
  );
};