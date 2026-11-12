
import { useEffect, useState } from "react";

import {
  Lock,
  Loader2,
  RefreshCw,
  Smartphone,
} from "lucide-react";

import {
  getMediaAccess,
  getMediaPreview,
  purchaseMedia,
  getMediaPurchaseStatus,
} from "../../api/services/paidMediaService.js";

import { useChatStore } from "../../store/useChatStore.js";

/**
 * ============================================================
 * PREMIUMCHAT — MESSAGE BUBBLE
 * ============================================================
 */

const formatMessageTime = (value) => {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatMediaPrice = (priceMinor, currency = "KES") => {
  if (
    !Number.isSafeInteger(priceMinor) ||
    priceMinor < 1
  ) {
    return "Price unavailable";
  }

  try {
    return new Intl.NumberFormat("en-KE", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(priceMinor / 100);
  } catch {
    return `${currency} ${(priceMinor / 100).toFixed(2)}`;
  }
};

const generatePurchaseRequestId = () => {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID().replace(/-/g, "");
  }

  return `${Date.now()}_${Math.random().toString(36).slice(2, 15)}`;
};

function MessageStatus({ status }) {
  const normalizedStatus =
    typeof status === "string"
      ? status.toUpperCase()
      : "SENT";

  if (normalizedStatus === "READ") {
    return (
      <span
        title="Read"
        aria-label="Read"
        className="font-semibold text-sky-300"
      >
        ✓✓
      </span>
    );
  }

  if (normalizedStatus === "DELIVERED") {
    return (
      <span
        title="Delivered"
        aria-label="Delivered"
        className="text-violet-200"
      >
        ✓✓
      </span>
    );
  }

  return (
    <span
      title="Sent"
      aria-label="Sent"
      className="text-violet-200/70"
    >
      ✓
    </span>
  );
}

/**
 * ============================================================
 * PURCHASE LOCKED MEDIA
 * ============================================================
 */


function MediaPurchaseForm({ mediaId }) {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [requestId, setRequestId] = useState("");
  const [purchasing, setPurchasing] = useState(false);
  const [purchaseResult, setPurchaseResult] = useState(null);
  const [error, setError] = useState("");

  const [refreshingAccess, setRefreshingAccess] =
    useState(false);

  const [refreshMessage, setRefreshMessage] =
    useState("");

  const loadMessages = useChatStore(
    (state) => state.loadMessages
  );

  const activeConversationId = useChatStore(
    (state) => state.activeConversationId
  );

  /**
   * REFRESH PAYMENT STATUS
   *
   * First asks the backend to verify the purchase.
   * Then reloads chat messages so the server's updated
   * media authorization is reflected in the conversation.
   */
  const handleRefreshAccess = async () => {
    if (
      refreshingAccess ||
      !purchaseResult?.purchaseId
    ) {
      return;
    }

    setRefreshingAccess(true);
    setRefreshMessage("");
    setError("");

    try {
      const response = await getMediaPurchaseStatus(
        purchaseResult.purchaseId
      );

      if (response?.success !== true || !response?.data) {
        throw new Error(
          response?.message ||
            "Unable to retrieve payment status."
        );
      }

      const status = response.data;

      setPurchaseResult((previous) => ({
        ...previous,
        status: status.paymentStatus,
        verificationStatus: status.verificationStatus,
        initiationStatus:
          status.initiationStatus ??
          previous?.initiationStatus,
        paymentVerified: status.paymentVerified === true,
        mediaAccessGranted:
          status.mediaAccessGranted === true,
      }));

      /*
       * Refresh chat history after the backend status check.
       * This is what updates message.media.canAccess.
       */
      if (activeConversationId) {
        await loadMessages(activeConversationId);
      }

      if (status.mediaAccessGranted === true) {
        setRefreshMessage(
          "Payment verified successfully. Your media access has been activated."
        );

        return;
      }

      if (
        status.paymentStatus === "FAILED" ||
        status.verificationStatus === "REJECTED"
      ) {
        setRefreshMessage(
          "This payment was not verified. Media access remains locked."
        );

        return;
      }

      if (
        status.initiationStatus === "UNKNOWN"
      ) {
        setRefreshMessage(
          "The payment outcome is still uncertain. Please wait for reconciliation. Do not initiate another payment."
        );

        return;
      }

      setRefreshMessage(
        "Payment is not yet verified. Complete the M-Pesa prompt if it is still active, then check again."
      );
    } catch (requestError) {
      setRefreshMessage(
        requestError?.response?.data?.message ||
          requestError?.message ||
          "Unable to refresh payment status. Please try again."
      );
    } finally {
      setRefreshingAccess(false);
    }
  };

  /**
   * INITIATE M-PESA PURCHASE
   */
  const handlePurchase = async (event) => {
    event.preventDefault();

    if (purchasing) return;

    const normalizedPhone = phoneNumber.trim();

    if (!/^(?:254|0)?7\d{8}$/.test(normalizedPhone)) {
      setError(
        "Enter a valid Kenyan M-Pesa phone number."
      );
      return;
    }

    /*
     * Preserve the same request ID across retries.
     * Never generate a new ID just because a request
     * returned an uncertain network result.
     */
    const currentRequestId =
      requestId || generatePurchaseRequestId();

    if (!requestId) {
      setRequestId(currentRequestId);
    }

    setPurchasing(true);
    setError("");
    setRefreshMessage("");

    try {
      const response = await purchaseMedia({
        mediaId,
        phoneNumber: normalizedPhone,
        clientRequestId: currentRequestId,
      });

      if (response?.success !== true) {
        throw new Error(
          response?.message ||
            "Unable to initiate media purchase."
        );
      }

      const payment = response?.data;

      if (
        !payment?.paymentId ||
        !payment?.purchaseId
      ) {
        throw new Error(
          "The payment response could not be confirmed. Retry using the same request."
        );
      }

      setPurchaseResult(payment);

      setRefreshMessage(
        "Payment request received. Complete the M-Pesa prompt. Once Safaricom sends the callback, refresh payment status."
      );
    } catch (requestError) {
      if (
        requestError?.code === "ERR_CANCELED" ||
        requestError?.name === "CanceledError"
      ) {
        return;
      }

      setError(
        requestError?.response?.data?.message ||
          requestError?.message ||
          "Unable to initiate your purchase. You can retry using the same request."
      );

      return;
    } finally {
      setPurchasing(false);
    }

    /*
     * Refreshing chat history is independent of STK initiation.
     * A refresh failure must not turn an accepted STK request
     * into an apparent failed purchase.
     */
    if (activeConversationId) {
      try {
        await loadMessages(activeConversationId);
      } catch {
        setRefreshMessage(
          "Payment request received. Complete the M-Pesa prompt. You can refresh payment status afterward."
        );
      }
    }
  };

  const initiationStatus =
    purchaseResult?.initiationStatus?.toUpperCase();

  return (
    <div className="w-full rounded-xl border border-amber-400/20 bg-black/20 p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-300">
          <Lock size={17} />
        </span>

        <div>
          <p className="text-sm font-semibold text-white">
            Purchase premium media
          </p>

          <p className="text-xs text-slate-400">
            Pay securely using M-Pesa.
          </p>
        </div>
      </div>

      {purchaseResult ? (
        <div className="space-y-3">
          <div className="rounded-lg border border-white/10 bg-white/5 p-3">
            <p className="text-sm font-semibold text-white">
              {purchaseResult.mediaAccessGranted
                ? "Payment verified"
                : initiationStatus === "ACCEPTED"
                  ? "M-Pesa request accepted"
                  : initiationStatus === "UNKNOWN"
                    ? "Payment requires confirmation"
                    : "Payment request recorded"}
            </p>

            <p className="mt-1 text-xs leading-5 text-slate-400">
              {purchaseResult.mediaAccessGranted
                ? "Your payment has been verified and media access has been activated."
                : initiationStatus === "ACCEPTED"
                  ? "Check your phone and enter your M-Pesa PIN to complete the payment."
                  : initiationStatus === "UNKNOWN"
                    ? "The payment outcome is uncertain. Wait for backend reconciliation before attempting another payment."
                    : "Your payment request has been recorded. Media access remains locked until payment verification."}
            </p>
          </div>

          <div className="space-y-1 text-xs text-slate-400">
            <p>
              Payment status:{" "}
              <span className="font-semibold text-white">
                {purchaseResult.status || "PENDING"}
              </span>
            </p>

            <p>
              Verification:{" "}
              <span className="font-semibold text-white">
                {purchaseResult.verificationStatus ||
                  "UNVERIFIED"}
              </span>
            </p>

            <p>
              Initiation:{" "}
              <span className="font-semibold text-white">
                {purchaseResult.initiationStatus ||
                  "PROCESSING"}
              </span>
            </p>
          </div>

          {!purchaseResult.mediaAccessGranted && (
            <p className="text-xs leading-5 text-amber-200/80">
              Your media will unlock only after the server verifies and settles your payment.
            </p>
          )}

          {!purchaseResult.mediaAccessGranted && (
            <button
              type="button"
              onClick={handleRefreshAccess}
              disabled={refreshingAccess}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-amber-400/30 bg-amber-500/10 px-4 py-2.5 text-sm font-semibold text-amber-200 transition hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {refreshingAccess ? (
                <>
                  <Loader2
                    size={15}
                    className="animate-spin"
                  />
                  Checking payment...
                </>
              ) : (
                <>
                  <RefreshCw size={15} />
                  Check payment and refresh access
                </>
              )}
            </button>
          )}

          {refreshMessage && (
            <p
              role="status"
              className="text-xs leading-5 text-slate-300"
            >
              {refreshMessage}
            </p>
          )}
        </div>
      ) : (
        <form
          onSubmit={handlePurchase}
          className="space-y-3"
        >
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-300">
              M-Pesa phone number
            </span>

            <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-[#151522] px-3">
              <Smartphone
                size={17}
                className="shrink-0 text-slate-400"
              />

              <input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="07XXXXXXXX"
                value={phoneNumber}
                onChange={(event) =>
                  setPhoneNumber(event.target.value)
                }
                disabled={purchasing}
                required
                className="w-full bg-transparent py-3 text-sm text-white outline-none placeholder:text-slate-500"
              />
            </div>
          </label>

          {error && (
            <p
              role="alert"
              className="rounded-lg border border-red-400/20 bg-red-500/10 p-2.5 text-xs leading-5 text-red-300"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={
              purchasing ||
              !phoneNumber.trim()
            }
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {purchasing ? (
              <>
                <Loader2
                  size={16}
                  className="animate-spin"
                />
                Processing…
              </>
            ) : (
              "Purchase with M-Pesa"
            )}
          </button>

          <p className="text-center text-[11px] leading-5 text-slate-500">
            You will receive an STK Push on your phone. Do not share your M-Pesa PIN.
          </p>
        </form>
      )}
    </div>
  );
}


/**
 * ============================================================
 * IMAGE CONTENT + LOCKED PREVIEWS
 * ============================================================
 */

function MessageMedia({ message }) {
  const mediaId =
    typeof message.mediaId === "string"
      ? message.mediaId
      : message.mediaId?._id
        ? String(message.mediaId._id)
        : "";

  const available = message.media?.available === true;
  const canAccess = message.media?.canAccess === true;
  const canPurchase = message.media?.canPurchase === true;

  const price = formatMediaPrice(
    message.media?.priceMinor,
    message.media?.currency || "KES"
  );

  const isProcessing =
    message.media?.status === "PROCESSING" ||
    (
      message.media?.status === "READY" &&
      message.media?.moderationStatus === "PENDING"
    );

  const [deliveryUrl, setDeliveryUrl] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");

  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [error, setError] = useState("");
  const [previewError, setPreviewError] = useState("");

  const [purchaseExpanded, setPurchaseExpanded] =
    useState(false);

  const [retryKey, setRetryKey] = useState(0);
  const [previewRetryKey, setPreviewRetryKey] =
    useState(0);

  const loadMessages = useChatStore(
    (state) => state.loadMessages
  );

  const activeConversationId = useChatStore(
    (state) => state.activeConversationId
  );

  const [refreshingAvailability, setRefreshingAvailability] =
    useState(false);

  const [availabilityMessage, setAvailabilityMessage] =
    useState("");

  /**
   * REFRESH PROCESSING IMAGE
   */

  const handleCheckAvailability = async () => {
    if (
      refreshingAvailability ||
      !activeConversationId
    ) {
      return;
    }

    setRefreshingAvailability(true);
    setAvailabilityMessage("");

    try {
      await loadMessages(activeConversationId);

      setAvailabilityMessage(
        "Image status checked. If processing is complete, the image will appear shortly."
      );
    } catch {
      setAvailabilityMessage(
        "Unable to check image status. Please try again."
      );
    } finally {
      setRefreshingAvailability(false);
    }
  };

  /**
   * LOAD BLURRED PREVIEW
   *
   * This endpoint returns the blurred preview only.
   * It never grants access to the original image.
   */

  useEffect(() => {
    let cancelled = false;

    const controller = new AbortController();

    setPreviewUrl("");
    setPreviewError("");

    if (
      !mediaId ||
      !available ||
      canAccess ||
      !canPurchase
    ) {
      setPreviewLoading(false);

      return () => {
        cancelled = true;
        controller.abort();
      };
    }

    const loadPreview = async () => {
      setPreviewLoading(true);

      try {
        const response = await getMediaPreview(
          mediaId,
          {
            signal: controller.signal,
          }
        );

        const url = response?.data?.preview?.url;

        if (
          response?.success !== true ||
          typeof url !== "string" ||
          !url.trim()
        ) {
          throw new Error(
            "The blurred image preview is unavailable."
          );
        }

        if (!cancelled) {
          setPreviewUrl(url);
          setPreviewError("");
        }
      } catch (requestError) {
        if (
          cancelled ||
          requestError?.code === "ERR_CANCELED" ||
          requestError?.name === "CanceledError"
        ) {
          return;
        }

        if (!cancelled) {
          setPreviewError(
            requestError?.response?.data?.message ||
              requestError?.message ||
              "Unable to load the image preview."
          );
        }
      } finally {
        if (!cancelled) {
          setPreviewLoading(false);
        }
      }
    };

    loadPreview();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    mediaId,
    available,
    canAccess,
    canPurchase,
    previewRetryKey,
  ]);

  /**
   * LOAD AUTHORIZED ORIGINAL IMAGE
   *
   * Original delivery is requested only when
   * backend message authorization says canAccess.
   */

  useEffect(() => {
    let cancelled = false;

    const controller = new AbortController();

    setDeliveryUrl("");
    setError("");

    if (!mediaId || !available || !canAccess) {
      setLoading(false);

      return () => {
        cancelled = true;
        controller.abort();
      };
    }

    const loadAuthorizedMedia = async () => {
      setLoading(true);

      try {
        const response = await getMediaAccess(
          mediaId,
          {
            signal: controller.signal,
          }
        );

        const url = response?.data?.delivery?.url;

        if (
          response?.success !== true ||
          typeof url !== "string" ||
          !url.trim()
        ) {
          throw new Error(
            "The authorized media delivery URL was not returned."
          );
        }

        if (!cancelled) {
          setDeliveryUrl(url);
          setError("");
        }
      } catch (requestError) {
        if (
          cancelled ||
          requestError?.code === "ERR_CANCELED" ||
          requestError?.name === "CanceledError"
        ) {
          return;
        }

        if (!cancelled) {
          setError(
            requestError?.response?.data?.message ||
              requestError?.message ||
              "Unable to load this image."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadAuthorizedMedia();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    mediaId,
    available,
    canAccess,
    retryKey,
  ]);

  const retryDelivery = () => {
    setDeliveryUrl("");
    setError("");

    setRetryKey((previous) => previous + 1);
  };

  const retryPreview = () => {
    setPreviewUrl("");
    setPreviewError("");

    setPreviewRetryKey((previous) => previous + 1);
  };

  const togglePurchase = () => {
    setPurchaseExpanded((previous) => !previous);
  };

  /**
   * UNAVAILABLE / PROCESSING IMAGE
   */

  if (!available) {
    return (
      <div className="flex min-h-32 flex-col items-center justify-center gap-3 rounded-xl border border-white/10 bg-black/20 px-5 py-6 text-center">
        <span className="text-3xl">🖼️</span>

        <p className="text-sm font-semibold text-white">
          {isProcessing
            ? "Image is processing"
            : "Media unavailable"}
        </p>

        <p className="text-xs text-slate-400">
          {isProcessing
            ? "The image is being prepared. Check again shortly."
            : "This media is not currently available for viewing."}
        </p>

        {isProcessing && (
          <button
            type="button"
            onClick={handleCheckAvailability}
            disabled={refreshingAvailability}
            className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-violet-300 hover:bg-white/5 disabled:opacity-50"
          >
            <RefreshCw
              size={13}
              className={
                refreshingAvailability
                  ? "animate-spin"
                  : ""
              }
            />

            {refreshingAvailability
              ? "Checking..."
              : "Check again"}
          </button>
        )}

        {availabilityMessage && (
          <p
            role="status"
            className="text-xs text-slate-400"
          >
            {availabilityMessage}
          </p>
        )}
      </div>
    );
  }

  /**
   * LOCKED IMAGE
   */

  if (!canAccess) {
    return (
      <div className="w-full space-y-3">
        {canPurchase ? (
          <>
            {/* BLURRED IMAGE PREVIEW */}

            <button
              type="button"
              onClick={togglePurchase}
              aria-expanded={purchaseExpanded}
              aria-label="Open image purchase options"
              className="group relative block w-full overflow-hidden rounded-xl border border-amber-400/30 bg-black text-left focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt="Blurred preview of locked premium image"
                  loading="lazy"
                  draggable="false"
                  className="max-h-[240px] min-h-28 max-w-[260px] w-full select-none object-cover blur-[3px] transition duration-300 group-hover:blur-[5px]"
                  onError={() => {
                    setPreviewUrl("");
                    setPreviewError(
                      "Image preview failed to load. Please retry."
                    );
                  }}
                />
              ) : (
                <div className="flex min-h-36 w-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-[#30203d] via-[#171725] to-black px-5">
                  {previewLoading ? (
                    <Loader2
                      size={28}
                      className="animate-spin text-amber-300"
                    />
                  ) : (
                    <Lock
                      size={32}
                      className="text-amber-300"
                    />
                  )}

                  <p className="text-xs text-slate-300">
                    {previewLoading
                      ? "Loading blurred preview..."
                      : "Preview unavailable"}
                  </p>
                </div>
              )}

              {/* LOCK OVERLAY */}

              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/35 px-4 text-center transition group-hover:bg-black/45">
                <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-full border border-white/30 bg-black/50 text-amber-300 backdrop-blur-md">
                  <Lock size={25} />
                </span>

                <span className="text-lg font-bold text-white">
                  {price}
                </span>

                <span className="mt-1 text-xs font-medium text-white/90">
                  Tap to unlock this image
                </span>
              </div>

              {/* PRICE LABEL */}

              <div className="absolute right-3 top-3 rounded-lg border border-amber-300/30 bg-black/75 px-3 py-1.5 text-sm font-bold text-amber-200 backdrop-blur-md">
                {price}
              </div>
            </button>

            {previewError && (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 p-3">
                <p className="text-xs text-slate-400">
                  Preview could not be loaded.
                </p>

                <button
                  type="button"
                  onClick={retryPreview}
                  disabled={previewLoading}
                  className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-violet-300 hover:text-violet-200 disabled:opacity-50"
                >
                  <RefreshCw size={13} />
                  Retry
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={togglePurchase}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-violet-500"
            >
              <Lock size={16} />

              {purchaseExpanded
                ? "Hide purchase options"
                : `Unlock image · ${price}`}
            </button>
          </>
        ) : (
          <div className="flex min-h-32 flex-col items-center justify-center gap-3 rounded-xl border border-white/10 bg-black/20 px-5 py-5 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-300">
              <Lock size={21} />
            </span>

            <div>
              <p className="text-sm font-semibold text-white">
                Locked premium content
              </p>

              <p className="mt-1 text-xs leading-5 text-slate-400">
                You do not currently have access to this image.
              </p>
            </div>
          </div>
        )}

        {/* EXPANDABLE M-PESA PURCHASE PANEL */}

        {canPurchase && mediaId && purchaseExpanded && (
          <MediaPurchaseForm mediaId={mediaId} />
        )}
      </div>
    );
  }

  /**
   * AUTHORIZED IMAGE LOADING
   */

  if (loading) {
    return (
      <div className="flex min-h-36 items-center justify-center rounded-xl border border-white/10 bg-black/20">
        <span className="flex items-center gap-2 text-sm text-slate-300">
          <Loader2
            size={16}
            className="animate-spin"
          />
          Loading authorized image…
        </span>
      </div>
    );
  }

  if (error || !deliveryUrl) {
    return (
      <div className="flex min-h-36 flex-col items-center justify-center gap-3 rounded-xl border border-white/10 bg-black/20 px-5 py-6 text-center">
        <p className="text-sm text-slate-300">
          {error || "Image delivery is unavailable."}
        </p>

        <button
          type="button"
          onClick={retryDelivery}
          className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-violet-500"
        >
          <RefreshCw size={13} />
          Retry
        </button>
      </div>
    );
  }

  /**
   * AUTHORIZED IMAGE
   */

  return (
    <img
      src={deliveryUrl}
      alt="Shared image"
      loading="lazy"
      className="max-h-[260px] max-w-[260px] w-full rounded-xl bg-black/20 object-contain"
      onError={() => {
        setDeliveryUrl("");
        setError("Image delivery failed. Please retry.");
      }}
    />
  );
}

/**
 * ============================================================
 * MESSAGE BUBBLE
 * ============================================================
 */

export default function MessageBubble({
  message,
  isOwnMessage = false,
}) {
  const [expanded, setExpanded] = useState(false);

  if (!message) return null;

  const type =
    typeof message.type === "string"
      ? message.type.toUpperCase()
      : "TEXT";

  // This implementation intentionally supports images only.
  const isMedia = type === "IMAGE";

  const content =
    typeof message.content === "string"
      ? message.content
      : "";

  const maxPreviewLength = 1500;

  const shouldTruncate =
    content.length > maxPreviewLength;

  const displayedContent =
    shouldTruncate && !expanded
      ? `${content.slice(0, maxPreviewLength)}…`
      : content;

  const timestamp = formatMessageTime(message.createdAt);

  return (
    <div
      className={[
        "flex w-full",
        isOwnMessage ? "justify-end" : "justify-start",
      ].join(" ")}
    >
      <div
        className={[
          "max-w-[85%]",
          "sm:max-w-[75%]",
          "lg:max-w-[65%]",
          "rounded-2xl",
          "px-3 py-2",
          "shadow-sm",
          isOwnMessage
            ? [
                "rounded-br-md",
                "bg-gradient-to-br",
                "from-violet-600",
                "to-fuchsia-700",
                "text-white",
              ].join(" ")
            : [
                "rounded-bl-md",
                "border border-white/10",
                "bg-[#1b1b2b]",
                "text-slate-100",
              ].join(" "),
        ].join(" ")}
      >
        {isMedia && (
          <MessageMedia message={message} />
        )}

        {content && (
          <div className={isMedia ? "mt-2" : ""}>
            <p className="whitespace-pre-wrap break-words text-sm leading-6">
              {displayedContent}
            </p>

            {shouldTruncate && (
              <button
                type="button"
                onClick={() =>
                  setExpanded((previous) => !previous)
                }
                className={[
                  "mt-2 text-xs font-semibold",
                  isOwnMessage
                    ? "text-violet-100"
                    : "text-violet-300",
                ].join(" ")}
              >
                {expanded ? "Show less" : "Read more"}
              </button>
            )}
          </div>
        )}

        <div
          className={[
            "mt-2 flex items-center justify-end gap-2",
            "text-[10px]",
            isOwnMessage
              ? "text-violet-100/80"
              : "text-slate-500",
          ].join(" ")}
        >
          {timestamp && (
            <time dateTime={message.createdAt}>
              {timestamp}
            </time>
          )}

          {isOwnMessage && (
            <MessageStatus status={message.status} />
          )}
        </div>
      </div>
    </div>
  );
}
