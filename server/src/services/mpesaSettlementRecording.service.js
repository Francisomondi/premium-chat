import mongoose from "mongoose";

import PaymentTransaction from "../models/PaymentTransaction.model.js";

import SubscriberSubscription, {
  SUBSCRIPTION_STATUSES,
} from "../models/SubscriberSubscription.model.js";

import {
  claimSettlementCancellationSafety,
} from "./mpesaSettlementCancellationCoordination.service.js";

import MpesaFinancialVerification, {
  FINANCIAL_VERIFICATION_STATUSES,
  FINANCIAL_EVIDENCE_SOURCES,
} from "../models/MpesaFinancialVerification.model.js";

import {
  fetchAuthenticatedMerchantTransaction,
  MERCHANT_RECONCILIATION_STATUSES,
} from "../payments/mpesa/mpesaMerchantReconciliation.adapter.js";

import {
  validateMerchantTransactionEvidence,
} from "./mpesaMerchantEvidenceValidation.service.js";

import {
  getMpesaConfig,
} from "../payments/mpesa/mpesa.config.js";

import {
  getMpesaMerchantSourceConfig,
} from "../payments/mpesa/mpesaMerchantSource.config.js";

import {
  PAYMENT_PROVIDERS,
  PAYMENT_PURPOSES,
  PAYMENT_STATUSES,
  PAYMENT_VERIFICATION_STATUSES,
} from "../constants/payment.constants.js";

import {
  validateMpesaFinancialEvidence,
} from "./mpesaFinancialVerification.service.js";

import AppError from "../utils/AppError.js";

/**
 * ============================================================
 * PREMIUMCHAT — M-PESA SETTLEMENT RECORDING SERVICE
 * ============================================================
 *
 * MODULE 4.3.5.7.8.13.17.4
 *
 * PURPOSE:
 *
 * Atomically persist authenticated M-Pesa
 * financial settlement evidence.
 *
 * SECURITY:
 *
 * - No public controller may invoke this service
 *   with arbitrary request-body evidence.
 *
 * - Evidence must be authenticated independently
 *   before reaching this service.
 *
 * - This service validates evidence consistency,
 *   not its cryptographic or provider authenticity.
 *
 * - Duplicate receipts are rejected.
 *
 * - Conflicting verification records are rejected.
 *
 * - Payment and financial verification updates
 *   occur in one MongoDB transaction.
 *
 * - Subscription activation is not performed here.
 *
 * - No external provider API calls occur inside
 *   the database transaction.
 *
 * CURRENT RELEASE STATE:
 *
 * The trusted settlement adapter has not been
 * implemented.
 *
 * Therefore, the exported production entry point
 * remains disabled.
 */

const {
  PENDING,
  PROCESSING,
  SUCCEEDED,
} = PAYMENT_STATUSES;

const {
  UNVERIFIED,
  VERIFIED,
} = PAYMENT_VERIFICATION_STATUSES;

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

const isValidId = (value) =>
  typeof value === "string" &&
  mongoose.isObjectIdOrHexString(value);

const sameId = (left, right) =>
  Boolean(left && right) &&
  left.toString() === right.toString();

const validString = (value) =>
  typeof value === "string" &&
  value.trim().length > 0;

const validDate = (value) =>
  value instanceof Date &&
  !Number.isNaN(value.getTime());

const fail = (
  message,
  code,
  status = 409
) => {
  throw new AppError(
    message,
    status,
    code
  );
};

/**
 * ============================================================
 * VALIDATE SETTLEMENT INPUT
 * ============================================================
 */

