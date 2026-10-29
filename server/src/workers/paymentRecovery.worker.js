import { randomUUID } from "node:crypto";

import PaymentTransaction from "../models/PaymentTransaction.model.js";

import MpesaUnmatchedCallback from "../models/MpesaUnmatchedCallback.model.js";

import {
  reconcileMpesaPayment,
} from "../services/mpesaReconciliation.service.js";

import {
  claimPaymentRecoveryJob,
  completePaymentRecoveryJob,
  failPaymentRecoveryJob,
  escalateExpiredRecoveryJobs,
} from "../services/paymentRecoveryScheduler.service.js";

import {
  recoverUnmatchedMpesaCallback,
} from "../services/mpesaUnmatchedCallbackRecovery.service.js";

import {
  RECOVERY_JOB_TYPES,
} from "../models/PaymentRecoveryJob.model.js";

import {
  MPESA_EVIDENCE_STATUSES,
} from "../models/MpesaPaymentEvidence.model.js";

/**
 * ============================================================
 * PREMIUMCHAT — PAYMENT RECOVERY WORKER
 * ============================================================
 *
 * MODULE 4.3.5.7.8.13.17.6.12
 *
 * RESPONSIBILITIES:
 *
 * - Recover missing M-Pesa callbacks.
 * - Recover exact unmatched callbacks.
 * - Query Safaricom for reconciliation evidence.
 * - Generate stable reconciliation operation IDs.
 * - Validate payment and operation identities.
 * - Prevent incomplete recovery from being completed.
 * - Respect recovery job leases.
 *
 * SECURITY:
 *
 * - Recovery does not verify financial settlement.
 * - Recovery does not mark payments successful.
 * - Recovery does not activate subscriptions.
 * - Recovery does not grant premium access.
 * - Inconclusive provider queries remain unresolved.
 * - Conflicting provider evidence requires review.
 * - Recovery jobs must target the correct resource.
 *
 * IDEMPOTENCY:
 *
 * Each claimed recovery attempt uses:
 *
 * RECOVERY:<jobId>:<attemptCount>
 *
 * The evidence recording service enforces
 * uniqueness for each operation ID.
 */

const WORKER_ID = randomUUID();

const POLL_INTERVAL_MS = 15_000;

let running = false;

let timer = null;

/**
 * ============================================================
 * RECOVERY ERROR
 * ============================================================
 */

class PaymentRecoveryError extends Error {
  constructor(code) {
    super(code);

    this.name = "PaymentRecoveryError";

    this.code = code;
  }
}

/**
 * ============================================================
 * THROW RECOVERY ERROR
 * ============================================================
 */

const fail = (code) => {
  throw new PaymentRecoveryError(code);
};

/**
 * ============================================================
 * VALIDATE RECOVERY JOB OPERATION IDENTITY
 * ============================================================
 *
 * The scheduler must increment attemptCount
 * atomically when claiming a recovery job.
 *
 * Each attempt receives a distinct operation ID.
 */

const createReconciliationOperationId = (job) => {
  if (!job?._id) {
    fail("RECOVERY_JOB_ID_MISSING");
  }

  if (
    !Number.isSafeInteger(job.attemptCount) ||
    job.attemptCount < 1
  ) {
    fail("INVALID_RECOVERY_ATTEMPT_COUNT");
  }

  const reconciliationOperationId =
    `RECOVERY:${job._id.toString()}:${job.attemptCount}`;

  if (reconciliationOperationId.length > 180) {
    fail("RECONCILIATION_OPERATION_ID_TOO_LONG");
  }

  return reconciliationOperationId;
};

/**
 * ============================================================
 * PROCESS MISSING CALLBACK
 * ============================================================
 */

