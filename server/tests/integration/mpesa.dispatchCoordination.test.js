import test, {
  before,
  after,
  afterEach,
} from "node:test";

import assert from "node:assert/strict";
import mongoose from "mongoose";

import SubscriberSubscription, {
  SUBSCRIPTION_STATUSES,
} from "../../src/models/SubscriberSubscription.model.js";
import { randomUUID } from "node:crypto";

import PaymentTransaction from "../../src/models/PaymentTransaction.model.js";

import PaymentDispatchCoordination, {
  DISPATCH_STATES,
} from "../../src/models/PaymentDispatchCoordination.model.js";

import {
  authorizePaymentDispatch,
  markPaymentDispatchStarted,
  recordPaymentDispatchOutcome,
} from "../../src/services/paymentDispatchCoordination.service.js";

import {
  PAYMENT_PURPOSES,
  PAYMENT_PROVIDERS,
  PAYMENT_STATUSES,
  PAYMENT_VERIFICATION_STATUSES,
  PAYMENT_INITIATION_STATUSES,
} from "../../src/constants/payment.constants.js";

/**
 * ============================================================
 * PREMIUMCHAT — M-PESA DISPATCH COORDINATION TESTS
 * ============================================================
 *
 * STEP 19.8.30.11
 *
 * REQUIREMENTS:
 *
 * - Isolated MongoDB test database
 * - MongoDB replica set
 * - No real M-Pesa credentials
 * - No external payment requests
 *
 * These tests use the real MongoDB transaction
 * coordination service.
 */

const TEST_DATABASE_NAME =
  "premiumchat_test_mpesa_dispatch";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL;

const createdSubscriptions = new Set();
const createdPayments = new Set();

const createId = () =>
  new mongoose.Types.ObjectId();

const createRequestId = () =>
  `test_${randomUUID().replaceAll("-", "")}`;

const expectAppError = async (
  operation,
  expectedCode
) => {
  await assert.rejects(
    operation,
    (error) => {
      assert.equal(
        error.code,
        expectedCode
      );

      return true;
    }
  );
};

/**
 * ============================================================
 * DATABASE SETUP
 * ============================================================
 */

before(async () => {
  if (!TEST_DATABASE_URL) {
    throw new Error(
      "TEST_DATABASE_URL is required."
    );
  }

  if (
    process.env.NODE_ENV === "production"
  ) {
    throw new Error(
      "Payment integration tests cannot run in production mode."
    );
  }

  await mongoose.connect(
    TEST_DATABASE_URL,
    {
      dbName: TEST_DATABASE_NAME,
      autoIndex: false,
      autoCreate: false,
      serverSelectionTimeoutMS: 10000,
    }
  );

  if (
    mongoose.connection.name !==
    TEST_DATABASE_NAME
  ) {
    throw new Error(
      "Refusing to use an unexpected database."
    );
  }

  /*
   * Verify required collections already exist.
   * Do not create or synchronize indexes here.
   */

  const requiredModels = [
    SubscriberSubscription,
    PaymentTransaction,
    PaymentDispatchCoordination,
  ];

  for (const model of requiredModels) {
    const indexes =
      await model.collection.indexes();

    if (!indexes.length) {
      throw new Error(
        `Missing indexes for ${model.modelName}`
      );
    }
  }

  /*
   * Verify the unique indexes used by these tests.
   */

  const paymentIndexes =
    await PaymentTransaction.collection.indexes();

  const dispatchIndexes =
    await PaymentDispatchCoordination.collection.indexes();

  const requiredPaymentIndex =
    paymentIndexes.find(
      (index) =>
        index.name ===
        "unique_payment_request"
    );

  assert.equal(
    requiredPaymentIndex?.unique,
    true,
    "Payment request unique index is required."
  );

  const uniqueDispatchPaymentIndex =
    dispatchIndexes.find(
      (index) =>
        index.unique === true &&
        index.key?.paymentId === 1
    );

  assert.ok(
    uniqueDispatchPaymentIndex,
    "Dispatch paymentId unique index is required."
  );
});

