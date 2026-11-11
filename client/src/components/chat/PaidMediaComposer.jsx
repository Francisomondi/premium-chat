
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Image,
  Loader2,
  Lock,
  RefreshCw,
  Send,
  Upload,
  X,
  CheckCircle2,
  AlertCircle,
  Ban,
} from "lucide-react";

import {
  getMyCreatorMedia,
} from "../../api/services/creatorMediaManagementService.js";

import {
  createMediaUploadIntent,
  uploadMediaFile,
  completeMediaUpload,
} from "../../api/services/paidMediaService.js";

import {
  useChatStore,
} from "../../store/useChatStore.js";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

const ATTESTATION_VERSION = "creator-media-v1";

const isApprovedMedia = (media) =>
  media?.status === "READY" &&
  media?.moderationStatus === "APPROVED" &&
  media?.visibility !== "UNAVAILABLE" &&
  Boolean(media?.id);

const getMediaId = (media) => String(media?.id || "");

const unwrapResponse = (response) =>
  response?.data?.data ??
  response?.data ??
  response;

const formatKES = (minor) =>
  `KES ${(Number(minor || 0) / 100).toFixed(2)}`;

export default function PaidMediaComposer({
  conversationId,
  onMessageSent,
  onClose,
}) {
  const [mode, setMode] = useState("upload");

  const [media, setMedia] = useState([]);
  const [selectedMedia, setSelectedMedia] = useState(null);
  const [caption, setCaption] = useState("");

  const [file, setFile] = useState(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState("");
  const [accessType, setAccessType] = useState("PAID");
  const [price, setPrice] = useState("100");

  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [adultsConsented, setAdultsConsented] = useState(false);

  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState("");
  const [uploadComplete, setUploadComplete] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const fileInputRef = useRef(null);
  const uploadControllerRef = useRef(null);

  const sendMediaMessage = useChatStore(
    (state) => state.sendMediaMessage
  );

  const isSendingMessage = useChatStore(
    (state) => state.isSendingMessage
  );

  const isBusy = sending || isSendingMessage || uploading;

  const loadMedia = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const result = await getMyCreatorMedia({
        page: 1,
        limit: 48,
      });

      const items = Array.isArray(result?.media)
        ? result.media
        : Array.isArray(result?.data?.media)
          ? result.data.media
          : [];

      const approvedMedia = items.filter(isApprovedMedia);

      setMedia(approvedMedia);

      setSelectedMedia((current) => {
        if (!current) return null;

        const currentId = getMediaId(current);

        return (
          approvedMedia.find(
            (item) => getMediaId(item) === currentId
          ) || null
        );
      });
    } catch (err) {
      setError(
        err.response?.data?.message ||
          err.message ||
          "Unable to load your approved media."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMedia();

    return () => {
      uploadControllerRef.current?.abort();
    };
  }, [loadMedia]);

  useEffect(() => {
  if (!file) {
    setFilePreviewUrl("");
    return;
  }

  const previewUrl = URL.createObjectURL(file);

  setFilePreviewUrl(previewUrl);

  return () => {
    URL.revokeObjectURL(previewUrl);
  };
}, [file]);

  const handleSelectFile = (event) => {
    const selectedFile = event.target.files?.[0];

    setError("");
    setSuccess("");
    setUploadComplete(false);
    setUploadProgress(0);

    if (!selectedFile) return;

    if (!ALLOWED_IMAGE_TYPES.includes(selectedFile.type)) {
      setFile(null);
      setError("Choose a JPEG, PNG, or WebP image.");
      event.target.value = "";
      return;
    }

    if (selectedFile.size <= 0) {
      setFile(null);
      setError("The selected image is empty.");
      event.target.value = "";
      return;
    }

    if (selectedFile.size > MAX_IMAGE_BYTES) {
      setFile(null);
      setError("Images must not exceed 10 MB.");
      event.target.value = "";
      return;
    }

    setFile(selectedFile);
  };

  const handleCancelUpload = () => {
    uploadControllerRef.current?.abort();
  };

  const handleUpload = async () => {
    if (uploading || !file) return;

    if (!conversationId) {
      setError("A conversation is required.");
      return;
    }

    const priceNumber = Number(price);

    if (
      accessType === "PAID" &&
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
        "Please confirm image ownership and adult consent before uploading."
      );
      return;
    }

    const controller = new AbortController();

    uploadControllerRef.current = controller;

    setUploading(true);
    setUploadProgress(0);
    setUploadComplete(false);
    setError("");
    setSuccess("");
    setUploadStage("Preparing secure upload...");

    try {
      const priceMinor =
        accessType === "PAID"
          ? Math.round(priceNumber * 100)
          : 0;

      const intentResponse = await createMediaUploadIntent(
        {
          destination: "CONVERSATION",
          conversationId,
          mediaType: "IMAGE",
          mimeType: file.type.toLowerCase(),
          fileSize: file.size,

          accessPolicy:
            accessType === "PAID"
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

      setUploadStage("Uploading image...");
      setUploadProgress(0);

      await uploadMediaFile({
        file,
        upload,
        signal: controller.signal,
        onUploadProgress: ({ progress }) => {
          setUploadProgress(progress);
        },
      });

      setUploadStage("Verifying uploaded image...");

      await completeMediaUpload(mediaId, {
        signal: controller.signal,
      });

      setUploadProgress(100);
      setUploadStage("Upload submitted for review.");
      setUploadComplete(true);

      setSuccess(
        "Your image was uploaded successfully. It will become available after moderation approval."
      );

      setFile(null);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (err) {
      if (
        err.name === "AbortError" ||
        err.code === "ERR_CANCELED"
      ) {
        setError(
          "Upload cancelled. If the image had already reached storage, its incomplete upload will not be published."
        );
      } else {
        setError(
          err.response?.data?.message ||
            err.message ||
            "Image upload failed. Please try again."
        );
      }

      setUploadStage("");
    } finally {
      setUploading(false);
      uploadControllerRef.current = null;
    }
  };

  const handleSend = async () => {
    if (
      !selectedMedia ||
      sending ||
      isSendingMessage
    ) {
      return;
    }

    if (!conversationId) {
      setError("A conversation is required.");
      return;
    }

    const selectedMediaId = getMediaId(selectedMedia);

    if (!selectedMediaId) {
      setError("The selected media has an invalid ID.");
      return;
    }

    setSending(true);
    setError("");

    try {
      const message = await sendMediaMessage({
        conversationId,
        mediaId: selectedMediaId,
        content: caption.trim(),
      });

      if (!message) {
        setError(
          "Unable to attach media. Please try again."
        );
        return;
      }

      onMessageSent?.(message);
      onClose?.();
    } catch (err) {
      setError(
        err.response?.data?.message ||
          err.message ||
          "Unable to attach media."
      );
    } finally {
      setSending(false);
    }
  };

  const handleModeChange = (nextMode) => {
    if (isBusy) return;

    setMode(nextMode);
    setError("");
    setSuccess("");
  };

  return (
    <div className="flex w-full min-w-0 max-h-[55dvh] flex-col overflow-hidden rounded-xl border border-white/10 bg-[#111] p-3 text-white sm:p-4">

      {/* HEADER */}

      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold">
            Attach media
          </h3>

          <p className="text-xs text-gray-400">
            Upload an image or select approved media.
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          disabled={isBusy}
          className="shrink-0 rounded-lg p-2 text-gray-400 transition hover:bg-white/10 disabled:opacity-50"
          aria-label="Close media picker"
        >
          <X size={18} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">

      {/* MODE SWITCH */}

      <div className="mb-4 grid grid-cols-2 gap-2 rounded-lg bg-black/40 p-1">
        <button
          type="button"
          onClick={() => handleModeChange("upload")}
          disabled={isBusy}
          className={`rounded-md px-3 py-2 text-sm font-medium transition ${
            mode === "upload"
              ? "bg-amber-400 text-black"
              : "text-gray-400 hover:bg-white/5 hover:text-white"
          }`}
        >
          <span className="inline-flex items-center justify-center gap-2">
            <Upload size={15} />
            Upload image
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleModeChange("gallery")}
          disabled={isBusy}
          className={`rounded-md px-3 py-2 text-sm font-medium transition ${
            mode === "gallery"
              ? "bg-amber-400 text-black"
              : "text-gray-400 hover:bg-white/5 hover:text-white"
          }`}
        >
          <span className="inline-flex items-center justify-center gap-2">
            <Image size={15} />
            My gallery
          </span>
        </button>
      </div>

      {/* ERROR */}

      {error && (
        <div
          role="alert"
          className="mb-3 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300"
        >
          <AlertCircle size={17} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* SUCCESS */}

      {success && (
        <div
          role="status"
          className="mb-3 flex items-start gap-2 rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-300"
        >
          <CheckCircle2 size={17} className="mt-0.5 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* DIRECT UPLOAD */}

      {mode === "upload" && (
        <div className="space-y-4">

          <div className="rounded-lg border border-dashed border-white/20 bg-black/30 p-4">
            <label className="mb-2 block text-sm font-medium">
              Choose an image from your device
            </label>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={isBusy}
              onChange={handleSelectFile}
              className="block w-full min-w-0 cursor-pointer text-sm text-gray-300 file:mr-3 file:rounded-lg file:border-0 file:bg-amber-400 file:px-3 file:py-2 file:font-semibold file:text-black hover:file:bg-amber-300 disabled:opacity-50"
            />

            <p className="mt-2 text-xs text-gray-500">
              JPEG, PNG or WebP · Maximum 10 MB
            </p>

          {file && (
            <div className="mt-4 space-y-3 rounded-xl border border-white/10 bg-white/[0.04] p-3">
              {filePreviewUrl && (
                <div className="flex max-h-48 items-center justify-center overflow-hidden rounded-lg bg-black">
                  <img
                    src={filePreviewUrl}
                    alt="Selected image preview"
                    className="max-h-48 w-full object-contain"
                  />
                </div>
              )}

              <div className="flex min-w-0 items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">
                    {file.name}
                  </p>

                  <p className="mt-1 text-xs text-gray-400">
                    {(file.size / (1024 * 1024)).toFixed(2)} MB
                  </p>
                </div>

                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => {
                    setFile(null);
                    setUploadComplete(false);

                    if (fileInputRef.current) {
                      fileInputRef.current.value = "";
                    }
                  }}
                  className="shrink-0 rounded-lg p-2 text-gray-400 hover:bg-white/10 hover:text-white disabled:opacity-50"
                  aria-label="Remove selected image"
                >
                  <X size={17} />
                </button>
              </div>
            </div>
          )}
          </div>

          {/* ACCESS POLICY */}

          <div>
            <label className="mb-2 block text-sm font-medium">
              Image access
            </label>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={isBusy}
                onClick={() => setAccessType("FREE")}
                className={`rounded-lg border p-3 text-left transition ${
                  accessType === "FREE"
                    ? "border-amber-400 bg-amber-400/10"
                    : "border-white/10 bg-white/5"
                }`}
              >
                <span className="block text-sm font-semibold">
                  Free access
                </span>
                <span className="mt-1 block text-xs text-gray-400">
                  No unlock payment
                </span>
              </button>

              <button
                type="button"
                disabled={isBusy}
                onClick={() => setAccessType("PAID")}
                className={`rounded-lg border p-3 text-left transition ${
                  accessType === "PAID"
                    ? "border-amber-400 bg-amber-400/10"
                    : "border-white/10 bg-white/5"
                }`}
              >
                <span className="flex items-center gap-1 text-sm font-semibold">
                  <Lock size={14} />
                  Paid unlock
                </span>
                <span className="mt-1 block text-xs text-gray-400">
                  Buyers pay to view
                </span>
              </button>
            </div>
          </div>

          {accessType === "PAID" && (
            <div>
              <label
                htmlFor="paid-media-price"
                className="mb-2 block text-sm font-medium"
              >
                Unlock price (KES)
              </label>

              <input
                id="paid-media-price"
                type="number"
                min="1"
                step="0.01"
                value={price}
                disabled={isBusy}
                onChange={(event) => setPrice(event.target.value)}
                placeholder="Enter unlock price"
                className="w-full rounded-lg border border-white/10 bg-black px-3 py-3 text-sm text-white outline-none focus:border-amber-400 disabled:opacity-50"
              />

              <p className="mt-1 text-xs text-gray-500">
                This is the amount buyers will see before unlocking the image.
              </p>
            </div>
          )}

          {/* CAPTION */}

          <div>
            <label
              htmlFor="paid-media-caption"
              className="mb-2 block text-sm font-medium"
            >
              Caption (optional)
            </label>

            <textarea
              id="paid-media-caption"
              value={caption}
              onChange={(event) =>
                setCaption(event.target.value.slice(0, 5000))
              }
              maxLength={5000}
              rows={2}
              disabled={isBusy}
              placeholder="Write something about this image..."
              className="w-full resize-none rounded-lg border border-white/10 bg-black p-3 text-sm text-white outline-none focus:border-amber-400 disabled:opacity-50"
            />
          </div>

          {/* REQUIRED ATTESTATIONS */}

          <div className="space-y-3 rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <p className="text-sm font-semibold">
              Upload confirmations
            </p>

            <label className="flex cursor-pointer items-start gap-3 text-xs leading-relaxed text-gray-300">
              <input
                type="checkbox"
                checked={rightsConfirmed}
                disabled={isBusy}
                onChange={(event) =>
                  setRightsConfirmed(event.target.checked)
                }
                className="mt-0.5 h-4 w-4 shrink-0 accent-amber-400"
              />

              <span>
                I own this image or have the necessary rights and permission to upload and share it.
              </span>
            </label>

            <label className="flex cursor-pointer items-start gap-3 text-xs leading-relaxed text-gray-300">
              <input
                type="checkbox"
                checked={adultsConsented}
                disabled={isBusy}
                onChange={(event) =>
                  setAdultsConsented(event.target.checked)
                }
                className="mt-0.5 h-4 w-4 shrink-0 accent-amber-400"
              />

              <span>
                Everyone depicted is an adult and has consented to the image being uploaded and shared.
              </span>
            </label>
          </div>

          {/* UPLOAD PROGRESS */}

          {uploading && (
            <div className="rounded-lg border border-amber-400/20 bg-amber-400/5 p-3">
              <div className="mb-2 flex items-center justify-between gap-3 text-xs">
                <span className="text-gray-300">
                  {uploadStage}
                </span>

                <span className="font-semibold tabular-nums text-amber-400">
                  {uploadProgress}%
                </span>
              </div>

              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-amber-400 transition-all duration-200"
                  style={{
                    width: `${uploadProgress}%`,
                  }}
                />
              </div>

              <button
                type="button"
                onClick={handleCancelUpload}
                className="mt-3 inline-flex items-center gap-2 rounded-lg border border-red-500/30 px-3 py-2 text-xs font-medium text-red-300 hover:bg-red-500/10"
              >
                <Ban size={14} />
                Cancel upload
              </button>
            </div>
          )}

          {uploadComplete && (
            <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-3 text-sm text-green-300">
              <div className="flex items-center gap-2 font-medium">
                <CheckCircle2 size={17} />
                Upload completed
              </div>

              <p className="mt-1 text-xs text-gray-400">
                Your image is awaiting processing and moderation approval. It cannot be attached to a conversation until approved.
              </p>

              <button
                type="button"
                onClick={() => {
                  setUploadComplete(false);
                  setSuccess("");
                  setMode("gallery");
                  loadMedia();
                }}
                className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-amber-400 hover:text-amber-300"
              >
                <RefreshCw size={14} />
                Check approved gallery
              </button>
            </div>
          )}

          {/* UPLOAD BUTTON */}

          {!uploadComplete && (
            <button
              type="button"
              disabled={
                isBusy ||
                !file ||
                !rightsConfirmed ||
                !adultsConsented
              }
              onClick={handleUpload}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-amber-400 px-4 py-3 font-semibold text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {uploading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Upload size={18} />
              )}

              {uploading ? "Uploading image..." : "Upload image"}
            </button>
          )}
        </div>
      )}

      {/* APPROVED GALLERY */}

      {mode === "gallery" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-gray-400">
              Only approved media can be attached.
            </p>

            <button
              type="button"
              onClick={loadMedia}
              disabled={loading || isBusy}
              className="inline-flex shrink-0 items-center gap-1 text-xs text-amber-400 hover:text-amber-300 disabled:opacity-50"
            >
              <RefreshCw
                size={14}
                className={loading ? "animate-spin" : ""}
              />
              Refresh
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-gray-400">
              <Loader2 size={20} className="animate-spin" />
              Loading gallery...
            </div>
          ) : media.length === 0 ? (
            <div className="py-8 text-center">
              <Image
                size={30}
                className="mx-auto mb-3 text-gray-500"
              />

              <p className="text-sm text-gray-300">
                No approved media available.
              </p>

              <p className="mt-1 text-xs text-gray-500">
                Upload an image and wait for moderation approval.
              </p>

              <button
                type="button"
                onClick={() => handleModeChange("upload")}
                className="mt-3 inline-flex items-center gap-2 text-sm text-amber-400 hover:text-amber-300"
              >
                <Upload size={15} />
                Upload an image
              </button>
            </div>
          ) : (
            <>
              <div className="grid max-h-64 grid-cols-2 gap-3 overflow-y-auto p-1 sm:grid-cols-3 lg:grid-cols-4">
                {media.map((item) => {
                  const id = getMediaId(item);

                  const selected =
                    getMediaId(selectedMedia) === id;

                  return (
                    <button
                      key={id}
                      type="button"
                      disabled={isBusy}
                      onClick={() => {
                        setSelectedMedia(item);
                        setError("");
                      }}
                      aria-label={`Select ${item.mediaType || "media"}`}
                      aria-pressed={selected}
                      className={`relative min-w-0 overflow-hidden rounded-lg border-2 transition ${
                        selected
                          ? "border-amber-400"
                          : "border-white/10 hover:border-white/30"
                      } disabled:opacity-60`}
                    >
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt="Creator media"
                          className="aspect-square w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex aspect-square items-center justify-center bg-white/5">
                          <Image
                            size={24}
                            className="text-gray-500"
                          />
                        </div>
                      )}

                      {item.isLocked && (
                        <span className="absolute right-1 top-1 rounded bg-black/70 p-1">
                          <Lock size={12} />
                        </span>
                      )}

                      {selected && (
                        <span className="absolute inset-0 flex items-center justify-center bg-amber-400/20 text-xs font-semibold text-white">
                          Selected
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {selectedMedia && (
                <div className="space-y-3">

                  {/* LARGE SELECTED IMAGE PREVIEW */}

                  <div className="overflow-hidden rounded-xl border border-amber-400/30 bg-black">
                    {selectedMedia.imageUrl ? (
                      <img
                        src={selectedMedia.imageUrl}
                        alt="Selected approved media preview"
                        className="mx-auto max-h-56 w-full object-contain sm:max-h-72"
                      />
                    ) : (
                      <div className="flex h-44 items-center justify-center text-gray-500">
                        <Image size={36} />
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-2 border-t border-white/10 px-3 py-2">
                      <span className="truncate text-xs font-medium text-white">
                        Selected image
                      </span>

                      <span className="shrink-0 rounded-full bg-amber-400/10 px-2 py-1 text-xs font-semibold text-amber-400">
                        Approved
                      </span>
                    </div>
                  </div>

                  {/* IMAGE DETAILS */}

                  <div className="rounded-lg bg-white/5 p-3 text-sm">
                    <p className="font-medium">
                      {selectedMedia.mediaType || "Media"}
                    </p>

                    <p className="mt-1 text-xs text-gray-400">
                      {selectedMedia.isLocked
                        ? "Restricted media — access is controlled by the backend."
                        : "Public media."}
                    </p>

                    {selectedMedia.priceMinor > 0 && (
                      <p className="mt-1 text-sm font-semibold text-amber-400">
                        Unlock price: {formatKES(selectedMedia.priceMinor)}
                      </p>
                    )}
                  </div>

                  {/* CAPTION */}

                  <div>
                    <label className="mb-2 block text-sm font-medium">
                      Caption (optional)
                    </label>

                    <textarea
                      value={caption}
                      onChange={(event) =>
                        setCaption(event.target.value.slice(0, 5000))
                      }
                      maxLength={5000}
                      rows={2}
                      disabled={isBusy}
                      placeholder="Add a caption (optional)..."
                      className="w-full resize-none rounded-lg border border-white/10 bg-black p-3 text-sm text-white outline-none focus:border-amber-400 disabled:opacity-50"
                    />
                  </div>

                  {/* ATTACH BUTTON */}

                  <button
                    type="button"
                    disabled={isBusy || !selectedMedia}
                    onClick={handleSend}
                    className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-amber-400 px-4 py-3 font-semibold text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isBusy ? (
                      <Loader2 size={17} className="animate-spin" />
                    ) : (
                      <Send size={17} />
                    )}

                    {isBusy
                      ? "Attaching..."
                      : "Attach to conversation"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
      </div>
    </div>
  );
}