const validateSettlementInput = ({
  paymentId,
  evidence,
}) => {
  if (!isValidId(paymentId)) {
    fail(
      "Invalid payment identifier.",
      "INVALID_PAYMENT_ID",
      400
    );
  }

  if (
    !evidence ||
    typeof evidence !== "object" ||
    Array.isArray(evidence)
  ) {
    fail(
      "Settlement evidence is required.",
      "SETTLEMENT_EVIDENCE_REQUIRED",
      400
    );
  }

  if (
    !validString(evidence.providerTransactionId) ||
    !validString(evidence.mpesaReceiptNumber)
  ) {
    fail(
      "Provider transaction and receipt identifiers are required.",
      "SETTLEMENT_IDENTIFIERS_REQUIRED",
      400
    );
  }

  if (
    !Number.isSafeInteger(evidence.amountMinor) ||
    evidence.amountMinor <= 0
  ) {
    fail(
      "Settlement amount is invalid.",
      "INVALID_SETTLEMENT_AMOUNT",
      400
    );
  }

  if (evidence.currency !== "KES") {
    fail(
      "Only KES settlements are supported.",
      "UNSUPPORTED_SETTLEMENT_CURRENCY",
      400
    );
  }

  if (
    !Object.values(
      FINANCIAL_EVIDENCE_SOURCES
    ).includes(evidence.source)
  ) {
    fail(
      "Unsupported settlement evidence source.",
      "INVALID_SETTLEMENT_SOURCE",
      400
    );
  }

  if (
    evidence.source ===
    FINANCIAL_EVIDENCE_SOURCES.MANUAL_VERIFICATION
  ) {
    fail(
      "Manual verification cannot automatically settle payments.",
      "MANUAL_SETTLEMENT_NOT_AUTOMATIC"
    );
  }

  if (
    !validString(evidence.evidenceReference)
  ) {
    fail(
      "An auditable settlement reference is required.",
      "SETTLEMENT_REFERENCE_REQUIRED",
      400
    );
  }
};

/**
 * ============================================================
 * VALIDATE PAYMENT ELIGIBILITY
 * ============================================================
 */

const validatePaymentEligibility = (
  payment,
  subscription
) => {
  if (
    payment.provider !==
    PAYMENT_PROVIDERS.MPESA
  ) {
    fail(
      "Payment provider mismatch.",
      "INVALID_PAYMENT_PROVIDER"
    );
  }

  if (
    payment.purpose !==
    PAYMENT_PURPOSES.SUBSCRIPTION_INITIAL
  ) {
    fail(
      "Only initial subscription settlement is supported in this step.",
      "UNSUPPORTED_PAYMENT_PURPOSE"
    );
  }

  if (
    !sameId(
      payment.subscriptionId,
      subscription._id
    ) ||
    !sameId(
      payment.payerId,
      subscription.subscriberId
    ) ||
    !sameId(
      payment.creatorId,
      subscription.creatorId
    )
  ) {
    fail(
      "Payment and subscription ownership do not match.",
      "PAYMENT_SUBSCRIPTION_MISMATCH"
    );
  }

  if (
    payment.amountMinor !==
      subscription.planSnapshot?.monthlyPriceMinor ||
    payment.currency !==
      subscription.planSnapshot?.currency
  ) {
    fail(
      "Payment does not match the agreed subscription price.",
      "PAYMENT_PRICE_MISMATCH"
    );
  }

  if (
    subscription.status !==
      SUBSCRIPTION_STATUSES.PENDING ||
    subscription.canceledAt ||
    subscription.cancelAtPeriodEnd ||
    subscription.suspendedAt
  ) {
    fail(
      "Subscription is not eligible for automatic initial settlement.",
      "SUBSCRIPTION_NOT_SETTLEMENT_ELIGIBLE"
    );
  }

  if (
    ![PENDING, PROCESSING].includes(
      payment.status
    )
  ) {
    fail(
      "Payment is not eligible for settlement.",
      "PAYMENT_NOT_SETTLEMENT_ELIGIBLE"
    );
  }

  if (
    payment.verificationStatus !==
    UNVERIFIED
  ) {
    fail(
      "Payment verification state is not eligible.",
      "PAYMENT_VERIFICATION_STATE_CONFLICT"
    );
  }

  if (
    payment.entitlementAppliedAt ||
    payment.verifiedAt ||
    payment.paidAt ||
    payment.providerReceipt
  ) {
    fail(
      "Payment already contains settlement or entitlement data.",
      "PAYMENT_SETTLEMENT_STATE_CONFLICT"
    );
  }
};

/**
 * ============================================================
 * VALIDATE EXISTING VERIFICATION RECORD
 * ============================================================
 */

const validateExistingVerification = (
  verification,
  payment,
  evidence
) => {
  if (!verification) {
    return;
  }

  if (
    verification.status ===
    FINANCIAL_VERIFICATION_STATUSES.VERIFIED
  ) {
    fail(
      "Payment already has a financial verification record.",
      "FINANCIAL_VERIFICATION_ALREADY_EXISTS"
    );
  }

  if (
    verification.requiresManualReview ||
    verification.status ===
      FINANCIAL_VERIFICATION_STATUSES.MANUAL_REVIEW ||
    verification.status ===
      FINANCIAL_VERIFICATION_STATUSES.REJECTED
  ) {
    fail(
      "Payment requires financial review before settlement.",
      "FINANCIAL_VERIFICATION_REVIEW_REQUIRED"
    );
  }

  if (
    !sameId(
      verification.subscriptionId,
      payment.subscriptionId
    )
  ) {
    fail(
      "Existing verification belongs to a different subscription.",
      "FINANCIAL_VERIFICATION_SUBSCRIPTION_CONFLICT"
    );
  }

  if (
    verification.mpesaReceiptNumber &&
    verification.mpesaReceiptNumber !==
      evidence.mpesaReceiptNumber
  ) {
    fail(
      "Existing verification receipt conflicts with settlement evidence.",
      "FINANCIAL_RECEIPT_CONFLICT"
    );
  }

  if (
    verification.providerTransactionId &&
    verification.providerTransactionId !==
      evidence.providerTransactionId
  ) {
    fail(
      "Existing provider transaction reference conflicts with settlement evidence.",
      "FINANCIAL_TRANSACTION_CONFLICT"
    );
  }
};

/**
 * ============================================================
 * BUILD SUCCESS RESULT
 * ============================================================
 */

const buildSettlementResult = ({
  payment,
  verification,
  alreadyRecorded,
}) => ({
  recorded: true,

  alreadyRecorded,

  paymentId:
    payment._id.toString(),

  subscriptionId:
    payment.subscriptionId.toString(),

  financialVerificationId:
    verification._id.toString(),

  providerReceipt:
    payment.providerReceipt,

  amountMinor:
    payment.amountMinor,

  currency:
    payment.currency,

  paymentVerified: true,

  entitlementApplied:
    Boolean(payment.entitlementAppliedAt),

  subscriptionActivated: false,
});

/**
 * ============================================================
 * INTERNAL SETTLEMENT TRANSACTION
 * ============================================================
 *
 * This function is deliberately not exported.
 *
 * It must only be called after a future trusted
 * settlement adapter has authenticated evidence.
 */

