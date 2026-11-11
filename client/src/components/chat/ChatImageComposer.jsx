
import { useEffect, useRef, useState } from "react";

import {
  AlertCircle,
  Image as ImageIcon,
  Loader2,
  Send,
  X,
} from "lucide-react";

import {
  createMediaUploadIntent,
  uploadMediaFile,
  completeMediaUpload,
} from "../../api/services/paidMediaService.js";

import { useChatStore } from "../../store/useChatStore.js";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_CAPTION_LENGTH = 5000;
const ATTESTATION_VERSION = "creator-media-v1";

const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

function unwrapResponse(response) {
  return response?.data?.data ?? response?.data ?? response;
}

function generateClientMessageId() {
  if (typeof globalThis.crypto?.randomUUID !== "function") {
    throw new Error(
      "Your browser does not support secure message identification."
    );
  }

  return globalThis.crypto.randomUUID();
}

export default function ChatImageComposer({
  conversationId,
  isCreator = false,
  onMessageSent,
  onClose,
}) {
  const fileInputRef = useRef(null);
  const uploadControllerRef = useRef(null);
  const clientMessageIdRef = useRef(null);

  const sendMediaMessage = useChatStore(
    (state) => state.sendMediaMessage
  );

  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [caption, setCaption] = useState("");

  // Preserve the previous paid-upload default.
  const [creatorPricing, setCreatorPricing] = useState("PAID");
  const [price, setPrice] = useState("100");

  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [adultsConsented, setAdultsConsented] = useState(false);

  const [sending, setSending] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [stage, setStage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!file) {
      setPreviewUrl("");
      return undefined;
    }

    const url = URL.createObjectURL(file);
    setPreviewUrl(url);

    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    return () => uploadControllerRef.current?.abort();
  }, []);

  const isPaidCreatorImage =
    isCreator && creatorPricing === "PAID";

  const priceNumber = Number(price);

  const priceMinor = isPaidCreatorImage
    ? Math.round(priceNumber * 100)
    : 0;

  const validPaidPrice =
    Number.isFinite(priceNumber) &&
    priceNumber > 0 &&
    Number.isSafeInteger(priceMinor) &&
    priceMinor > 0;

  const handleFileChange = (event) => {
    const selectedFile = event.target.files?.[0];

    setError("");

    if (!selectedFile) return;

    if (
      !ALLOWED_IMAGE_TYPES.includes(
        selectedFile.type.toLowerCase()
      )
    ) {
      setError("Choose a JPEG, PNG, or WebP image.");
      event.target.value = "";
      return;
    }

    if (
      selectedFile.size <= 0 ||
      selectedFile.size > MAX_IMAGE_BYTES
    ) {
      setError("Images must be greater than 0 bytes and no larger than 10 MB.");
      event.target.value = "";
      return;
    }

    setFile(selectedFile);
    clientMessageIdRef.current = null;
  };

  const handleRemoveImage = () => {
    if (sending) return;

    setFile(null);
    clientMessageIdRef.current = null;

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSend = async (event) => {
    event.preventDefault();

    if (sending) return;

    if (!conversationId) {
      setError("A conversation is required.");
      return;
    }

    if (!file) {
      setError("Choose an image first.");
      return;
    }

    if (caption.trim().length > MAX_CAPTION_LENGTH) {
      setError("Your caption is too long.");
      return;
    }

    if (isPaidCreatorImage && !validPaidPrice) {
      setError("Enter a valid unlock price greater than zero.");
      return;
    }

    if (!rightsConfirmed || !adultsConsented) {
      setError(
        "Confirm image ownership and consent before sending."
      );
      return;
    }

    const controller = new AbortController();
    uploadControllerRef.current = controller;

    setSending(true);
    setError("");
    setUploadProgress(0);

    let currentStage = "Preparing secure upload...";

    try {
      const selectedAccessPolicy =
        isCreator && isPaidCreatorImage
          ? "PURCHASE_ONLY"
          : "PUBLIC";

      const selectedPriceMinor =
        isCreator && isPaidCreatorImage
          ? priceMinor
          : 0;

      setStage(currentStage);

      // 1. Request a private conversation-media upload intent.
      const intentResponse = await createMediaUploadIntent(
        {
          destination: "CONVERSATION",
          conversationId,
          mediaType: "IMAGE",
          mimeType: file.type.toLowerCase(),
          fileSize: file.size,

          // Creator: PUBLIC or PURCHASE_ONLY.
          // User: always PUBLIC.
          accessPolicy: selectedAccessPolicy,
          priceMinor: selectedPriceMinor,
          currency: "KES",

          rightsConfirmed: true,
          allDepictedAdultsAndConsented: true,
          attestationVersion: ATTESTATION_VERSION,
        },
        {
          signal: controller.signal,
        }
      );

      const intent = unwrapResponse(intentResponse);

      const mediaId = intent?.media?.id;
      const upload = intent?.upload;

      if (
        !mediaId ||
        !upload?.url ||
        upload.method !== "PUT"
      ) {
        throw new Error(
          "The server returned an invalid upload response."
        );
      }

      // 2. Upload directly to private R2 storage.
      currentStage = "Uploading image...";
      setStage(currentStage);

      await uploadMediaFile({
        file,
        upload,
        signal: controller.signal,
        onUploadProgress: ({ progress }) => {
          setUploadProgress(progress);
        },
      });

      // 3. Verify and complete the upload.
      // Conversation images bypass the gallery processing queue.
      // Paid creator images receive their blurred preview here.
      currentStage = "Verifying image upload...";
      setStage(currentStage);

      await completeMediaUpload(mediaId, {
        signal: controller.signal,
      });

      // 4. Send the image message.
      currentStage = "Sending image message...";
      setStage(currentStage);

      // Keep the same ID when retrying message submission.
      // This protects against duplicate messages if a previous
      // message request succeeded but its response was lost.
      if (!clientMessageIdRef.current) {
        clientMessageIdRef.current =
          generateClientMessageId();
      }

      const message = await sendMediaMessage({
        conversationId,
        mediaId,
        clientMessageId: clientMessageIdRef.current,
        content: caption.trim(),
      });

      if (!message) {
        throw new Error(
          "The image uploaded, but the chat message could not be sent. Please try again."
        );
      }

      clientMessageIdRef.current = null;

      onMessageSent?.(message);
      onClose?.();
    } catch (err) {
      console.error(
        "[ChatImageComposer] Image send failed:",
        {
          stage: currentStage,
          message: err?.message,
          status: err?.response?.status,
          response: err?.response?.data,
          code: err?.code,
          error: err,
        }
      );

      if (
        err?.name === "AbortError" ||
        err?.code === "ERR_CANCELED"
      ) {
        setError("Image sending was cancelled.");
      } else {
        const reason =
          err?.response?.data?.message ||
          err?.message ||
          "Unknown error";

        setError(`${currentStage}: ${reason}`);
      }
    } finally {
      uploadControllerRef.current = null;
      setSending(false);
      setStage("");
    }
  };

  const handleCancel = () => {
    if (sending) {
      uploadControllerRef.current?.abort();
      return;
    }

    onClose?.();
  };

  const canSubmit =
    Boolean(file) &&
    Boolean(conversationId) &&
    !sending &&
    rightsConfirmed &&
    adultsConsented &&
    (!isPaidCreatorImage || validPaidPrice);

  return (
    <form
      onSubmit={handleSend}
      className="w-full min-w-0 space-y-2 rounded-xl border border-white/10 bg-[#1a1a20] p-2"
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileChange}
        disabled={sending}
        className="hidden"
      />

      {/* IMAGE + CAPTION + SINGLE SEND BUTTON */}

      <div className="flex min-w-0 items-center gap-2">
        {previewUrl ? (
          <div className="relative h-12 w-12 shrink-0">
            <img
              src={previewUrl}
              alt="Selected image"
              className="h-12 w-12 rounded-lg border border-white/10 object-cover"
            />

            {!sending && (
              <button
                type="button"
                onClick={handleRemoveImage}
                aria-label="Remove image"
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black text-white"
              >
                <X size={12} />
              </button>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={sending}
            aria-label="Choose image"
            title="Choose image"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-dashed border-white/20 text-[#ffcc42] hover:bg-white/5 disabled:opacity-40"
          >
            <ImageIcon size={18} />
          </button>
        )}

        <input
          type="text"
          value={caption}
          onChange={(event) => setCaption(event.target.value)}
          maxLength={MAX_CAPTION_LENGTH}
          disabled={sending}
          placeholder="Write a caption..."
          aria-label="Image caption"
          className="h-10 min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-3 text-xs text-white outline-none placeholder:text-zinc-500 focus:border-[#ffcc42]/50 disabled:opacity-50"
        />

        <button
          type="submit"
          disabled={!canSubmit}
          aria-label="Send image"
          title="Send image"
          className="flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-[#ffcc42] px-3 text-xs font-bold text-black hover:bg-[#f2bd2e] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {sending ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <Send size={15} />
          )}

          <span className="hidden sm:inline">
            {sending ? "Sending" : "Send"}
          </span>
        </button>

        <button
          type="button"
          onClick={handleCancel}
          aria-label="Close image composer"
          title="Close"
          className="flex h-9 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-400 hover:bg-white/5 hover:text-white"
        >
          <X size={16} />
        </button>
      </div>

      {/* CREATOR FREE / PAID SELECTION */}

      {isCreator && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-[10px] text-zinc-400">
              Image access
            </span>

            <div className="flex flex-1 gap-1">
              <button
                type="button"
                onClick={() => setCreatorPricing("FREE")}
                disabled={sending}
                aria-pressed={creatorPricing === "FREE"}
                className={`flex-1 rounded-md border px-2 py-1.5 text-[10px] font-semibold transition ${
                  creatorPricing === "FREE"
                    ? "border-[#ffcc42] bg-[#ffcc42]/10 text-[#ffcc42]"
                    : "border-white/10 text-zinc-400 hover:bg-white/5"
                }`}
              >
                Free
              </button>

              <button
                type="button"
                onClick={() => setCreatorPricing("PAID")}
                disabled={sending}
                aria-pressed={creatorPricing === "PAID"}
                className={`flex-1 rounded-md border px-2 py-1.5 text-[10px] font-semibold transition ${
                  creatorPricing === "PAID"
                    ? "border-[#ffcc42] bg-[#ffcc42]/10 text-[#ffcc42]"
                    : "border-white/10 text-zinc-400 hover:bg-white/5"
                }`}
              >
                Paid
              </button>
            </div>
          </div>

          {isPaidCreatorImage && (
            <div className="flex min-w-0 items-center gap-2">
              <label
                htmlFor="chat-image-price"
                className="shrink-0 text-[10px] text-zinc-400"
              >
                Unlock price (KES)
              </label>

              <input
                id="chat-image-price"
                type="number"
                min="0.01"
                step="0.01"
                value={price}
                onChange={(event) =>
                  setPrice(event.target.value)
                }
                disabled={sending}
                placeholder="100"
                className="h-8 min-w-0 flex-1 rounded-md border border-white/10 bg-black/30 px-2 text-xs text-white outline-none focus:border-[#ffcc42]/50"
              />
            </div>
          )}

          <p className="text-[9px] text-zinc-500">
            {isPaidCreatorImage
              ? "The recipient sees a blurred preview. The original unlocks only after verified M-Pesa payment."
              : "Both eligible participants can view this image immediately."}
          </p>
        </div>
      )}

      {/* REQUIRED IMAGE CONFIRMATIONS */}

      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <label className="flex min-w-0 items-center gap-1.5 text-[10px] text-zinc-400">
          <input
            type="checkbox"
            checked={rightsConfirmed}
            onChange={(event) =>
              setRightsConfirmed(event.target.checked)
            }
            disabled={sending}
            className="shrink-0 accent-[#ffcc42]"
          />
          I have the rights to share this image.
        </label>

        <label className="flex min-w-0 items-center gap-1.5 text-[10px] text-zinc-400">
          <input
            type="checkbox"
            checked={adultsConsented}
            onChange={(event) =>
              setAdultsConsented(event.target.checked)
            }
            disabled={sending}
            className="shrink-0 accent-[#ffcc42]"
          />
          Everyone depicted is an adult and has consented.
        </label>
      </div>

      {/* UPLOAD PROGRESS */}

      {sending && (
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-[10px] text-zinc-300">
            <Loader2
              size={12}
              className="animate-spin text-[#ffcc42]"
            />

            <span>{stage}</span>

            <span className="ml-auto tabular-nums">
              {uploadProgress}%
            </span>
          </div>

          <div className="h-1 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-[#ffcc42] transition-all"
              style={{
                width: `${uploadProgress}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* ERROR */}

      {error && (
        <div
          role="alert"
          className="flex min-w-0 items-start gap-1.5 rounded-md bg-red-500/10 px-2 py-1.5 text-[10px] text-red-300"
        >
          <AlertCircle
            size={12}
            className="mt-0.5 shrink-0"
          />

          <span className="break-words">{error}</span>
        </div>
      )}

      {!file && (
        <p className="text-[9px] text-zinc-600">
          JPEG, PNG or WebP · Maximum 10 MB
        </p>
      )}
    </form>
  );
}