/**
 * ============================================================
 * TEST DATA CLEANUP
 * ============================================================
 *
 * Only delete documents created by these tests.
 *
 * Never delete all records from a collection.
 */

afterEach(async () => {
  if (
    mongoose.connection.readyState !== 1
  ) {
    return;
  }

  const paymentIds = [
    ...createdPayments,
  ];

  const subscriptionIds = [
    ...createdSubscriptions,
  ];

  if (paymentIds.length) {
    await PaymentDispatchCoordination.deleteMany({
      paymentId: {
        $in: paymentIds,
      },
    });

    await PaymentTransaction.deleteMany({
      _id: {
        $in: paymentIds,
      },
    });
  }

  if (subscriptionIds.length) {
    await SubscriberSubscription.deleteMany({
      _id: {
        $in: subscriptionIds,
      },
    });
  }

  createdPayments.clear();
  createdSubscriptions.clear();
});

after(async () => {
  await mongoose.disconnect();
});

/**
 * ============================================================
 * FIXTURE FACTORY
 * ============================================================
 */

const createPendingPaymentFixture = async () => {
  const subscriberId = createId();
  const creatorId = createId();
  const planId = createId();

  const subscriptionId = createId();
  const paymentId = createId();

  createdSubscriptions.add(subscriptionId);
  createdPayments.add(paymentId);

  const subscription =
    await SubscriberSubscription.create({
      _id: subscriptionId,

      subscriberId,
      creatorId,
      planId,

      status:
        SUBSCRIPTION_STATUSES.PENDING,

      billingInterval: "MONTHLY",

      clientRequestId:
        createRequestId(),

      planSnapshot: {
        name: "Premium Access",

        description:
          "Integration test subscription",

        currency: "KES",

        monthlyPriceMinor: 50000,

        benefits: [
          "Exclusive creator content",
        ],
      },
    });

  const payment =
    await PaymentTransaction.create({
      _id: paymentId,

      payerId: subscriberId,

      creatorId,

      subscriptionId:
        subscription._id,

      purpose:
        PAYMENT_PURPOSES.SUBSCRIPTION_INITIAL,

      provider:
        PAYMENT_PROVIDERS.MPESA,

      amountMinor: 50000,

      currency: "KES",

      clientRequestId:
        createRequestId(),

      status:
        PAYMENT_STATUSES.PENDING,

      verificationStatus:
        PAYMENT_VERIFICATION_STATUSES.UNVERIFIED,

      initiationStatus:
        PAYMENT_INITIATION_STATUSES.RESERVED,
    });

  return {
    subscriberId,
    creatorId,
    subscriptionId:
      subscription._id,
    paymentId:
      payment._id,
  };
};

const authorize = (fixture) =>
  authorizePaymentDispatch({
    paymentId: fixture.paymentId,

    subscriptionId:
      fixture.subscriptionId,

    subscriberId:
      fixture.subscriberId.toString(),
  });

/**
 * ============================================================
 * TEST 1 — AUTHORIZE VALID PENDING PAYMENT
 * ============================================================
 */

test(
  "authorizes a valid pending payment",
  async () => {
    const fixture =
      await createPendingPaymentFixture();

    const result =
      await authorize(fixture);

    assert.equal(
      result.authorized,
      true
    );

    const payment =
      await PaymentTransaction.findById(
        fixture.paymentId
      );

    assert.equal(
      payment.status,
      PAYMENT_STATUSES.PROCESSING
    );

    assert.equal(
      payment.initiationStatus,
      PAYMENT_INITIATION_STATUSES.DISPATCHING
    );

    const dispatch =
      await PaymentDispatchCoordination.findOne({
        paymentId:
          fixture.paymentId,
      });

    assert.ok(dispatch);

    assert.equal(
      dispatch.state,
      DISPATCH_STATES.AUTHORIZED
    );

    assert.ok(
      dispatch.authorizedAt
    );
  }
);

/**
 * ============================================================
 * TEST 2 — CONCURRENT AUTHORIZATION
 * ============================================================
 */

