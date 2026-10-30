import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  CheckCircle2,
  CreditCard,
  Loader2,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";

import {
  createPendingSubscription,
  initiateMpesaSubscriptionPayment,
  recoverMpesaPayment,
} from "../../api/services/subscriptionCheckoutService.js";

import {
  getCreatorSubscriptionAccess,
  getPaymentAccessStatus,
} from "../../api/services/paymentAccessService.js";

import {
  formatSubscriptionPrice,
  supportsMpesaCheckout,
} from "../../utils/subscriptionPricing.js";

import {
  loadMpesaCheckout,
  saveMpesaCheckout,
  clearMpesaCheckout,
} from "../../utils/mpesaCheckoutRecovery.js";

import { useAuthStore } from "../../store/useAuthStore.js";

/**
 * ============================================================
 * PREMIUMCHAT — SECURE M-PESA SUBSCRIPTION CHECKOUT
 * ============================================================
 *
 * STEP 19.8.29
 *
 * FEATURES:
 *
 * - Pending subscription creation
 * - M-Pesa STK Push initiation
 * - Stable request identifiers
 * - Checkout recovery after refresh
 * - Read-only payment recovery
 * - Existing payment status monitoring
 * - Manual payment status refresh
 * - Backend-confirmed subscription entitlement
 *
 * SECURITY:
 *
 * - No automatic STK Push retries.
 * - No new payment request after uncertain outcome.
 * - No frontend payment confirmation.
 * - No frontend subscription activation.
 * - No premium access based on STK acceptance.
 * - No premium access based on callbacks alone.
 */

const POLL_INTERVAL_MS = 5000;

const POLL_TIMEOUT_MS = 180000;

const TERMINAL_STAGES = new Set([
  "SUBSCRIPTION_ACTIVATED",
  "CHECKOUT_FAILED",
  "MANUAL_REVIEW_REQUIRED",
  "VERIFICATION_INCONSISTENT",
]);

const getErrorMessage = (error) =>
  error?.response?.data?.message ||
  error?.message ||
  "Something went wrong. Please try again.";

const createRequestId = () => {
  if (
    typeof crypto === "undefined" ||
    typeof crypto.randomUUID !== "function"
  ) {
    throw new Error(
      "Secure request identifiers are unavailable."
    );
  }

  return crypto.randomUUID();
};

const normalizePhone = (value) => {
  const cleaned = String(value ?? "")
    .trim()
    .replace(/[\s-]/g, "");

  if (/^07\d{8}$/.test(cleaned)) {
    return `254${cleaned.slice(1)}`;
  }

  if (/^01\d{8}$/.test(cleaned)) {
    return `254${cleaned.slice(1)}`;
  }

  if (/^\+254[71]\d{8}$/.test(cleaned)) {
    return cleaned.slice(1);
  }

  if (/^254[71]\d{8}$/.test(cleaned)) {
    return cleaned;
  }

  return null;
};

const getSubscriptionId = (response) =>
  response?.data?.subscription?._id ||
  response?.data?.subscription?.id ||
  null;

const getInitiatedPaymentId = (response) =>
  response?.data?.payment?.paymentId ||
  null;

const getRecoveredPaymentId = (response) =>
  response?.data?.payment?.id ||
  null;

const isCanceledRequest = (error) =>
  error?.code === "ERR_CANCELED" ||
  error?.name === "CanceledError" ||
  error?.name === "AbortError";

export default function MpesaSubscriptionCheckout({
  creatorId,
  plan,
  onAccessGranted,
}) {
  /**
   * ==========================================================
   * AUTHENTICATED SUBSCRIBER
   * ==========================================================
   */

  const currentUser = useAuthStore(
    (state) => state.user
  );

  const subscriberId = String(
    currentUser?._id ??
    currentUser?.id ??
    ""
  ).trim();

  const planId = String(
    plan?._id ??
    plan?.id ??
    ""
  ).trim();

  /**
   * ==========================================================
   * CHECKOUT STATE
   * ==========================================================
   */

  const [phoneNumber, setPhoneNumber] =
    useState("");

  const [isSubmitting, setIsSubmitting] =
    useState(false);

  const [isRecovering, setIsRecovering] =
    useState(false);

  const [paymentId, setPaymentId] =
    useState(null);

  const [payment, setPayment] =
    useState(null);

  const [checkoutError, setCheckoutError] =
    useState("");

  const [pollingError, setPollingError] =
    useState("");

  const [accessMessage, setAccessMessage] =
    useState("");

  const [accessConfirmed, setAccessConfirmed] =
    useState(false);

  const [isPolling, setIsPolling] =
    useState(false);

  const [timedOut, setTimedOut] =
    useState(false);

  const [requestOutcomeUnknown, setRequestOutcomeUnknown] =
    useState(false);

  const [checkoutRecord, setCheckoutRecord] =
    useState(null);

  /**
   * ==========================================================
   * REFS
   * ==========================================================
   */

  const submittingRef = useRef(false);

  const recoveringRef = useRef(false);

  const entitlementCheckingRef = useRef(false);

  const pollStartedAtRef = useRef(null);

  const accessGrantedRef = useRef(false);

  /**
   * ==========================================================
   * SAVE CHECKOUT
   * ==========================================================
   */

  const persistCheckout = useCallback(
    (updates) => {
      if (!subscriberId || !creatorId) {
        return null;
      }

      const existing = loadMpesaCheckout({
        subscriberId,
        creatorId,
      });

      const record = {
        ...existing,
        ...updates,
        planId,
      };

      const saved = saveMpesaCheckout({
        subscriberId,
        creatorId,
        checkout: record,
      });

      if (!saved) {
        return null;
      }

      setCheckoutRecord(record);

      return record;
    },
    [
      subscriberId,
      creatorId,
      planId,
    ]
  );

  /**
   * ==========================================================
   * RESTORE EXISTING CHECKOUT
   * ==========================================================
   */

  useEffect(() => {
    setPhoneNumber("");
    setPaymentId(null);
    setPayment(null);
    setCheckoutError("");
    setPollingError("");
    setAccessMessage("");
    setAccessConfirmed(false);
    setTimedOut(false);
    setRequestOutcomeUnknown(false);
    setCheckoutRecord(null);

    pollStartedAtRef.current = null;
    accessGrantedRef.current = false;

    if (
      !subscriberId ||
      !creatorId ||
      !planId
    ) {
      return;
    }

    const saved = loadMpesaCheckout({
      subscriberId,
      creatorId,
    });

    if (!saved) {
      return;
    }

    if (saved.planId !== planId) {
      setCheckoutError(
        "An unfinished checkout exists for another plan. Return to that plan before starting a new payment."
      );

      setCheckoutRecord(saved);
      setRequestOutcomeUnknown(true);

      return;
    }

    setCheckoutRecord(saved);

    if (saved.phoneNumber) {
      setPhoneNumber(saved.phoneNumber);
    }

    if (saved.paymentId) {
      setPaymentId(saved.paymentId);
    } else if (saved.paymentRequestId) {
      setRequestOutcomeUnknown(true);
    }
  }, [
    subscriberId,
    creatorId,
    planId,
  ]);

  /**
   * ==========================================================
   * VERIFY AUTHORITATIVE SUBSCRIPTION ACCESS
   * ==========================================================
   */

  const refreshAccess = useCallback(
    async () => {
      if (
        !creatorId ||
        entitlementCheckingRef.current
      ) {
        return;
      }

      entitlementCheckingRef.current = true;

      setAccessMessage("");

      try {
        const response =
          await getCreatorSubscriptionAccess(
            creatorId
          );

        const hasAccess =
          response?.success === true &&
          response?.data?.hasAccess === true;

        if (!hasAccess) {
          setAccessMessage(
            "Your subscription is not yet confirmed as active. Please check again later."
          );

          return;
        }

        setAccessConfirmed(true);

        if (
          !accessGrantedRef.current &&
          typeof onAccessGranted === "function"
        ) {
          accessGrantedRef.current = true;
          onAccessGranted();
        }

        clearMpesaCheckout({
          subscriberId,
          creatorId,
        });
      } catch {
        setAccessMessage(
          "Unable to confirm subscription access. Please try again."
        );
      } finally {
        entitlementCheckingRef.current = false;
      }
    },
    [
      creatorId,
      subscriberId,
      onAccessGranted,
    ]
  );

  /**
   * ==========================================================
   * READ EXISTING PAYMENT STATUS
   * ==========================================================
   */

  const checkPaymentStatus = useCallback(
    async (id, options = {}) => {
      if (!id) return null;

      const response =
        await getPaymentAccessStatus(
          id,
          options
        );

      const result =
        response?.data?.payment;

      if (
        response?.success !== true ||
        result?.id !== id
      ) {
        throw new Error(
          "Invalid payment status response."
        );
      }

      setPayment(result);
      setPollingError("");

      return result;
    },
    []
  );

  /**
   * ==========================================================
   * PAYMENT STATUS POLLING
   * ==========================================================
   */

  useEffect(() => {
    if (!paymentId || accessConfirmed) {
      return;
    }

    const controller =
      new AbortController();

    let timeoutId = null;

    let stopped = false;

    pollStartedAtRef.current = Date.now();

    setTimedOut(false);
    setIsPolling(true);

    const poll = async () => {
      if (
        stopped ||
        controller.signal.aborted
      ) {
        return;
      }

      const elapsed =
        Date.now() -
        pollStartedAtRef.current;

      if (elapsed >= POLL_TIMEOUT_MS) {
        setTimedOut(true);
        setIsPolling(false);
        return;
      }

      try {
        const result =
          await checkPaymentStatus(
            paymentId,
            {
              signal: controller.signal,
            }
          );

        if (
          stopped ||
          controller.signal.aborted
        ) {
          return;
        }

        if (
          result?.paymentStage ===
          "SUBSCRIPTION_ACTIVATED"
        ) {
          setIsPolling(false);

          await refreshAccess();

          return;
        }

        if (
          TERMINAL_STAGES.has(
            result?.paymentStage
          )
        ) {
          setIsPolling(false);
          return;
        }
      } catch (error) {
        if (
          stopped ||
          controller.signal.aborted ||
          isCanceledRequest(error)
        ) {
          return;
        }

        setPollingError(
          getErrorMessage(error)
        );
      }

      if (
        !stopped &&
        !controller.signal.aborted
      ) {
        timeoutId = setTimeout(
          poll,
          POLL_INTERVAL_MS
        );
      }
    };

    poll();

    return () => {
      stopped = true;
      controller.abort();

      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      setIsPolling(false);
    };
  }, [
    paymentId,
    accessConfirmed,
    checkPaymentStatus,
    refreshAccess,
  ]);

  /**
   * ==========================================================
   * RECOVER EXISTING PAYMENT
   * ==========================================================
   */

  const handleRecoverPayment = async () => {
    if (
      recoveringRef.current ||
      !checkoutRecord?.paymentRequestId
    ) {
      return;
    }

    recoveringRef.current = true;

    setIsRecovering(true);
    setCheckoutError("");

    try {
      const response =
        await recoverMpesaPayment(
          checkoutRecord.paymentRequestId
        );

      const recoveredPaymentId =
        getRecoveredPaymentId(response);

      if (
        response?.success !== true ||
        !recoveredPaymentId
      ) {
        throw new Error(
          "Unable to recover the existing payment."
        );
      }

      persistCheckout({
        paymentId: recoveredPaymentId,
      });

      setPaymentId(recoveredPaymentId);

      setRequestOutcomeUnknown(false);
    } catch (error) {
      setRequestOutcomeUnknown(true);

      if (
        error?.response?.status === 404
      ) {
        setCheckoutError(
          "No matching payment is currently available. The previous request may still be processing. Do not initiate another payment until its outcome is confirmed."
        );
      } else {
        setCheckoutError(
          getErrorMessage(error)
        );
      }
    } finally {
      recoveringRef.current = false;
      setIsRecovering(false);
    }
  };

  /**
   * ==========================================================
   * INITIATE CHECKOUT
   * ==========================================================
   */

  const handleCheckout = async (event) => {
    event.preventDefault();

    if (
      submittingRef.current ||
      paymentId ||
      accessConfirmed ||
      requestOutcomeUnknown ||
      checkoutRecord?.paymentRequestId
    ) {
      return;
    }

    if (
      !subscriberId ||
      !creatorId ||
      !planId
    ) {
      setCheckoutError(
        "Please sign in and select a valid subscription plan."
      );

      return;
    }

    if (
      !supportsMpesaCheckout({
        ...plan,
        status:
          plan?.status || "ACTIVE",
      })
    ) {
      setCheckoutError(
        "This plan is not available for M-Pesa checkout."
      );

      return;
    }

    const normalizedPhone =
      normalizePhone(phoneNumber);

    if (!normalizedPhone) {
      setCheckoutError(
        "Enter a valid Kenyan mobile number."
      );

      return;
    }

    submittingRef.current = true;

    setIsSubmitting(true);
    setCheckoutError("");

    try {
      let existing = loadMpesaCheckout({
        subscriberId,
        creatorId,
      });

      if (
        existing &&
        existing.planId !== planId
      ) {
        throw new Error(
          "An unfinished checkout exists for another plan."
        );
      }

      let subscriptionRequestId =
        existing?.subscriptionRequestId;

      if (!subscriptionRequestId) {
        subscriptionRequestId =
          createRequestId();

        const saved = persistCheckout({
          subscriptionRequestId,
          phoneNumber: normalizedPhone,
        });

        if (!saved) {
          throw new Error(
            "Unable to preserve checkout information. Please enable browser storage before proceeding."
          );
        }
      }

      let subscriptionId =
        existing?.subscriptionId;

      if (!subscriptionId) {
        const subscriptionResponse =
          await createPendingSubscription({
            planId,
            clientRequestId:
              subscriptionRequestId,
          });

        subscriptionId =
          getSubscriptionId(
            subscriptionResponse
          );

        if (
          subscriptionResponse?.success !== true ||
          !subscriptionId
        ) {
          throw new Error(
            "Subscription creation could not be confirmed. Retry using the same request identifier."
          );
        }

        const saved = persistCheckout({
          subscriptionId,
          subscriptionRequestId,
          phoneNumber: normalizedPhone,
        });

        if (!saved) {
          throw new Error(
            "Unable to preserve the subscription ID. Do not continue to payment."
          );
        }
      }

      existing = loadMpesaCheckout({
        subscriberId,
        creatorId,
      });

      if (existing?.paymentRequestId) {
        setRequestOutcomeUnknown(true);

        throw new Error(
          "An existing payment request must be recovered before another attempt."
        );
      }

      const paymentRequestId =
        createRequestId();

      const saved = persistCheckout({
        subscriptionId,
        subscriptionRequestId,
        paymentRequestId,
        phoneNumber: normalizedPhone,
      });

      if (!saved) {
        throw new Error(
          "Unable to preserve payment request details. Payment was not initiated."
        );
      }

      /*
       * The payment request ID is now persisted.
       *
       * Any subsequent failure is treated as
       * an uncertain initiation outcome.
       */

      setRequestOutcomeUnknown(true);

      const paymentResponse =
        await initiateMpesaSubscriptionPayment({
          subscriptionId,
          phoneNumber: normalizedPhone,
          clientRequestId:
            paymentRequestId,
        });

      const initiatedPaymentId =
        getInitiatedPaymentId(
          paymentResponse
        );

      if (
        paymentResponse?.success !== true ||
        !initiatedPaymentId
      ) {
        throw new Error(
          "Payment request outcome is uncertain. Recover the existing transaction."
        );
      }

      persistCheckout({
        paymentId: initiatedPaymentId,
      });

      setPaymentId(
        initiatedPaymentId
      );

      setRequestOutcomeUnknown(false);
    } catch (error) {
      setCheckoutError(
        getErrorMessage(error)
      );
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  /**
   * ==========================================================
   * MANUAL PAYMENT STATUS CHECK
   * ==========================================================
   */

  const handleManualStatusCheck = async () => {
    if (!paymentId) return;

    setPollingError("");

    try {
      const result =
        await checkPaymentStatus(
          paymentId
        );

      if (
        result?.paymentStage ===
        "SUBSCRIPTION_ACTIVATED"
      ) {
        await refreshAccess();
      }
    } catch (error) {
      setPollingError(
        getErrorMessage(error)
      );
    }
  };

  /**
   * ==========================================================
   * RENDER
   * ==========================================================
   */

  if (!plan) {
    return null;
  }

  const stage =
    payment?.paymentStage;

  const hasExistingRequest =
    Boolean(
      checkoutRecord?.paymentRequestId
    );

  const canInitiate =
    !isSubmitting &&
    !isRecovering &&
    !paymentId &&
    !accessConfirmed &&
    !requestOutcomeUnknown &&
    !hasExistingRequest;

  return (
    <section className="rounded-2xl border border-white/10 bg-zinc-950 p-6">
      {/* HEADER */}

      <div className="mb-6">
        <h2 className="flex items-center gap-2 text-xl font-bold text-white">
          <CreditCard className="text-amber-400" />
          Complete Subscription
        </h2>

        <p className="mt-2 text-sm text-zinc-400">
          {plan.name}
          {" — "}
          {formatSubscriptionPrice(
            plan.monthlyPriceMinor,
            plan.currency
          )}
          {" / month"}
        </p>
      </div>

      {/* PAYMENT FORM */}

      {!paymentId &&
        !accessConfirmed &&
        !requestOutcomeUnknown &&
        !hasExistingRequest && (
          <form
            onSubmit={handleCheckout}
            className="space-y-4"
          >
            <div>
              <label
                htmlFor="mpesa-phone"
                className="mb-2 block text-sm font-medium text-zinc-300"
              >
                M-Pesa Phone Number
              </label>

              <input
                id="mpesa-phone"
                type="tel"
                autoComplete="tel"
                value={phoneNumber}
                onChange={(event) =>
                  setPhoneNumber(
                    event.target.value
                  )
                }
                placeholder="07XXXXXXXX"
                disabled={isSubmitting}
                className="w-full rounded-xl border border-white/10 bg-zinc-900 px-4 py-3 text-white outline-none focus:border-amber-400"
                required
              />
            </div>

            {checkoutError && (
              <p
                role="alert"
                className="text-sm text-red-400"
              >
                {checkoutError}
              </p>
            )}

            <button
              type="submit"
              disabled={!canInitiate}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 py-3 font-semibold text-black hover:bg-amber-300 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2
                    size={18}
                    className="animate-spin"
                  />
                  Processing...
                </>
              ) : (
                "Pay with M-Pesa"
              )}
            </button>
          </form>
        )}

      {/* RECOVERY */}

      {!paymentId &&
        !accessConfirmed &&
        hasExistingRequest && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-xl border border-amber-400/20 bg-amber-400/5 p-4">
              <ShieldAlert
                size={22}
                className="shrink-0 text-amber-400"
              />

              <div>
                <h3 className="font-semibold text-white">
                  Existing Payment Request
                </h3>

                <p className="mt-2 text-sm text-zinc-400">
                  A payment request already exists.
                  Recover it before attempting
                  another payment.
                </p>
              </div>
            </div>

            {checkoutError && (
              <p
                role="alert"
                className="text-sm text-red-400"
              >
                {checkoutError}
              </p>
            )}

            <button
              type="button"
              onClick={handleRecoverPayment}
              disabled={isRecovering}
              className="inline-flex items-center gap-2 rounded-xl border border-amber-400/30 px-4 py-3 text-sm font-medium text-amber-300 hover:bg-amber-400/10 disabled:opacity-50"
            >
              {isRecovering ? (
                <Loader2
                  size={17}
                  className="animate-spin"
                />
              ) : (
                <RefreshCw size={17} />
              )}

              {isRecovering
                ? "Recovering..."
                : "Recover Existing Payment"}
            </button>
          </div>
        )}

      {/* PAYMENT MONITORING */}

      {paymentId &&
        !accessConfirmed && (
          <div className="space-y-5">
            {isPolling && (
              <div className="flex items-center gap-3 text-sm text-zinc-300">
                <Loader2
                  size={20}
                  className="animate-spin text-amber-400"
                />

                Checking payment status...
              </div>
            )}

            {stage ===
              "PENDING_CHECKOUT" && (
              <p className="text-sm text-zinc-300">
                Your M-Pesa request is being
                processed. Check your phone
                for the payment prompt.
              </p>
            )}

            {stage ===
              "AWAITING_FINANCIAL_VERIFICATION" && (
              <p className="text-sm text-amber-300">
                Your checkout has been
                reconciled and is awaiting
                independent financial
                verification.
              </p>
            )}

            {stage ===
              "PAYMENT_VERIFIED" && (
              <p className="text-sm text-amber-300">
                Payment verified.
                Subscription activation
                is still pending.
              </p>
            )}

            {stage ===
              "SUBSCRIPTION_ACTIVATED" && (
              <div className="space-y-3">
                <p className="text-sm text-green-400">
                  Subscription activation
                  recorded. Confirming access...
                </p>

                <button
                  type="button"
                  onClick={refreshAccess}
                  className="inline-flex items-center gap-2 rounded-xl border border-amber-400/30 px-4 py-2 text-sm text-amber-300"
                >
                  <RefreshCw size={16} />
                  Refresh Access
                </button>
              </div>
            )}

            {stage ===
              "CHECKOUT_FAILED" && (
              <p
                role="alert"
                className="text-sm text-red-400"
              >
                This checkout attempt failed.
                No subscription access has
                been granted.
              </p>
            )}

            {stage ===
              "MANUAL_REVIEW_REQUIRED" && (
              <p className="text-sm text-amber-300">
                This payment requires
                manual review. Do not
                initiate another payment.
              </p>
            )}

            {stage ===
              "VERIFICATION_INCONSISTENT" && (
              <p
                role="alert"
                className="text-sm text-red-400"
              >
                Payment verification requires
                attention. Contact support
                before attempting another payment.
              </p>
            )}

            {timedOut && (
              <p className="text-sm text-zinc-400">
                Automatic monitoring has
                stopped. Your payment may
                still be processing.
              </p>
            )}

            {pollingError && (
              <p className="text-sm text-amber-300">
                {pollingError}
              </p>
            )}

            {accessMessage && (
              <p className="text-sm text-zinc-400">
                {accessMessage}
              </p>
            )}

            <button
              type="button"
              onClick={handleManualStatusCheck}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm text-zinc-300 hover:bg-white/5"
            >
              <RefreshCw size={16} />
              Check Payment Status
            </button>
          </div>
        )}

      {/* CONFIRMED ACCESS */}

      {accessConfirmed && (
        <div className="flex items-center gap-3 text-green-400">
          <CheckCircle2 size={22} />

          <p className="text-sm font-medium">
            Subscription active.
            Premium access confirmed.
          </p>
        </div>
      )}

      {/* SECURITY NOTICE */}

      <div className="mt-6 flex items-start gap-2 border-t border-white/10 pt-4 text-xs text-zinc-500">
        <ShieldCheck
          size={16}
          className="shrink-0 text-amber-400"
        />

        <span>
          Premium access is granted only
          after backend payment verification
          and subscription entitlement
          confirmation.
        </span>
      </div>
    </section>
  );
}