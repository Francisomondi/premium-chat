import {
  describe,
  test,
} from "node:test";

import assert from "node:assert/strict";

import {
  hashPassword,
  verifyPassword,
  validatePassword,
  performDummyPasswordCheck,
} from "../../src/services/password.service.js";

describe("Password Security Service", () => {
  const validPassword =
    "This is a strong test passphrase 2026!";

  test("Accepts a valid password", () => {
    assert.equal(
      validatePassword(validPassword),
      true
    );
  });

  test("Rejects passwords shorter than 12 characters", () => {
    assert.throws(
      () => validatePassword("Short123!"),
      /at least 12 characters/
    );
  });

  test("Rejects passwords exceeding 72 UTF-8 bytes", () => {
    assert.throws(
      () => validatePassword("a".repeat(73)),
      /72 UTF-8 bytes/
    );
  });

  test("Rejects non-string passwords", () => {
    assert.throws(
      () => validatePassword(123456789012),
      /must be a string/
    );
  });

  test("Hashes passwords instead of storing plaintext", async () => {
    const hash = await hashPassword(validPassword);

    assert.notEqual(hash, validPassword);

    assert.match(
      hash,
      /^\$2[ab]\$12\$/
    );
  });

  test("Verifies the correct password", async () => {
    const hash = await hashPassword(validPassword);

    const result = await verifyPassword(
      validPassword,
      hash
    );

    assert.equal(result, true);
  });

  test("Rejects an incorrect password", async () => {
    const hash = await hashPassword(validPassword);

    const result = await verifyPassword(
      "Incorrect password 2026!",
      hash
    );

    assert.equal(result, false);
  });

  test("Rejects missing password hashes", async () => {
    const result = await verifyPassword(
      validPassword,
      null
    );

    assert.equal(result, false);
  });

  test("Dummy password check completes", async () => {
    await assert.doesNotReject(
      performDummyPasswordCheck(
        "Nonexistent account password"
      )
    );
  });
});