test(
  "does not authorize the same payment twice concurrently",
  async () => {
    const fixture =
      await createPendingPaymentFixture();

    const results =
      await Promise.allSettled([
        authorize(fixture),
        authorize(fixture),
      ]);

    const successful =
      results.filter(
        (result) =>
          result.status === "fulfilled"
      );

    const failed =
      results.filter(
        (result) =>
          result.status === "rejected"
      );

    assert.equal(
      successful.length,
      1
    );

    assert.equal(
      failed.length,
      1
    );

    const dispatches =
      await PaymentDispatchCoordination.find({
        paymentId:
          fixture.paymentId,
      });

    assert.equal(
      dispatches.length,
      1
    );

    const payment =
      await PaymentTransaction.findById(
        fixture.paymentId
      );

    assert.equal(
      payment.status,
      PAYMENT_STATUSES.PROCESSING
    );

    assert.equal(
      payment.initiationStatus,
      PAYMENT_INITIATION_STATUSES.DISPATCHING
    );
  }
);

/**
 * ============================================================
 * TEST 3 — REPEATED AUTHORIZATION
 * ============================================================
 */

test(
  "rejects authorization after payment has been claimed",
  async () => {
    const fixture =
      await createPendingPaymentFixture();

    await authorize(fixture);

    await expectAppError(
      () => authorize(fixture),
      "PAYMENT_NOT_RESERVED"
    );

    const count =
      await PaymentDispatchCoordination.countDocuments({
        paymentId:
          fixture.paymentId,
      });

    assert.equal(count, 1);
  }
);

/**
 * ============================================================
 * TEST 4 — DISPATCH START
 * ============================================================
 */

test(
  "starts an authorized dispatch",
  async () => {
    const fixture =
      await createPendingPaymentFixture();

    await authorize(fixture);

    const result =
      await markPaymentDispatchStarted({
        paymentId:
          fixture.paymentId,
      });

    assert.equal(
      result.state,
      DISPATCH_STATES.DISPATCHING
    );

    assert.ok(
      result.dispatchStartedAt
    );
  }
);

/**
 * ============================================================
 * TEST 5 — DISPATCH CANNOT START TWICE
 * ============================================================
 */

test(
  "prevents starting the same dispatch twice",
  async () => {
    const fixture =
      await createPendingPaymentFixture();

    await authorize(fixture);

    await markPaymentDispatchStarted({
      paymentId:
        fixture.paymentId,
    });

    await expectAppError(
      () =>
        markPaymentDispatchStarted({
          paymentId:
            fixture.paymentId,
        }),
      "PAYMENT_DISPATCH_NOT_AUTHORIZED"
    );

    const count =
      await PaymentDispatchCoordination.countDocuments({
        paymentId:
          fixture.paymentId,
      });

    assert.equal(count, 1);
  }
);

/**
 * ============================================================
 * TEST 6 — CANCELED SUBSCRIPTION
 * ============================================================
 */

test(
  "rejects payment authorization for canceled subscriptions",
  async () => {
    const fixture =
      await createPendingPaymentFixture();

    await SubscriberSubscription.updateOne(
      {
        _id:
          fixture.subscriptionId,
      },
      {
        $set: {
          status:
            SUBSCRIPTION_STATUSES.CANCELED,

          canceledAt:
            new Date(),
        },
      }
    );

    await expectAppError(
      () => authorize(fixture),
      "SUBSCRIPTION_NOT_PENDING"
    );

    const count =
      await PaymentDispatchCoordination.countDocuments({
        paymentId:
          fixture.paymentId,
      });

    assert.equal(count, 0);
  }
);

/**
 * ============================================================
 * TEST 7 — UNAUTHORIZED DISPATCH START
 * ============================================================
 */

test(
  "rejects dispatch start without authorization",
  async () => {
    const fixture =
      await createPendingPaymentFixture();

    await expectAppError(
      () =>
        markPaymentDispatchStarted({
          paymentId:
            fixture.paymentId,
        }),
      "PAYMENT_DISPATCH_NOT_AUTHORIZED"
    );
  }
);

/**
 * ============================================================
 * TEST 8 — RECORD ACCEPTED DISPATCH
 * ============================================================
 */

