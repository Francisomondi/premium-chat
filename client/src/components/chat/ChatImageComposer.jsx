
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
  if (typeof crypto?.randomUUID !== "function") {
    throw new Error(
      "Your browser does not support secure message identification."
    );
  }

  return crypto.randomUUID();
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

  const handleFileChange = (event) => {
    const selectedFile = event.target.files?.[0];

    setError("");

    if (!selectedFile) return;

    if (!ALLOWED_IMAGE_TYPES.includes(selectedFile.type.toLowerCase())) {
      setError("Choose a JPEG, PNG, or WebP image.");
      event.target.value = "";
      return;
    }

    if (selectedFile.size > MAX_IMAGE_BYTES) {
      setError("Images must be 10 MB or smaller.");
      event.target.value = "";
      return;
    }

    setFile(selectedFile);
    clientMessageIdRef.current = null;
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

    const priceNumber = Number(price);

    if (
      isCreator &&
      (
        !Number.isFinite(priceNumber) ||
        priceNumber <= 0 ||
        !Number.isSafeInteger(Math.round(priceNumber * 100))
      )
    ) {
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

    try {
      const priceMinor = isCreator
        ? Math.round(priceNumber * 100)
        : 0;

      setStage("Preparing secure upload...");

      const intentResponse = await createMediaUploadIntent(
        {
          destination: "CONVERSATION",
          conversationId,
          mediaType: "IMAGE",
          mimeType: file.type.toLowerCase(),
          fileSize: file.size,
          accessPolicy: isCreator
            ? "PURCHASE_ONLY"
            : "PUBLIC",
          priceMinor,
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

      if (!mediaId || !upload?.url || upload.method !== "PUT") {
        throw new Error(
          "The server returned an invalid upload response."
        );
      }

      setStage("Uploading image...");

      await uploadMediaFile({
        file,
        upload,
        signal: controller.signal,
        onUploadProgress: ({ progress }) => {
          setUploadProgress(progress);
        },
      });

      setStage("Verifying image upload...");

      await completeMediaUpload(mediaId, {
        signal: controller.signal,
      });

      setStage("Sending image message...");

      // Reuse the same ID if the message request needs retrying.
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
          stage,
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

        setError(
          `${stage || "Image sending"}: ${reason}`
        );
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

  return (
    <form
      onSubmit={handleSend}
      className="space-y-4 rounded-xl border border-white/10 bg-[#1a1a20] p-4"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <ImageIcon size={18} className="text-[#ffcc42]" />
          Send image
        </div>

        <button
          type="button"
          onClick={handleCancel}
          disabled={sending}
          className="rounded-lg p-1 text-zinc-400 hover:bg-white/5 hover:text-white disabled:opacity-40"
          aria-label="Close image composer"
        >
          <X size={18} />
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileChange}
        disabled={sending}
        className="hidden"
      />

      {previewUrl ? (
        <div className="relative overflow-hidden rounded-lg border border-white/10">
          <img
            src={previewUrl}
            alt="Selected image preview"
            className="max-h-72 w-full object-contain"
          />

          {!sending && (
            <button
              type="button"
              onClick={() => {
                setFile(null);
                clientMessageIdRef.current = null;

                if (fileInputRef.current) {
                  fileInputRef.current.value = "";
                }
              }}
              className="absolute right-2 top-2 rounded-full bg-black/70 p-2 text-white hover:bg-black"
              aria-label="Remove selected image"
            >
              <X size={16} />
            </button>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={sending}
          className="flex min-h-32 w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-white/20 bg-black/20 text-sm text-zinc-400 hover:border-[#ffcc42]/50 hover:text-white disabled:opacity-40"
        >
          <ImageIcon size={28} className="text-[#ffcc42]" />
          <span>Select an image</span>
          <span className="text-xs">
            JPEG, PNG or WebP · Maximum 10 MB
          </span>
        </button>
      )}

      {file && !sending && (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="text-xs text-[#ffcc42] hover:underline"
        >
          Choose a different image
        </button>
      )}

      {isCreator && (
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-300">
            Unlock price (KES)
          </label>

          <input
            type="number"
            min="1"
            step="0.01"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            disabled={sending}
            className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-[#ffcc42]/50"
            placeholder="Enter unlock price"
          />

          <p className="mt-1 text-xs text-zinc-500">
            The recipient must complete verified payment to unlock this image.
          </p>
        </div>
      )}

      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-300">
          Caption (optional)
        </label>

        <textarea
          value={caption}
          onChange={(event) => setCaption(event.target.value)}
          maxLength={MAX_CAPTION_LENGTH}
          rows={2}
          disabled={sending}
          placeholder="Write a message about this image..."
          className="w-full resize-none rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-[#ffcc42]/50"
        />
      </div>

      <div className="space-y-2 rounded-lg bg-black/20 p-3">
        <label className="flex items-start gap-2 text-xs text-zinc-300">
          <input
            type="checkbox"
            checked={rightsConfirmed}
            onChange={(event) =>
              setRightsConfirmed(event.target.checked)
            }
            disabled={sending}
            className="mt-0.5 accent-[#ffcc42]"
          />
          I confirm that I have the rights to share this image.
        </label>

        <label className="flex items-start gap-2 text-xs text-zinc-300">
          <input
            type="checkbox"
            checked={adultsConsented}
            onChange={(event) =>
              setAdultsConsented(event.target.checked)
            }
            disabled={sending}
            className="mt-0.5 accent-[#ffcc42]"
          />
          I confirm that everyone depicted is an adult and has consented.
        </label>
      </div>

      {sending && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-zinc-300">
            <Loader2 size={14} className="animate-spin text-[#ffcc42]" />
            {stage}
          </div>

          <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-[#ffcc42] transition-all"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-300">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={sending || !file}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#ffcc42] px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-[#f2bd2e] disabled:cursor-not-allowed disabled:opacity-40"
      >
        {sending ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Sending image...
          </>
        ) : (
          <>
            <Send size={16} />
            Send image
          </>
        )}
      </button>
    </form>
  );
}
