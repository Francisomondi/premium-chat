import mongoose from "mongoose";

import MpesaPaymentEvidence from "../models/MpesaPaymentEvidence.model.js";

/**
 * ============================================================
 * PREMIUMCHAT — M-PESA EVIDENCE OPERATION ID MIGRATION
 * ============================================================
 *
 * MODULE 4.3.5.7.8.13.17.6.13
 *
 * Run only after:
 *
 * 1. Taking a database backup.
 * 2. Disabling payment recovery workers.
 * 3. Ensuring no concurrent evidence writers.
 *
 * Default behavior is DRY RUN.
 *
 * Use --apply to perform the migration.
 */

const APPLY =
  process.argv.includes("--apply");

const DATABASE_URL =
  process.env.DATABASE_URL ||
  process.env.MONGODB_URI;

const INDEX_NAME =
  "unique_mpesa_reconciliation_operation";

const LEGACY_PREFIX =
  "LEGACY:";

const missingOperationIdFilter = {
  $or: [
    {
      reconciliationOperationId: {
        $exists: false,
      },
    },
    {
      reconciliationOperationId: null,
    },
    {
      reconciliationOperationId: "",
    },
  ],
};

const run = async () => {
  if (!DATABASE_URL) {
    throw new Error(
      "MONGODB_CONNECTION_STRING_MISSING"
    );
  }

  /**
   * Prevent automatic index creation
   * before migration completes.
   */

  mongoose.set("autoIndex", false);

  await mongoose.connect(DATABASE_URL, {
    autoIndex: false,
  });

  const collection =
    MpesaPaymentEvidence.collection;

  const total =
    await collection.countDocuments();

  const missing =
    await collection.countDocuments(
      missingOperationIdFilter
    );

  console.log({
    mode: APPLY ? "APPLY" : "DRY_RUN",
    totalEvidenceRecords: total,
    missingOperationIds: missing,
  });

  /**
   * Check existing operation ID duplicates.
   */

  const duplicates =
    await collection
      .aggregate([
        {
          $match: {
            reconciliationOperationId: {
              $exists: true,
              $nin: [null, ""],
            },
          },
        },
        {
          $group: {
            _id: "$reconciliationOperationId",
            count: {
              $sum: 1,
            },
          },
        },
        {
          $match: {
            count: {
              $gt: 1,
            },
          },
        },
        {
          $limit: 5,
        },
      ])
      .toArray();

  if (duplicates.length > 0) {
    throw new Error(
      "DUPLICATE_RECONCILIATION_OPERATION_IDS_FOUND"
    );
  }

  /**
   * Inspect existing indexes.
   */

  const indexes =
    await collection.indexes();

  console.log(
    "Existing indexes:",
    indexes.map((index) => index.name)
  );

  if (!APPLY) {
    console.log(
      "Dry run complete. No documents modified."
    );

    return;
  }

  /**
   * Migrate legacy records individually.
   *
   * Each historical document receives an
   * operation ID based on its immutable _id.
   */

  const cursor =
    collection.find(
      missingOperationIdFilter,
      {
        projection: {
          _id: 1,
        },
      }
    );

  let migrated = 0;

  for await (const document of cursor) {
    const reconciliationOperationId =
      `${LEGACY_PREFIX}${document._id.toString()}`;

    const result =
      await collection.updateOne(
        {
          _id: document._id,

          $or:
            missingOperationIdFilter.$or,
        },
        {
          $set: {
            reconciliationOperationId,
          },
        }
      );

    migrated += result.modifiedCount;
  }

  /**
   * Verify all documents now have IDs.
   */

  const remaining =
    await collection.countDocuments(
      missingOperationIdFilter
    );

  if (remaining > 0) {
    throw new Error(
      "EVIDENCE_MIGRATION_INCOMPLETE"
    );
  }

  /**
   * Recheck duplicate operation IDs.
   */

  const duplicateAfterMigration =
    await collection
      .aggregate([
        {
          $group: {
            _id: "$reconciliationOperationId",
            count: {
              $sum: 1,
            },
          },
        },
        {
          $match: {
            count: {
              $gt: 1,
            },
          },
        },
        {
          $limit: 1,
        },
      ])
      .toArray();

  if (duplicateAfterMigration.length > 0) {
    throw new Error(
      "DUPLICATE_OPERATION_IDS_AFTER_MIGRATION"
    );
  }

  /**
   * Create unique index.
   */

  await collection.createIndex(
    {
      reconciliationOperationId: 1,
    },
    {
      unique: true,
      name: INDEX_NAME,
    }
  );

  console.log({
    migrationCompleted: true,
    migrated,
    remainingMissing: remaining,
    index: INDEX_NAME,
  });
};

run()
  .catch((error) => {
    console.error(
      "[MpesaEvidenceMigration] Failed:",
      error?.message || error
    );

    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });