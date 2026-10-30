import { useEffect, useState } from "react";

import {
  getPaymentAccessStatus,
} from "../api/services/paymentAccessService.js";

/**
 * ============================================================
 * PREMIUMCHAT — M-PESA PAYMENT STATUS HOOK
 * ============================================================
 *
 * STEP 19.8.26
 *
 * SECURITY:
 *
 * - Read-only payment monitoring.
 * - Does not verify payments.
 * - Does not activate subscriptions.
 * - Does not grant premium access.
 */

const POLL_INTERVAL_MS = 5000;

const MAX_POLL_DURATION_MS = 180000;

const TERMINAL_STAGES = new Set([
  "SUBSCRIPTION_ACTIVATED",
  "CHECKOUT_FAILED",
  "MANUAL_REVIEW_REQUIRED",
  "VERIFICATION_INCONSISTENT",
]);

export default function useMpesaPaymentStatus(
  paymentId
) {
  const [payment, setPayment] =
    useState(null);

  const [isPolling, setIsPolling] =
    useState(false);

  const [error, setError] =
    useState("");

  const [timedOut, setTimedOut] =
    useState(false);

  useEffect(() => {
    if (!paymentId) {
      setPayment(null);
      setIsPolling(false);
      setError("");
      setTimedOut(false);
      return;
    }

    let active = true;

    let timer = null;

    let controller = null;

    const startedAt = Date.now();

    const poll = async () => {
      if (!active) {
        return;
      }

      if (
        Date.now() - startedAt >=
        MAX_POLL_DURATION_MS
      ) {
        setTimedOut(true);
        setIsPolling(false);
        return;
      }

      controller = new AbortController();

      try {
        const response =
          await getPaymentAccessStatus(
            paymentId,
            {
              signal: controller.signal,
            }
          );

        if (!active) {
          return;
        }

        const nextPayment =
          response?.data?.payment;

        if (
          response?.success !== true ||
          !nextPayment ||
          nextPayment.id !== paymentId
        ) {
          throw new Error(
            "Invalid payment status response."
          );
        }

        setPayment(nextPayment);
        setError("");

        if (
          TERMINAL_STAGES.has(
            nextPayment.paymentStage
          )
        ) {
          setIsPolling(false);
          return;
        }

        timer = setTimeout(
          poll,
          POLL_INTERVAL_MS
        );
      } catch (requestError) {
        if (!active) {
          return;
        }

        if (
          requestError?.code ===
          "ERR_CANCELED"
        ) {
          return;
        }

        setError(
          "Unable to retrieve payment status. Retrying..."
        );

        timer = setTimeout(
          poll,
          POLL_INTERVAL_MS
        );
      }
    };

    setPayment(null);
    setError("");
    setTimedOut(false);
    setIsPolling(true);

    poll();

    return () => {
      active = false;

      if (timer) {
        clearTimeout(timer);
      }

      controller?.abort();
    };
  }, [paymentId]);

  return {
    payment,
    isPolling,
    error,
    timedOut,
  };
}