import test from "node:test";
import assert from "node:assert/strict";

import mongoose from "mongoose";

import PaymentTransaction from "../../src/models/PaymentTransaction.model.js";

import {
  PAYMENT_PURPOSES,
  PAYMENT_STATUSES,
  PAYMENT_PROVIDERS,
  PAYMENT_VERIFICATION_STATUSES,
  PAYMENT_CURRENCIES,
  PAYMENT_INITIATION_STATUSES,
} from "../../src/constants/payment.constants.js";

/**
 * ============================================================
 * PREMIUMCHAT — PAYMENT TRANSACTION SECURITY TESTS
 * ============================================================
 *
 * STEP 19.8.30.10
 *
 * These tests:
 *
 * - Do not connect to MongoDB.
 * - Do not initiate STK Push.
 * - Do not modify production records.
 * - Validate payment schema security invariants.
 */

const createPayment = (overrides = {}) => {
  return new PaymentTransaction({
    payerId: new mongoose.Types.ObjectId(),

    creatorId: new mongoose.Types.ObjectId(),

    subscriptionId:
      new mongoose.Types.ObjectId(),

    purpose:
      PAYMENT_PURPOSES.SUBSCRIPTION_INITIAL,

    provider:
      PAYMENT_PROVIDERS.MPESA,

    amountMinor: 50000,

    currency:
      PAYMENT_CURRENCIES.KES,

    clientRequestId:
      "test-payment-request-001",

    status:
      PAYMENT_STATUSES.PENDING,

    verificationStatus:
      PAYMENT_VERIFICATION_STATUSES.UNVERIFIED,

    initiationStatus:
      PAYMENT_INITIATION_STATUSES.RESERVED,

    ...overrides,
  });
};

/**
 * ============================================================
 * TEST 1 — VALID PENDING PAYMENT
 * ============================================================
 */

test(
  "allows a valid pending payment",
  async () => {
    const payment = createPayment();

    await payment.validate();

    assert.equal(
      payment.status,
      PAYMENT_STATUSES.PENDING
    );

    assert.equal(
      payment.verificationStatus,
      PAYMENT_VERIFICATION_STATUSES.UNVERIFIED
    );

    assert.equal(
      payment.entitlementAppliedAt,
      null
    );
  }
);

/**
 * ============================================================
 * TEST 2 — UNVERIFIED PAYMENT CANNOT SUCCEED
 * ============================================================
 */

test(
  "rejects a successful payment without trusted verification",
  async () => {
    const payment = createPayment({
      status:
        PAYMENT_STATUSES.SUCCEEDED,
    });

    await assert.rejects(
      payment.validate(),
      mongoose.Error.ValidationError
    );
  }
);

/**
 * ============================================================
 * TEST 3 — VERIFIED PAYMENT REQUIRES TIMESTAMP
 * ============================================================
 */

test(
  "rejects VERIFIED status without verifiedAt",
  async () => {
    const payment = createPayment({
      verificationStatus:
        PAYMENT_VERIFICATION_STATUSES.VERIFIED,
    });

    await assert.rejects(
      payment.validate(),
      mongoose.Error.ValidationError
    );
  }
);

/**
 * ============================================================
 * TEST 4 — SUCCESSFUL PAYMENT REQUIRES paidAt
 * ============================================================
 */

test(
  "rejects successful payment without paidAt",
  async () => {
    const payment = createPayment({
      status:
        PAYMENT_STATUSES.SUCCEEDED,

      verificationStatus:
        PAYMENT_VERIFICATION_STATUSES.VERIFIED,

      verifiedAt: new Date(),
    });

    await assert.rejects(
      payment.validate(),
      mongoose.Error.ValidationError
    );
  }
);

/**
 * ============================================================
 * TEST 5 — UNVERIFIED ENTITLEMENT APPLICATION
 * ============================================================
 */

test(
  "rejects entitlement application for an unverified payment",
  async () => {
    const payment = createPayment({
      entitlementAppliedAt:
        new Date(),
    });

    await assert.rejects(
      payment.validate(),
      mongoose.Error.ValidationError
    );
  }
);

/**
 * ============================================================
 * TEST 6 — VERIFIED PAYMENT MAY BE VALID
 * ============================================================
 */

