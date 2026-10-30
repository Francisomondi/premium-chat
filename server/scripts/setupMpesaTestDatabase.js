import mongoose from "mongoose";

import SubscriberSubscription from "../src/models/SubscriberSubscription.model.js";

import PaymentTransaction from "../src/models/PaymentTransaction.model.js";

import PaymentDispatchCoordination from "../src/models/PaymentDispatchCoordination.model.js";

const TEST_DATABASE_NAME =
  "premiumchat_test_mpesa_dispatch";

const databaseUrl =
  process.env.TEST_DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "TEST_DATABASE_URL is required."
  );
}

if (process.env.NODE_ENV === "production") {
  throw new Error(
    "Cannot initialize test database in production mode."
  );
}

const models = [
  SubscriberSubscription,
  PaymentTransaction,
  PaymentDispatchCoordination,
];

const main = async () => {
  try {
    await mongoose.connect(databaseUrl, {
      dbName: TEST_DATABASE_NAME,
      autoIndex: false,
      autoCreate: false,
      serverSelectionTimeoutMS: 10000,
    });

    if (
      mongoose.connection.name !==
      TEST_DATABASE_NAME
    ) {
      throw new Error(
        "Unexpected database selected."
      );
    }

    console.log(
      `Connected to ${mongoose.connection.name}`
    );

    for (const model of models) {
      console.log(
        `Preparing ${model.collection.name}...`
      );

      const existingCollections =
        await mongoose.connection.db
          .listCollections(
            {
              name: model.collection.name,
            },
            {
              nameOnly: true,
            }
          )
          .toArray();

      if (existingCollections.length === 0) {
        await model.createCollection();
      }

      /*
       * Create declared indexes.
       *
       * Do not use syncIndexes():
       * it can drop existing indexes.
       */
      await model.createIndexes();

      const indexes =
        await model.collection.indexes();

      console.log(
        `${model.modelName}: ${indexes.length} indexes`
      );
    }

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

    if (
      !requiredPaymentIndex ||
      requiredPaymentIndex.unique !== true
    ) {
      throw new Error(
        "Payment idempotency index is missing."
      );
    }

    const dispatchUniqueIndex =
      dispatchIndexes.find(
        (index) =>
          index.unique === true &&
          index.key?.paymentId === 1
      );

    if (!dispatchUniqueIndex) {
      throw new Error(
        "Unique dispatch payment index is missing."
      );
    }

    console.log(
      "M-Pesa test database initialized successfully."
    );
  } finally {
    await mongoose.disconnect();
  }
};

main().catch((error) => {
  console.error(
    "Test database setup failed:",
    error.message
  );

  process.exitCode = 1;
});