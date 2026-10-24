import "dotenv/config";

import {
  describe,
  test,
  mock,
} from "node:test";

import assert from "node:assert/strict";

import request from "supertest";

import app from "../../src/app.js";
import User from "../../src/models/User.model.js";

import {
  ACCOUNT_ROLES,
  ACCOUNT_STATUSES,
  AGE_VERIFICATION_STATUSES,
} from "../../src/constants/account.constants.js";

/**
 * ============================================================
 * REGISTRATION API INTEGRATION TESTS
 * ============================================================
 *
 * Mocks database operations.
 * Does not create accounts in MongoDB Atlas.
 */

const validPayload = () => ({
  displayName: "Test Member",
  email: "member@example.com",
  password: "Strong test password 2026!",
});

const withMockedDatabase = async (callback) => {
  const findOneMock = mock.method(
    User,
    "findOne",
    async () => null
  );

  const saveMock = mock.method(
    User.prototype,
    "save",
    async function () {
      // Run Mongoose validation and password
      // hashing, without writing to MongoDB.
      await this.validate();

      this.createdAt = new Date();
      this.updatedAt = new Date();

      return this;
    }
  );

  try {
    await callback({
      findOneMock,
      saveMock,
    });
  } finally {
    saveMock.mock.restore();
    findOneMock.mock.restore();
  }
};

describe("POST /api/auth/register", () => {
  test("Creates a USER account with safe response", async () => {
    await withMockedDatabase(async ({ saveMock }) => {
      const response = await request(app)
        .post("/api/auth/register")
        .send(validPayload())
        .expect(201);

      assert.equal(response.body.success, true);
      assert.equal(
        response.body.data.user.role,
        ACCOUNT_ROLES.USER
      );

      assert.equal(
        response.body.data.user.accountStatus,
        ACCOUNT_STATUSES.ACTIVE
      );

      assert.equal(
        response.body.data.user.ageVerificationStatus,
        AGE_VERIFICATION_STATUSES.NOT_STARTED
      );

      assert.equal(saveMock.mock.callCount(), 1);

      const serialized = JSON.stringify(response.body);

      assert.equal(serialized.includes("passwordHash"), false);
      assert.equal(serialized.includes("Strong test password"), false);
      assert.equal(serialized.includes("dateOfBirth"), false);
    });
  });

  test("Rejects missing required fields", async () => {
    const response = await request(app)
      .post("/api/auth/register")
      .send({
        email: "member@example.com",
      })
      .expect(400);

    assert.equal(response.body.code, "VALIDATION_ERROR");
  });

  test("Rejects weak or short passwords", async () => {
    const response = await request(app)
      .post("/api/auth/register")
      .send({
        ...validPayload(),
        password: "short",
      })
      .expect(400);

    assert.equal(response.body.code, "VALIDATION_ERROR");
  });

  test("Rejects invalid email addresses", async () => {
    const response = await request(app)
      .post("/api/auth/register")
      .send({
        ...validPayload(),
        email: "invalid-email",
      })
      .expect(400);

    assert.equal(response.body.code, "VALIDATION_ERROR");
  });

  test("Rejects client-supplied ADMIN role", async () => {
    const response = await request(app)
      .post("/api/auth/register")
      .send({
        ...validPayload(),
        role: "ADMIN",
      })
      .expect(400);

    assert.equal(response.body.code, "VALIDATION_ERROR");
  });

  test("Rejects client-supplied age verification", async () => {
    const response = await request(app)
      .post("/api/auth/register")
      .send({
        ...validPayload(),
        ageVerification: {
          status: "VERIFIED",
        },
      })
      .expect(400);

    assert.equal(response.body.code, "VALIDATION_ERROR");
  });

  test("Returns 409 when email already exists", async () => {
    await withMockedDatabase(async ({ findOneMock }) => {
      findOneMock.mock.mockImplementation(
        async () => ({ _id: "existing-user" })
      );

      const response = await request(app)
        .post("/api/auth/register")
        .send(validPayload())
        .expect(409);

      assert.equal(
        response.body.code,
        "EMAIL_ALREADY_EXISTS"
      );
    });
  });

  test("Handles MongoDB duplicate-key race condition", async () => {
    await withMockedDatabase(async ({ saveMock }) => {
      saveMock.mock.mockImplementation(async () => {
        const error = new Error("Duplicate key");

        error.code = 11000;
        error.keyPattern = { email: 1 };

        throw error;
      });

      const response = await request(app)
        .post("/api/auth/register")
        .send(validPayload())
        .expect(409);

      assert.equal(
        response.body.code,
        "EMAIL_ALREADY_EXISTS"
      );
    });
  });

  test("Normalizes email before creating account", async () => {
    await withMockedDatabase(async ({ saveMock }) => {
      const response = await request(app)
        .post("/api/auth/register")
        .send({
          ...validPayload(),
          email: "  MEMBER@EXAMPLE.COM  ",
        })
        .expect(201);

      assert.equal(
        response.body.data.user.email,
        "member@example.com"
      );

      assert.equal(saveMock.mock.callCount(), 1);
    });
  });

  test("Does not issue authentication cookies", async () => {
    await withMockedDatabase(async () => {
      const response = await request(app)
        .post("/api/auth/register")
        .send(validPayload())
        .expect(201);

      assert.equal(
        response.headers["set-cookie"],
        undefined
      );
    });
  });
});