test(
  "allows a successful payment with verification timestamps",
  async () => {
    const now = new Date();

    const payment = createPayment({
      status:
        PAYMENT_STATUSES.SUCCEEDED,

      verificationStatus:
        PAYMENT_VERIFICATION_STATUSES.VERIFIED,

      verifiedAt: now,

      paidAt: now,
    });

    await payment.validate();

    assert.equal(
      payment.status,
      PAYMENT_STATUSES.SUCCEEDED
    );
  }
);

/**
 * ============================================================
 * TEST 7 — INVALID PAYMENT AMOUNT
 * ============================================================
 */

test(
  "rejects zero payment amount",
  async () => {
    const payment = createPayment({
      amountMinor: 0,
    });

    await assert.rejects(
      payment.validate(),
      mongoose.Error.ValidationError
    );
  }
);

/**
 * ============================================================
 * TEST 8 — FRACTIONAL PAYMENT AMOUNT
 * ============================================================
 */

test(
  "rejects fractional minor-unit amounts",
  async () => {
    const payment = createPayment({
      amountMinor: 500.75,
    });

    await assert.rejects(
      payment.validate(),
      mongoose.Error.ValidationError
    );
  }
);

/**
 * ============================================================
 * TEST 9 — SUBSCRIPTION PAYMENT REQUIRES SUBSCRIPTION
 * ============================================================
 */

test(
  "rejects subscription payment without subscriptionId",
  async () => {
    const payment = createPayment({
      subscriptionId: null,
    });

    await assert.rejects(
      payment.validate(),
      mongoose.Error.ValidationError
    );
  }
);

/**
 * ============================================================
 * TEST 10 — INVALID PHONE FINGERPRINT
 * ============================================================
 */

test(
  "rejects invalid payment phone fingerprint",
  async () => {
    const payment = createPayment({
      paymentPhoneFingerprint:
        "invalid-fingerprint",
    });

    await assert.rejects(
      payment.validate(),
      mongoose.Error.ValidationError
    );
  }
);

/**
 * ============================================================
 * TEST 11 — VALID PHONE FINGERPRINT
 * ============================================================
 */

test(
  "accepts a valid 64-character hexadecimal fingerprint",
  async () => {
    const payment = createPayment({
      paymentPhoneFingerprint:
        "a".repeat(64),
    });

    await payment.validate();

    assert.equal(
      payment.paymentPhoneFingerprint.length,
      64
    );
  }
);

/**
 * ============================================================
 * TEST 12 — PAYMENT IDEMPOTENCY INDEX
 * ============================================================
 */

test(
  "defines a unique payer and request ID index",
  () => {
    const indexes =
      PaymentTransaction.schema.indexes();

    const matchingIndex =
      indexes.find(([fields]) =>
        fields.payerId === 1 &&
        fields.clientRequestId === 1
      );

    assert.ok(
      matchingIndex,
      "Expected payment idempotency index"
    );

    assert.equal(
      matchingIndex[1].unique,
      true
    );
  }
);

/**
 * ============================================================
 * TEST 13 — OPEN PAYMENT PROTECTION INDEX
 * ============================================================
 */

test(
  "defines a unique open initial M-Pesa payment index",
  () => {
    const indexes =
      PaymentTransaction.schema.indexes();

    const matchingIndex =
      indexes.find(
        ([, options]) =>
          options.name ===
          "unique_open_initial_mpesa_payment"
      );

    assert.ok(
      matchingIndex,
      "Expected open-payment protection index"
    );

    assert.equal(
      matchingIndex[1].unique,
      true
    );

    assert.deepEqual(
      matchingIndex[1].partialFilterExpression,
      {
        purpose:
          "SUBSCRIPTION_INITIAL",

        provider:
          "MPESA",

        status: {
          $in: [
            "PENDING",
            "PROCESSING",
          ],
        },
      }
    );
  }
);

/**
 * ============================================================
 * TEST 14 — DUPLICATE PROVIDER TRANSACTION INDEX
 * ============================================================
 */

test(
  "defines a unique provider transaction index",
  () => {
    const indexes =
      PaymentTransaction.schema.indexes();

    const matchingIndex =
      indexes.find(
        ([, options]) =>
          options.name ===
          "unique_provider_transaction"
      );

    assert.ok(matchingIndex);

    assert.equal(
      matchingIndex[1].unique,
      true
    );
  }
);