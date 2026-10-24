import {
  describe,
  test,
} from "node:test";

import assert from "node:assert/strict";

import User from "../../src/models/User.model.js";

import {
  ACCOUNT_ROLES,
  ACCOUNT_STATUSES,
  AGE_VERIFICATION_STATUSES,
  CREATOR_APPLICATION_STATUSES,
} from "../../src/constants/account.constants.js";

describe("User Model", () => {
  const createTestUser = () =>
    new User({
      displayName: "Test User",
      email: "TEST@EXAMPLE.COM",
      password: "Example password 2026!",
    });

  test("Defaults to USER role", () => {
    const user = createTestUser();

    assert.equal(
      user.role,
      ACCOUNT_ROLES.USER
    );
  });

  test("Defaults to ACTIVE account status", () => {
    const user = createTestUser();

    assert.equal(
      user.accountStatus,
      ACCOUNT_STATUSES.ACTIVE
    );
  });

  test("Normalizes email addresses", () => {
    const user = createTestUser();

    assert.equal(
      user.email,
      "test@example.com"
    );
  });

  test("Defaults to unverified adult status", () => {
    const user = createTestUser();

    assert.equal(
      user.ageVerification.status,
      AGE_VERIFICATION_STATUSES.NOT_STARTED
    );

    assert.equal(
      user.isAdultVerified(),
      false
    );
  });

  test("New accounts cannot access restricted content", () => {
    const user = createTestUser();

    assert.equal(
      user.canAccessRestrictedContent(),
      false
    );
  });

  test("Hashes plaintext password during validation", async () => {
    const user = createTestUser();

    await user.validate();

    assert.ok(user.passwordHash);

    assert.notEqual(
      user.passwordHash,
      "Example password 2026!"
    );

    const matches = await user.comparePassword(
      "Example password 2026!"
    );

    assert.equal(matches, true);
  });

test("Rejects invalid account roles", async () => {
  const user = createTestUser();

  user.role = "SUPER_ADMIN";

  await assert.rejects(
    user.validate(),
    (error) => {
      assert.equal(
        error.name,
        "ValidationError"
      );

      assert.ok(error.errors.role);

      assert.equal(
        error.errors.role.kind,
        "enum"
      );

      return true;
    }
  );
});

 test("Rejects invalid email addresses", async () => {
  const user = createTestUser();

  user.email = "not-an-email";

  await assert.rejects(
    user.validate(),
    (error) => {
      // Confirm this is a Mongoose validation error
      assert.equal(error.name, "ValidationError");

      // Confirm the email field caused the error
      assert.ok(error.errors.email);

      // Check the actual email validation message
      assert.match(
        error.errors.email.message,
        /valid email address/i
      );

      return true;
    }
  );
});

  test("Verified adult accounts may access restricted content", () => {
    const user = createTestUser();

    user.ageVerification.status =
      AGE_VERIFICATION_STATUSES.VERIFIED;

    user.ageVerification.verifiedAt =
      new Date();

    assert.equal(
      user.canAccessRestrictedContent(),
      true
    );
  });

  test("Expired verification denies restricted access", () => {
    const user = createTestUser();

    user.ageVerification.status =
      AGE_VERIFICATION_STATUSES.VERIFIED;

    user.ageVerification.verifiedAt =
      new Date("2025-01-01");

    user.ageVerification.expiresAt =
      new Date("2025-12-31");

    assert.equal(
      user.canAccessRestrictedContent(),
      false
    );
  });

  test("Suspended accounts cannot access restricted content", () => {
    const user = createTestUser();

    user.accountStatus =
      ACCOUNT_STATUSES.SUSPENDED;

    user.ageVerification.status =
      AGE_VERIFICATION_STATUSES.VERIFIED;

    user.ageVerification.verifiedAt =
      new Date();

    assert.equal(
      user.canAccessRestrictedContent(),
      false
    );
  });

  test("Creator features require approval and verified adulthood", () => {
    const user = createTestUser();

    user.role = ACCOUNT_ROLES.CREATOR;

    user.ageVerification.status =
      AGE_VERIFICATION_STATUSES.VERIFIED;

    user.ageVerification.verifiedAt =
      new Date();

    assert.equal(
      user.canUseCreatorFeatures(),
      false
    );

    user.creatorApplication.status =
      CREATOR_APPLICATION_STATUSES.APPROVED;

    assert.equal(
      user.canUseCreatorFeatures(),
      true
    );
  });

  test("JSON serialization excludes sensitive fields", async () => {
    const user = createTestUser();

    user.dateOfBirth = new Date("1995-05-10");

    user.ageVerification.providerReference =
      "private-provider-reference";

    await user.validate();

    const serialized = JSON.stringify(user);

    assert.equal(
      serialized.includes("passwordHash"),
      false
    );

    assert.equal(
      serialized.includes("dateOfBirth"),
      false
    );

    assert.equal(
      serialized.includes("private-provider-reference"),
      false
    );
  });
});