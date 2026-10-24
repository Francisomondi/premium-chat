
import test, {
  after,
  before,
  beforeEach,
} from "node:test";

import assert from "node:assert/strict";
import mongoose from "mongoose";
import request from "supertest";

import User from "../../src/models/User.model.js";
import AuthSession from "../../src/models/AuthSession.model.js";

import {
  signAccessToken,
  verifyAccessToken,
  ACCESS_COOKIE_NAME,
} from "../../src/services/token.service.js";

import {
  createSession,
  getActiveSession,
  revokeSession,
} from "../../src/services/session.service.js";

import {
  requireAuth,
} from "../../src/middleware/auth.middleware.js";

import {
  login,
  logout,
  getMe,
} from "../../src/controllers/auth.controller.js";

/**
 * ============================================================
 * PREMIUMCHAT AUTHENTICATION INTEGRATION TESTS
 * ============================================================
 *
 * Tests:
 * - Session creation
 * - JWT session binding
 * - Session validation
 * - Revocation
 * - Logout
 * - Protected routes
 *
 * No live MongoDB connection is required.
 */

const userId = new mongoose.Types.ObjectId();
const sessionId = new mongoose.Types.ObjectId();

const mockUser = {
  _id: userId,
  email: "premiumchat-test@example.com",
  displayName: "PremiumChat Test User",
  accountStatus: "ACTIVE",
};

const mockSession = {
  _id: sessionId,
  userId,
  expiresAt: new Date(Date.now() + 900000),
  revokedAt: null,
  isActive() {
    return (
      this.revokedAt === null &&
      this.expiresAt > new Date()
    );
  },
};

/**
 * ============================================================
 * ORIGINAL MODEL METHODS
 * ============================================================
 */

const originalMethods = {
  sessionCreate: AuthSession.create,
  sessionFindOne: AuthSession.findOne,
  sessionUpdateOne: AuthSession.updateOne,
  sessionUpdateMany: AuthSession.updateMany,
  userFindById: User.findById,
};

/**
 * ============================================================
 * TEST HELPERS
 * ============================================================
 */

const makeResponse = () => {
  const res = {
    statusCode: 200,
    cookies: {},
    clearedCookies: [],
    body: null,

    status(code) {
      this.statusCode = code;
      return this;
    },

    cookie(name, value, options) {
      this.cookies[name] = {
        value,
        options,
      };
      return this;
    },

    clearCookie(name, options) {
      this.clearedCookies.push({
        name,
        options,
      });
      return this;
    },

    json(body) {
      this.body = body;
      return this;
    },
  };

  return res;
};

const makeRequest = ({
  token = null,
  user = null,
} = {}) => ({
  cookies: token
    ? { [ACCESS_COOKIE_NAME]: token }
    : {},
  user,
  requestId: "test-request",
});

const invokeMiddleware = async (req) => {
  let nextError;
  let nextCalled = false;

  await requireAuth(
    req,
    makeResponse(),
    (error) => {
      nextCalled = true;
      nextError = error;
    }
  );

  return {
    nextCalled,
    nextError,
    req,
  };
};

const resetMocks = () => {
  mockSession.revokedAt = null;
  mockSession.expiresAt = new Date(
    Date.now() + 900000
  );

  AuthSession.create = async (data) => ({
    ...mockSession,
    ...data,
  });

  AuthSession.findOne = async () =>
    mockSession.revokedAt === null &&
    mockSession.expiresAt > new Date()
      ? mockSession
      : null;

  AuthSession.updateOne = async () => {
    if (mockSession.revokedAt !== null) {
      return { modifiedCount: 0 };
    }

    mockSession.revokedAt = new Date();

    return { modifiedCount: 1 };
  };

  AuthSession.updateMany = async () => ({
    modifiedCount: 1,
  });

  User.findById = async () => mockUser;
};

beforeEach(resetMocks);

after(() => {
  AuthSession.create = originalMethods.sessionCreate;
  AuthSession.findOne = originalMethods.sessionFindOne;
  AuthSession.updateOne = originalMethods.sessionUpdateOne;
  AuthSession.updateMany = originalMethods.sessionUpdateMany;
  User.findById = originalMethods.userFindById;
});

/**
 * ============================================================
 * SESSION SERVICE TESTS
 * ============================================================
 */