const processMissingCallbackRecovery = async (job) => {
  /**
   * STEP 1:
   * Load the exact payment.
   */

  const payment =
    await PaymentTransaction.findById(
      job.resourceId
    );

  if (!payment) {
    fail("PAYMENT_NOT_FOUND");
  }

  /**
   * STEP 2:
   * Validate provider identifiers.
   */

  if (!payment.providerTransactionId) {
    fail("CHECKOUT_REQUEST_ID_MISSING");
  }

  if (!payment.merchantRequestId) {
    fail("MERCHANT_REQUEST_ID_MISSING");
  }

  /**
   * STEP 3:
   * Generate reconciliation operation ID.
   *
   * Example:
   *
   * RECOVERY:68f123abc456def789012345:1
   */

  const reconciliationOperationId =
    createReconciliationOperationId(job);

  /**
   * STEP 4:
   * Query Safaricom through the reconciliation
   * service and persist provider-query evidence.
   *
   * This does not verify financial settlement.
   */

  const reconciliation =
    await reconcileMpesaPayment({
      paymentId:
        payment._id.toString(),

      reconciliationOperationId,
    });

  /**
   * STEP 5:
   * Validate reconciliation response.
   */

  if (!reconciliation) {
    fail("RECONCILIATION_RESULT_MISSING");
  }

  /**
   * A skipped reconciliation is not
   * evidence of a resolved payment.
   */

  if (reconciliation.checked !== true) {
    fail(
      reconciliation.reason ||
        "RECONCILIATION_NOT_PERFORMED"
    );
  }

  /**
   * STEP 6:
   * Verify payment identity.
   */

  if (
    reconciliation.paymentId !==
    payment._id.toString()
  ) {
    fail("RECONCILIATION_PAYMENT_MISMATCH");
  }

  /**
   * STEP 7:
   * Verify reconciliation operation identity.
   *
   * Prevent evidence from another operation
   * from satisfying this recovery job.
   */

  if (
    reconciliation.reconciliationOperationId !==
    reconciliationOperationId
  ) {
    fail("RECONCILIATION_OPERATION_ID_MISMATCH");
  }

  /**
   * STEP 8:
   * Require persisted evidence.
   */

  if (!reconciliation.evidenceId) {
    fail("RECONCILIATION_EVIDENCE_MISSING");
  }

  /**
   * STEP 9:
   * Reject conflicting evidence.
   *
   * Conflict handling must not be treated
   * as successful recovery.
   */

  if (
    reconciliation.evidenceStatus ===
    MPESA_EVIDENCE_STATUSES.CONFLICT
  ) {
    fail("MPESA_EVIDENCE_CONFLICT");
  }

  /**
   * STEP 10:
   * Reject inconclusive evidence.
   *
   * The recovery scheduler controls retries
   * and eventual manual-review escalation.
   */

  if (
    reconciliation.evidenceStatus ===
    MPESA_EVIDENCE_STATUSES.QUERY_INCONCLUSIVE
  ) {
    fail("MPESA_QUERY_INCONCLUSIVE");
  }

  /**
   * STEP 11:
   * Accept only definitive provider-query
   * outcomes as completed evidence recovery.
   *
   * QUERY_SUCCESS does not mean that the
   * payment is financially verified.
   */

  if (
    reconciliation.evidenceStatus ===
      MPESA_EVIDENCE_STATUSES.QUERY_SUCCESS ||
    reconciliation.evidenceStatus ===
      MPESA_EVIDENCE_STATUSES.QUERY_FAILURE
  ) {
    return {
      processed: true,

      paymentId:
        payment._id.toString(),

      reconciliationOperationId,

      evidenceId:
        reconciliation.evidenceId,

      evidenceStatus:
        reconciliation.evidenceStatus,

      evidenceCreated:
        Boolean(reconciliation.evidenceCreated),

      evidenceDuplicate:
        Boolean(reconciliation.evidenceDuplicate),

      financialDetailsVerified: false,

      paymentVerified: false,

      entitlementApplied: false,

      subscriptionActivated: false,
    };
  }

  /**
   * Reject any unexpected evidence status.
   */

  fail("UNSUPPORTED_RECONCILIATION_OUTCOME");
};

/**
 * ============================================================
 * PROCESS EXACT UNMATCHED CALLBACK
 * ============================================================
 */

const processUnmatchedCallbackRecovery = async (job) => {
  /**
   * STEP 1:
   * Load the exact quarantined callback.
   */

  const callback =
    await MpesaUnmatchedCallback.findById(
      job.resourceId
    );

  if (!callback) {
    fail("UNMATCHED_CALLBACK_NOT_FOUND");
  }

  /**
   * STEP 2:
   * Recover this exact callback.
   *
   * Never process an arbitrary callback
   * when completing a resource-specific job.
   */

  const result =
    await recoverUnmatchedMpesaCallback({
      callbackId:
        callback._id.toString(),
    });

  /**
   * STEP 3:
   * Validate recovery outcome.
   */

  if (!result?.recovered) {
    fail(
      result?.reason ||
        "UNMATCHED_CALLBACK_RECOVERY_INCOMPLETE"
    );
  }

  /**
   * STEP 4:
   * Verify callback identity.
   */

  if (
    result.callbackId !==
    callback._id.toString()
  ) {
    fail(
      "UNMATCHED_CALLBACK_IDENTITY_MISMATCH"
    );
  }

  /**
   * STEP 5:
   * Return informational recovery outcome.
   *
   * This does not verify payment settlement.
   */

  return {
    processed: true,

    callbackId:
      result.callbackId,

    paymentId:
      result.paymentId,

    alreadyRecovered:
      Boolean(result.alreadyRecovered),

    financialDetailsVerified: false,

    paymentVerified: false,

    entitlementApplied: false,

    subscriptionActivated: false,
  };
};

