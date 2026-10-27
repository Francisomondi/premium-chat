import mongoose from "mongoose";

import MpesaCallbackEvent, {
  MPESA_CALLBACK_EVENT_STATUSES,
} from "../models/MpesaCallbackEvent.model.js";

import {
  reconcileMpesaPayment,
} from "../services/mpesaReconciliation.service.js";

/**
 * ============================================================
 * PREMIUMCHAT — M-PESA RECONCILIATION WORKER
 * ============================================================
 *
 * Standalone worker.
 *
 * No Express server.
 * No Socket.IO server.
 * No in-process setInterval.
 *
 * Run using an external scheduler.
 */

const BATCH_SIZE = 50;

const MAX_BATCHES = 10;

const MAX_RUNTIME_MS = 4 * 60 * 1000;

const runReconciliation = async () => {
  const startedAt = Date.now();

  let checkedCount = 0;

  let failedCount = 0;

  for (
    let batch = 0;
    batch < MAX_BATCHES;
    batch++
  ) {
    if (
      Date.now() - startedAt >
      MAX_RUNTIME_MS
    ) {
      break;
    }

    const events =
      await MpesaCallbackEvent.find({
        status: {
          $in: [
            MPESA_CALLBACK_EVENT_STATUSES.RECEIVED,
            MPESA_CALLBACK_EVENT_STATUSES.UNRESOLVED,
          ],
        },
      })
        .sort({
          receivedAt: 1,
        })
        .limit(BATCH_SIZE)
        .lean();

    if (events.length === 0) {
      break;
    }

    for (const event of events) {
      if (
        Date.now() - startedAt >
        MAX_RUNTIME_MS
      ) {
        break;
      }

      if (!event.paymentId) {
        failedCount++;

        continue;
      }

      try {
        await reconcileMpesaPayment({
          paymentId:
            event.paymentId.toString(),
        });

        checkedCount++;
      } catch (error) {
        failedCount++;

        console.error(
          JSON.stringify({
            event:
              "MPESA_RECONCILIATION_FAILED",

            callbackEventId:
              event._id.toString(),

            error:
              error.message,
          })
        );
      }
    }

    if (events.length < BATCH_SIZE) {
      break;
    }
  }

  return {
    checkedCount,

    failedCount,
  };
};

const main = async () => {
  try {
    const databaseUrl =
      process.env.MONGODB_URI;

    if (!databaseUrl) {
      throw new Error(
        "MONGODB_URI is required."
      );
    }

    await mongoose.connect(
      databaseUrl
    );

    const result =
      await runReconciliation();

    console.log(
      JSON.stringify({
        event:
          "MPESA_RECONCILIATION_COMPLETED",

        ...result,
      })
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        event:
          "MPESA_RECONCILIATION_WORKER_FAILED",

        error:
          error.message,
      })
    );

    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

main();