test("creates a MongoDB authentication session", async () => {
  const session = await createSession(userId);

  assert.ok(session);
  assert.equal(
    session.userId.toString(),
    userId.toString()
  );
  assert.ok(session.expiresAt > new Date());
});

test("retrieves an active session", async () => {
  const session = await getActiveSession(
    sessionId,
    userId
  );

  assert.ok(session);
  assert.equal(
    session._id.toString(),
    sessionId.toString()
  );
});

test("rejects a revoked session", async () => {
  mockSession.revokedAt = new Date();

  const session = await getActiveSession(
    sessionId,
    userId
  );

  assert.equal(session, null);
});

test("rejects an expired session", async () => {
  mockSession.expiresAt = new Date(
    Date.now() - 1000
  );

  const session = await getActiveSession(
    sessionId,
    userId
  );

  assert.equal(session, null);
});

test("revokes an authentication session", async () => {
  const revoked = await revokeSession(
    sessionId,
    userId
  );

  assert.equal(revoked, true);
  assert.ok(mockSession.revokedAt);
});

test("prevents repeated session revocation", async () => {
  await revokeSession(sessionId, userId);

  const secondAttempt = await revokeSession(
    sessionId,
    userId
  );

  assert.equal(secondAttempt, false);
});

/**
 * ============================================================
 * JWT TESTS
 * ============================================================
 */

test("JWT contains user and session IDs", () => {
  const token = signAccessToken(
    mockUser,
    sessionId
  );

  const payload = verifyAccessToken(token);

  assert.equal(
    payload.sub,
    userId.toString()
  );

  assert.equal(
    payload.sid,
    sessionId.toString()
  );

  assert.equal(
    payload.tokenType,
    "access"
  );
});

test("JWT rejects missing session ID", () => {
  assert.throws(
    () => signAccessToken(mockUser),
    /valid session ID/
  );
});

test("JWT rejects invalid tokens", () => {
  assert.throws(
    () => verifyAccessToken("invalid-token")
  );
});

/**
 * ============================================================
 * AUTHENTICATION MIDDLEWARE TESTS
 * ============================================================
 */

test("allows valid active sessions", async () => {
  const token = signAccessToken(
    mockUser,
    sessionId
  );

  const result = await invokeMiddleware(
    makeRequest({ token })
  );

  assert.equal(result.nextCalled, true);
  assert.equal(result.nextError, undefined);

  assert.equal(
    result.req.auth.sessionId,
    sessionId.toString()
  );
});

test("rejects missing authentication cookie", async () => {
  const result = await invokeMiddleware(
    makeRequest()
  );

  assert.equal(
    result.nextError?.statusCode,
    401
  );
});

test("rejects revoked sessions", async () => {
  mockSession.revokedAt = new Date();

  const token = signAccessToken(
    mockUser,
    sessionId
  );

  const result = await invokeMiddleware(
    makeRequest({ token })
  );

  assert.equal(
    result.nextError?.statusCode,
    401
  );
});

test("rejects expired sessions", async () => {
  mockSession.expiresAt = new Date(
    Date.now() - 1000
  );

  const token = signAccessToken(
    mockUser,
    sessionId
  );

  const result = await invokeMiddleware(
    makeRequest({ token })
  );

  assert.equal(
    result.nextError?.statusCode,
    401
  );
});

/**
 * ============================================================
 * LOGOUT TESTS
 * ============================================================
 */

test("logout revokes session and clears cookie", async () => {
  const token = signAccessToken(
    mockUser,
    sessionId
  );

  const req = makeRequest({ token });
  const res = makeResponse();

  let error;

  await logout(req, res, (err) => {
    error = err;
  });

  assert.equal(error, undefined);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);

  assert.ok(mockSession.revokedAt);

  assert.ok(
    res.clearedCookies.some(
      (item) =>
        item.name === ACCESS_COOKIE_NAME
    )
  );
});

test("logout succeeds without a cookie", async () => {
  const req = makeRequest();
  const res = makeResponse();

  await logout(req, res, () => {});

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
});

test("revoked JWT cannot authenticate again", async () => {
  const token = signAccessToken(
    mockUser,
    sessionId
  );

  await revokeSession(
    sessionId,
    userId
  );

  const result = await invokeMiddleware(
    makeRequest({ token })
  );

  assert.equal(
    result.nextError?.statusCode,
    401
  );
});