test(
  "records an accepted dispatch without verifying payment",
  async () => {
    const fixture =
      await createPendingPaymentFixture();

    await authorize(fixture);

    await markPaymentDispatchStarted({
      paymentId:
        fixture.paymentId,
    });

    const result =
      await recordPaymentDispatchOutcome({
        paymentId:
          fixture.paymentId,

        state:
          DISPATCH_STATES.ACCEPTED,
      });

    assert.equal(
      result.state,
      DISPATCH_STATES.ACCEPTED
    );

    assert.ok(
      result.dispatchCompletedAt
    );

    const payment =
      await PaymentTransaction.findById(
        fixture.paymentId
      );

    assert.equal(
      payment.verificationStatus,
      PAYMENT_VERIFICATION_STATUSES.UNVERIFIED
    );

    assert.equal(
      payment.entitlementAppliedAt,
      null
    );

    const subscription =
      await SubscriberSubscription.findById(
        fixture.subscriptionId
      );

    assert.equal(
      subscription.status,
      SUBSCRIPTION_STATUSES.PENDING
    );
  }
);

/**
 * ============================================================
 * TEST 9 — ACCEPTED DISPATCH CANNOT BE FINALIZED TWICE
 * ============================================================
 */

test(
  "does not finalize an accepted dispatch twice",
  async () => {
    const fixture =
      await createPendingPaymentFixture();

    await authorize(fixture);

    await markPaymentDispatchStarted({
      paymentId:
        fixture.paymentId,
    });

    const first =
      await recordPaymentDispatchOutcome({
        paymentId:
          fixture.paymentId,

        state:
          DISPATCH_STATES.ACCEPTED,
      });

    assert.ok(first);

    const second =
      await recordPaymentDispatchOutcome({
        paymentId:
          fixture.paymentId,

        state:
          DISPATCH_STATES.ACCEPTED,
      });

    assert.equal(second, null);
  }
);

/**
 * ============================================================
 * TEST 10 — UNKNOWN DISPATCH
 * ============================================================
 */

test(
  "records uncertain initiation without granting access",
  async () => {
    const fixture =
      await createPendingPaymentFixture();

    await authorize(fixture);

    await markPaymentDispatchStarted({
      paymentId:
        fixture.paymentId,
    });

    const result =
      await recordPaymentDispatchOutcome({
        paymentId:
          fixture.paymentId,

        state:
          DISPATCH_STATES.UNKNOWN,
      });

    assert.equal(
      result.state,
      DISPATCH_STATES.UNKNOWN
    );

    const subscription =
      await SubscriberSubscription.findById(
        fixture.subscriptionId
      );

    assert.equal(
      subscription.status,
      SUBSCRIPTION_STATUSES.PENDING
    );

    assert.equal(
      subscription.hasActiveAccess(),
      false
    );
  }
);

/**
 * ============================================================
 * TEST 11 — INVALID DISPATCH OUTCOME
 * ============================================================
 */

test(
  "rejects invalid dispatch outcome",
  async () => {
    const fixture =
      await createPendingPaymentFixture();

    await authorize(fixture);

    await markPaymentDispatchStarted({
      paymentId:
        fixture.paymentId,
    });

    await expectAppError(
      () =>
        recordPaymentDispatchOutcome({
          paymentId:
            fixture.paymentId,

          state:
            DISPATCH_STATES.RESERVED,
        }),
      "INVALID_DISPATCH_OUTCOME"
    );
  }
);

/**
 * ============================================================
 * TEST 12 — NO ENTITLEMENT FROM DISPATCH
 * ============================================================
 */

test(
  "does not activate subscription during dispatch authorization",
  async () => {
    const fixture =
      await createPendingPaymentFixture();

    await authorize(fixture);

    const subscription =
      await SubscriberSubscription.findById(
        fixture.subscriptionId
      );

    assert.equal(
      subscription.status,
      SUBSCRIPTION_STATUSES.PENDING
    );

    assert.equal(
      subscription.startedAt,
      null
    );

    assert.equal(
      subscription.currentPeriodStart,
      null
    );

    assert.equal(
      subscription.currentPeriodEnd,
      null
    );

    assert.equal(
      subscription.hasActiveAccess(),
      false
    );
  }
);