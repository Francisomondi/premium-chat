import mongoose from "mongoose";

import PaymentTransaction from "../src/models/PaymentTransaction.model.js";

/**
 * ============================================================
 * PREMIUMCHAT — PAYMENT INDEX INSPECTION
 * ============================================================
 *
 * Read-only.
 *
 * Uses an explicitly supplied database URL.
 * Does not create indexes or modify records.
 */

const databaseUrl =
  process.env.TEST_DATABASE_URL;

if (!databaseUrl) {
  console.error(
    "TEST_DATABASE_URL is required."
  );

  process.exit(1);
}

try {
  await mongoose.connect(databaseUrl, {
    autoIndex: false,
    autoCreate: false,
    serverSelectionTimeoutMS: 10000,
  });

  const collectionName =
    PaymentTransaction.collection.name;

  const collections =
    await mongoose.connection.db
      .listCollections(
        { name: collectionName },
        { nameOnly: true }
      )
      .toArray();

  if (collections.length === 0) {
    throw new Error(
      `Collection ${collectionName} does not exist.`
    );
  }

  const indexes =
    await PaymentTransaction.collection.indexes();

  const expectedNames = [
    "unique_payment_request",
    "unique_provider_transaction",
    "unique_provider_receipt",
    "unique_open_initial_mpesa_payment",
  ];

  for (const name of expectedNames) {
    const index =
      indexes.find(
        (item) => item.name === name
      );

    console.log({
      name,
      exists: Boolean(index),
      unique: index?.unique === true,
      key: index?.key ?? null,
      partialFilterExpression:
        index?.partialFilterExpression ?? null,
    });
  }

  const missing =
    expectedNames.filter(
      (name) =>
        !indexes.some(
          (index) =>
            index.name === name &&
            index.unique === true
        )
    );

  if (missing.length > 0) {
    console.error(
      "Missing unique indexes:",
      missing
    );

    process.exitCode = 1;
  } else {
    console.log(
      "All expected unique indexes exist."
    );
  }
} catch (error) {
  console.error(
    "Index inspection failed:",
    error.message
  );

  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}