const commitAuthenticatedSettlement =
  async ({
    paymentId,
    evidence,
  }) => {
    validateSettlementInput({
      paymentId,
      evidence,
    });

    let result;

    await mongoose.connection.transaction(
      async (session) => {
        /**
         * STEP 1:
         * Load current payment.
         */

        const payment =
          await PaymentTransaction.findById(
            paymentId
          ).session(session);

        if (!payment) {
          fail(
            "Payment not found.",
            "PAYMENT_NOT_FOUND",
            404
          );
        }

        /**
         * STEP 2:
         * Load subscription.
         */

        if (!payment.subscriptionId) {
          fail(
            "Payment subscription reference is missing.",
            "PAYMENT_SUBSCRIPTION_MISSING"
          );
        }

        const subscription =
          await SubscriberSubscription.findById(
            payment.subscriptionId
          ).session(session);

        if (!subscription) {
          fail(
            "Subscription not found.",
            "SUBSCRIPTION_NOT_FOUND",
            404
          );
        }

        /**
         * STEP 3:
         * Validate evidence consistency.
         */

        const validated =
          validateMpesaFinancialEvidence({
            payment,
            subscription,
            evidence,
          });

          /**
         * ============================================================
         * STEP 18.29 — SETTLEMENT EVIDENCE RECHECK
         * ============================================================
         *
         * Evidence was obtained before the transaction.
         *
         * Recheck it against the payment currently loaded
         * inside the transaction.
         *
         * This protects against settlement using stale
         * or conflicting payment references.
         *
         * This check validates consistency, not provenance.
         */

        const expectedReceipt =
        payment.transactionStatusEnquiry?.receiptNumber;

        if (
        typeof expectedReceipt !== "string" ||
        expectedReceipt !== validated.mpesaReceiptNumber
        ) {
        fail(
            "Authenticated settlement receipt does not match the recorded transaction enquiry.",
            "SETTLEMENT_RECEIPT_MISMATCH"
        );
        }

        if (
        evidence.providerTransactionId !==
        payment.providerTransactionId
        ) {
        fail(
            "Settlement provider transaction identifier changed.",
            "SETTLEMENT_TRANSACTION_MISMATCH"
        );
        }

        if (
        evidence.amountMinor !== payment.amountMinor ||
        evidence.currency !== payment.currency
        ) {
        fail(
            "Settlement amount or currency changed.",
            "SETTLEMENT_AMOUNT_MISMATCH"
        );
        }

        /**
         * STEP 4:
         * Check for an already-recorded
         * identical settlement.
         */

        const existingVerification =
          await MpesaFinancialVerification.findOne({
            paymentId: payment._id,
          }).session(session);

        if (
          existingVerification?.status ===
            FINANCIAL_VERIFICATION_STATUSES.VERIFIED &&
          payment.status === SUCCEEDED &&
          payment.verificationStatus === VERIFIED &&
          validDate(payment.verifiedAt) &&
          validDate(payment.paidAt) &&
          payment.providerReceipt ===
            validated.mpesaReceiptNumber &&
          existingVerification.mpesaReceiptNumber ===
            validated.mpesaReceiptNumber &&
          existingVerification.providerTransactionId ===
            validated.providerTransactionId &&
          existingVerification.verifiedAmountMinor ===
            validated.amountMinor &&
          existingVerification.verifiedCurrency ===
            validated.currency &&
          !existingVerification.requiresManualReview
        ) {
          result = buildSettlementResult({
            payment,
            verification:
              existingVerification,
            alreadyRecorded: true,
          });

          return;
        }

        /**
         * STEP 5:
         * Validate eligibility.
         */

        validatePaymentEligibility(
        payment,
        subscription
        );

        validateExistingVerification(
        existingVerification,
        payment,
        evidence
        );

        /**
         * ============================================================
         * CANCELLATION-SAFE SETTLEMENT CLAIM
         * ============================================================
         *
         * Must execute inside the current MongoDB
         * transaction before settlement writes.
         *
         * This forces a write conflict against
         * concurrent subscription cancellation.
         */

        await claimSettlementCancellationSafety({
        payment,
        subscription,
        session,
        });

        /**
         * STEP 6:
         * Check duplicate receipts.
         *
         * Unique database indexes remain
         * the final concurrency safeguard.
         */

        const duplicatePayment =
          await PaymentTransaction.findOne({
            provider:
              PAYMENT_PROVIDERS.MPESA,

            providerReceipt:
              validated.mpesaReceiptNumber,

            _id: {
              $ne: payment._id,
            },
          }).session(session);

        if (duplicatePayment) {
          fail(
            "M-Pesa receipt is already associated with another payment.",
            "DUPLICATE_MPESA_RECEIPT"
          );
        }

        const duplicateVerification =
          await MpesaFinancialVerification.findOne({
            provider:
              PAYMENT_PROVIDERS.MPESA,

            mpesaReceiptNumber:
              validated.mpesaReceiptNumber,

            paymentId: {
              $ne: payment._id,
            },
          }).session(session);

        if (duplicateVerification) {
          fail(
            "M-Pesa receipt is already associated with another verification.",
            "DUPLICATE_FINANCIAL_RECEIPT"
          );
        }

        /**
         * STEP 7:
         * Write financial verification.
         */

        const now = new Date();

        let verification;

        if (existingVerification) {
          verification =
            await MpesaFinancialVerification.findOneAndUpdate(
              {
                _id:
                  existingVerification._id,

                status:
                  FINANCIAL_VERIFICATION_STATUSES.PENDING,

                requiresManualReview:
                  false,
              },
              {
                $set: {
                  status:
                    FINANCIAL_VERIFICATION_STATUSES.VERIFIED,

                  evidenceSource:
                    validated.evidenceSource,

                  providerTransactionId:
                    validated.providerTransactionId,

                  mpesaReceiptNumber:
                    validated.mpesaReceiptNumber,

                  verifiedAmountMinor:
                    validated.amountMinor,

                  verifiedCurrency:
                    validated.currency,

                  verifiedAt: now,

                  evidenceReference:
                    evidence.evidenceReference.trim(),

                  verificationErrorCode:
                    null,

                  requiresManualReview:
                    false,

                  manualReviewReason:
                    null,
                },
              },
              {
                new: true,
                session,
              }
            );
        } else {
          const created =
            await MpesaFinancialVerification.create(
              [
                {
                  paymentId:
                    payment._id,

                  subscriptionId:
                    subscription._id,

                  provider:
                    PAYMENT_PROVIDERS.MPESA,

                  status:
                    FINANCIAL_VERIFICATION_STATUSES.VERIFIED,

                  evidenceSource:
                    validated.evidenceSource,

                  providerTransactionId:
                    validated.providerTransactionId,

                  mpesaReceiptNumber:
                    validated.mpesaReceiptNumber,

                  verifiedAmountMinor:
                    validated.amountMinor,

                  verifiedCurrency:
                    validated.currency,

                  verifiedAt: now,

                  evidenceReference:
                    evidence.evidenceReference.trim(),

                  requiresManualReview:
                    false,
                },
              ],
              {
                session,
              }
            );

          verification = created[0];
        }

        if (!verification) {
          fail(
            "Financial verification could not be recorded.",
            "FINANCIAL_VERIFICATION_WRITE_FAILED"
          );
        }

        /**
         * STEP 8:
         * Atomically update payment state.
         */

        const paymentUpdate =
          await PaymentTransaction.updateOne(
            {
              _id: payment._id,

              __v: payment.__v,

              status: {
                $in: [
                  PENDING,
                  PROCESSING,
                ],
              },

              verificationStatus:
                UNVERIFIED,

              providerReceipt: null,

              verifiedAt: null,

              paidAt: null,

              entitlementAppliedAt:
                null,
            },
            {
              $set: {
                status:
                  SUCCEEDED,

                verificationStatus:
                  VERIFIED,

                providerReceipt:
                  validated.mpesaReceiptNumber,

                verifiedAt:
                  now,

                paidAt:
                  now,
              },

              $inc: {
                __v: 1,
              },
            },
            {
              session,
            }
          );

        if (
          paymentUpdate.modifiedCount !== 1
        ) {
          fail(
            "Payment state changed during settlement recording.",
            "PAYMENT_SETTLEMENT_CONFLICT"
          );
        }

        /**
         * STEP 9:
         * Return the committed result.
         */

        const updatedPayment = {
          ...payment.toObject(),

          status: SUCCEEDED,

          verificationStatus:
            VERIFIED,

          providerReceipt:
            validated.mpesaReceiptNumber,

          verifiedAt: now,

          paidAt: now,
        };

        result = buildSettlementResult({
          payment: updatedPayment,
          verification,
          alreadyRecorded: false,
        });
      }
    );

    return result;
  };