/**
 * ============================================================
 * PROCESS RECOVERY JOB
 * ============================================================
 */

const processRecoveryJob = async (job) => {
  if (!job) {
    fail("RECOVERY_JOB_MISSING");
  }

  if (
    job.type ===
    RECOVERY_JOB_TYPES.MISSING_CALLBACK
  ) {
    return processMissingCallbackRecovery(job);
  }

  if (
    job.type ===
    RECOVERY_JOB_TYPES.UNMATCHED_CALLBACK
  ) {
    return processUnmatchedCallbackRecovery(job);
  }

  fail("UNSUPPORTED_RECOVERY_JOB_TYPE");
};

/**
 * ============================================================
 * WORKER TICK
 * ============================================================
 */

const tick = async () => {
  /**
   * Prevent overlapping executions
   * within the same Node.js process.
   */

  if (running) {
    return;
  }

  /**
   * Respect the recovery feature flag.
   *
   * Disabled unless explicitly set to true.
   */

  if (
    process.env.PAYMENT_RECOVERY_WORKER_ENABLED !==
    "true"
  ) {
    return;
  }

  running = true;

try {
  /**
   * STEP 1:
   * Escalate exhausted jobs whose
   * final processing lease expired.
   */

  await escalateExpiredRecoveryJobs();

  /**
   * STEP 2:
   * Claim an eligible recovery job.
   */

  const job =
    await claimPaymentRecoveryJob({
      workerId: WORKER_ID,
    });

    if (!job) {
      return;
    }

    /**
     * STEP 2:
     * Process the claimed job.
     */

    try {
      const result =
        await processRecoveryJob(job);

      /**
       * STEP 3:
       * Require an explicitly completed
       * recovery operation.
       */

      if (!result?.processed) {
        fail("RECOVERY_PROCESSING_INCOMPLETE");
      }

      /**
       * STEP 4:
       * Complete the job using the
       * original worker lease.
       *
       * Completion means evidence recovery
       * finished, not payment verification.
       */

      const completed =
        await completePaymentRecoveryJob({
          jobId:
            job._id,

          workerId:
            WORKER_ID,
        });

      if (!completed) {
        console.error(
          "[PaymentRecovery] Completion lease expired:",
          job._id.toString()
        );

        return;
      }

      console.log(
        JSON.stringify({
          event:
            "PAYMENT_RECOVERY_JOB_COMPLETED",

          jobId:
            job._id.toString(),

          jobType:
            job.type,

          evidenceStatus:
            result.evidenceStatus || null,

          paymentVerified: false,

          subscriptionActivated: false,
        })
      );
    } catch (error) {
      /**
       * STEP 5:
       * Handle failed recovery.
       */

      const errorCode =
        error?.code ||
        error?.message ||
        "RECOVERY_FAILED";

      console.error(
        JSON.stringify({
          event:
            "PAYMENT_RECOVERY_JOB_FAILED",

          jobId:
            job._id.toString(),

          jobType:
            job.type,

          errorCode,
        })
      );

      /**
       * The scheduler is responsible for
       * retry delays and retry exhaustion.
       */

      const failed =
        await failPaymentRecoveryJob({
          job,

          workerId:
            WORKER_ID,

          errorCode,
        });

      if (!failed) {
        console.error(
          "[PaymentRecovery] Failure finalization lease expired:",
          job._id.toString()
        );
      }
    }
  } finally {
    running = false;
  }
};

/**
 * ============================================================
 * START PAYMENT RECOVERY WORKER
 * ============================================================
 */

export const startPaymentRecoveryWorker = () => {
  /**
   * Do not start a second timer.
   */

  if (timer) {
    return;
  }

  /**
   * Keep recovery disabled by default.
   */

  if (
    process.env.PAYMENT_RECOVERY_WORKER_ENABLED !==
    "true"
  ) {
    console.log(
      "[PaymentRecovery] Worker disabled."
    );

    return;
  }

  timer = setInterval(() => {
    tick().catch((error) => {
      console.error(
        "[PaymentRecovery] Worker error:",
        error?.message || error
      );
    });
  }, POLL_INTERVAL_MS);

  timer.unref?.();

  console.log(
    "[PaymentRecovery] Worker started."
  );
};

/**
 * ============================================================
 * STOP PAYMENT RECOVERY WORKER
 * ============================================================
 */

export const stopPaymentRecoveryWorker = () => {
  if (timer) {
    clearInterval(timer);

    timer = null;
  }

  console.log(
    "[PaymentRecovery] Worker stopped."
  );
};