/**
 * ============================================================
 * STEP 18.29 — AUTHORITATIVE FINANCIAL SETTLEMENT
 * ============================================================
 *
 * This is the only exported settlement entry point.
 *
 * SECURITY:
 *
 * - Accepts a payment ID only.
 * - Does not accept caller-supplied evidence.
 * - Fetches evidence through the internal merchant adapter.
 * - Validates merchant transaction details.
 * - Commits only authenticated, matching evidence.
 * - Does not activate subscriptions.
 *
 * The provider adapter remains fail-closed until
 * a real authenticated merchant reporting source
 * has been implemented.
 */

const settlementUnavailable = (
  paymentId,
  reason
) => ({
  recorded: false,
  alreadyRecorded: false,
  paymentId: paymentId || null,
  reason,
  paymentVerified: false,
  entitlementApplied: false,
  subscriptionActivated: false,
});

export const recordMpesaFinancialSettlement =
  async ({ paymentId } = {}) => {
    /**
     * ========================================================
     * STEP 1 — VALIDATE PAYMENT ID
     * ========================================================
     */

    if (!isValidId(paymentId)) {
      return settlementUnavailable(
        null,
        "INVALID_PAYMENT_ID"
      );
    }

    /**
     * ========================================================
     * STEP 2 — ENFORCE SOURCE CONFIGURATION
     * ========================================================
     */

    const merchantConfig =
      getMpesaMerchantSourceConfig();

    if (!merchantConfig.enabled) {
      return settlementUnavailable(
        paymentId,
        merchantConfig.reason ||
          "AUTHENTICATED_MERCHANT_SOURCE_DISABLED"
      );
    }

    /**
     * Automatic settlement requires its own
     * explicit configuration gate.
     */

    if (
      merchantConfig.automaticSettlementEnabled !== true
    ) {
      return settlementUnavailable(
        paymentId,
        "AUTOMATIC_SETTLEMENT_DISABLED"
      );
    }

    /**
     * ========================================================
     * STEP 3 — LOAD PAYMENT
     * ========================================================
     */

    const payment =
      await PaymentTransaction.findById(paymentId);

    if (!payment) {
      return settlementUnavailable(
        paymentId,
        "PAYMENT_NOT_FOUND"
      );
    }

    if (
      payment.provider !== PAYMENT_PROVIDERS.MPESA
    ) {
      return settlementUnavailable(
        paymentId,
        "UNSUPPORTED_PAYMENT_PROVIDER"
      );
    }

    if (
      payment.purpose !==
      PAYMENT_PURPOSES.SUBSCRIPTION_INITIAL
    ) {
      return settlementUnavailable(
        paymentId,
        "UNSUPPORTED_PAYMENT_PURPOSE"
      );
    }

    if (
      ![PENDING, PROCESSING, SUCCEEDED].includes(
        payment.status
      )
    ) {
      return settlementUnavailable(
        paymentId,
        "PAYMENT_NOT_SETTLEMENT_ELIGIBLE"
      );
    }

    if (
      payment.status !== SUCCEEDED &&
      payment.verificationStatus !== UNVERIFIED
    ) {
      return settlementUnavailable(
        paymentId,
        "PAYMENT_VERIFICATION_STATE_CONFLICT"
      );
    }

    /**
     * ========================================================
     * STEP 4 — IDENTIFY EXPECTED RECEIPT
     * ========================================================
     */

    const receiptNumber =
      payment.transactionStatusEnquiry?.receiptNumber;

    if (
      typeof receiptNumber !== "string" ||
      !/^[A-Za-z0-9]{8,30}$/.test(receiptNumber)
    ) {
      return settlementUnavailable(
        paymentId,
        "SETTLEMENT_RECEIPT_MISSING"
      );
    }

    /**
     * ========================================================
     * STEP 5 — FETCH AUTHENTICATED MERCHANT EVIDENCE
     * ========================================================
     *
     * This call must retrieve evidence independently.
     *
     * Never replace it with:
     *
     * - Callback payloads
     * - STK Query responses
     * - Client-supplied receipts
     * - Existing database verification flags
     */

    const merchantResult =
      await fetchAuthenticatedMerchantTransaction({
        receiptNumber,
      });

    if (
      merchantResult.status !==
        MERCHANT_RECONCILIATION_STATUSES.VERIFIED ||
      merchantResult.authenticated !== true ||
      !merchantResult.transaction ||
      typeof merchantResult.evidenceReference !==
        "string" ||
      !merchantResult.evidenceReference.trim()
    ) {
      return settlementUnavailable(
        paymentId,
        merchantResult.reason ||
          "AUTHENTICATED_SETTLEMENT_EVIDENCE_UNAVAILABLE"
      );
    }

    /**
     * ========================================================
     * STEP 6 — VALIDATE MERCHANT TRANSACTION
     * ========================================================
     */

    const mpesaConfig = getMpesaConfig();

    const validation =
      validateMerchantTransactionEvidence({
        payment,
        transaction: merchantResult.transaction,
        expectedMerchantShortcode:
          mpesaConfig.shortcode,
      });

    if (!validation.valid) {
      return settlementUnavailable(
        paymentId,
        validation.reason
      );
    }

    /**
     * ========================================================
     * STEP 7 — BUILD INTERNAL SETTLEMENT EVIDENCE
     * ========================================================
     *
     * Only server-controlled fields are used.
     *
     * The providerTransactionId is the original
     * CheckoutRequestID stored during initiation.
     *
     * The authenticated merchant record must
     * independently identify the same payment.
     */

    const evidence = Object.freeze({
      source:
        FINANCIAL_EVIDENCE_SOURCES.PROVIDER_SETTLEMENT,

      providerTransactionId:
        payment.providerTransactionId,

      mpesaReceiptNumber:
        merchantResult.transaction.receiptNumber,

      amountMinor:
        merchantResult.transaction.amountMinor,

      currency:
        merchantResult.transaction.currency,

      evidenceReference:
        merchantResult.evidenceReference.trim(),
    });

    /**
     * ========================================================
     * STEP 8 — RECORD SETTLEMENT ATOMICALLY
     * ========================================================
     *
     * This function already:
     *
     * - Validates payment ownership.
     * - Validates the subscription.
     * - Checks duplicate receipts.
     * - Coordinates cancellation safety.
     * - Updates financial verification.
     * - Updates payment status.
     *
     * All database changes occur within
     * the existing MongoDB transaction.
     */

    const result =
      await commitAuthenticatedSettlement({
        paymentId,
        evidence,
      });

    /**
     * ========================================================
     * STEP 9 — RETURN RESULT
     * ========================================================
     */

    return {
      ...result,

      reason: result.recorded
        ? "AUTHORITATIVE_SETTLEMENT_RECORDED"
        : "SETTLEMENT_NOT_RECORDED",

      authenticatedSource:
        "SAFARICOM_BUSINESS_API",

      subscriptionActivated: false,
    };
  };

export default {
  recordMpesaFinancialSettlement,
};