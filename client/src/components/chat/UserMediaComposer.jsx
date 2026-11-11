
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  AlertCircle,
  CheckCircle2,
  Image,
  Loader2,
  RefreshCw,
  Send,
  Upload,
  X,
} from "lucide-react";

import {
  createMediaUploadIntent,
  uploadMediaFile,
  completeMediaUpload,
} from "../../api/services/paidMediaService.js";

import {
  getMyConversationMedia,
} from "../../api/services/conversationMediaService.js";

import {
  useChatStore,
} from "../../store/useChatStore.js";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const MAX_CAPTION_LENGTH = 5000;

const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

const ATTESTATION_VERSION = "creator-media-v1";

const unwrapResponse = (response) =>
  response?.data?.data ??
  response?.data ??
  response;

const isApprovedMedia = (media) =>
  media?.status === "READY" &&
  media?.moderationStatus === "APPROVED" &&
  media?.visibility !== "UNAVAILABLE" &&
  Boolean(media?.id);

export default function UserMediaComposer({
  conversationId,
  onMessageSent,
  onClose,
}) {
  const [mode, setMode] = useState("upload");

  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");

  const [media, setMedia] = useState([]);
  const [selectedMedia, setSelectedMedia] = useState(null);

  const [caption, setCaption] = useState("");

  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [adultsConsented, setAdultsConsented] = useState(false);

  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);

  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState("");
  const [uploadComplete, setUploadComplete] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const fileInputRef = useRef(null);
  const uploadControllerRef = useRef(null);
  const isMountedRef = useRef(true);

  const sendMediaMessage = useChatStore(
    (state) => state.sendMediaMessage
  );

  const isSendingMessage = useChatStore(
    (state) => state.isSendingMessage
  );

  const isBusy =
    uploading ||
    sending ||
    isSendingMessage;

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      uploadControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!file) {
      setPreviewUrl("");
      return undefined;
    }

    const objectUrl = URL.createObjectURL(file);

    setPreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  const loadMedia = useCallback(async () => {
    if (!conversationId) {
      setError("A conversation is required.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const result = await getMyConversationMedia({
        conversationId,
        page: 1,
        limit: 48,
      });

      if (!isMountedRef.current) return;

      const items = Array.isArray(result?.media)
        ? result.media
        : [];

      const approvedMedia = items.filter(isApprovedMedia);

      setMedia(approvedMedia);

      setSelectedMedia((current) => {
        if (!current) return null;

        return approvedMedia.find(
          (item) => item.id === current.id
        ) || null;
      });
    } catch (err) {
      if (!isMountedRef.current) return;

      setError(
        err.response?.data?.message ||
          err.message ||
          "Unable to load your approved images."
      );
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [conversationId]);

  const handleFileChange = (event) => {
    const selectedFile = event.target.files?.[0];

    setError("");
    setSuccess("");
    setUploadComplete(false);

    if (!selectedFile) {
      setFile(null);
      return;
    }

    if (!ALLOWED_IMAGE_TYPES.includes(selectedFile.type)) {
      setFile(null);
      setError("Only JPEG, PNG, and WebP images are supported.");
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

  const handleUpload = async () => {
    if (uploading || !file) return;

    if (!conversationId) {
      setError("A conversation is required.");
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
      const intentResponse = await createMediaUploadIntent(
        {
          destination: "CONVERSATION",
          conversationId,
          mediaType: "IMAGE",
          mimeType: file.type.toLowerCase(),
          fileSize: file.size,

          // Ordinary users can only upload free media.
          accessPolicy: "PUBLIC",
          priceMinor: 0,
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

      await uploadMediaFile({
        file,
        upload,
        signal: controller.signal,
        onUploadProgress: ({ progress }) => {
          if (isMountedRef.current) {
            setUploadProgress(progress);
          }
        },
      });

      setUploadStage("Verifying uploaded image...");

      await completeMediaUpload(mediaId, {
        signal: controller.signal,
      });

      if (!isMountedRef.current) return;

      setUploadProgress(100);
      setUploadStage("Submitted for moderation.");
      setUploadComplete(true);

      setSuccess(
        "Your image was uploaded. It can be attached after moderation approval."
      );

      setFile(null);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      setRightsConfirmed(false);
      setAdultsConsented(false);
    } catch (err) {
      if (!isMountedRef.current) return;

      if (
        err.name === "AbortError" ||
        err.code === "ERR_CANCELED"
      ) {
        setError(
          "Upload cancelled. An incomplete upload will not be published."
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
      if (isMountedRef.current) {
        setUploading(false);
      }

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

    setSending(true);
    setError("");

    try {
      const message = await sendMediaMessage({
        conversationId,
        mediaId: selectedMedia.id,
        content: caption.trim(),
      });

      if (!message) {
        setError(
          "Unable to attach the image. Please try again."
        );
        return;
      }

      onMessageSent?.(message);
      onClose?.();
    } catch (err) {
      setError(
        err.response?.data?.message ||
          err.message ||
          "Unable to attach the image."
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

    if (nextMode === "library") {
      void loadMedia();
    }
  };

  return (
    <div className="flex w-full min-w-0 max-h-[55dvh] flex-col overflow-hidden rounded-xl border border-white/10 bg-[#111] p-3 text-white sm:p-4">
      {/* HEADER */}

      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold">
            Attach image
          </h3>

          <p className="text-xs text-gray-400">
            Send an ordinary image in this conversation.
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          disabled={isBusy}
          className="shrink-0 rounded-lg p-2 text-gray-400 transition hover:bg-white/10 disabled:opacity-50"
          aria-label="Close image picker"
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
            onClick={() => handleModeChange("library")}
            disabled={isBusy}
            className={`rounded-md px-3 py-2 text-sm font-medium transition ${
              mode === "library"
                ? "bg-amber-400 text-black"
                : "text-gray-400 hover:bg-white/5 hover:text-white"
            }`}
          >
            <span className="inline-flex items-center justify-center gap-2">
              <Image size={15} />
              My uploads
            </span>
          </button>
        </div>

        {/* ERROR */}

        {error && (
          <div
            role="alert"
            className="mb-3 flex items-start gap-2 rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2.5 text-xs leading-5 text-rose-300"
          >
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* SUCCESS */}

        {success && (
          <div
            role="status"
            className="mb-3 flex items-start gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2.5 text-xs leading-5 text-emerald-300"
          >
            <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {/* UPLOAD MODE */}

        {mode === "upload" && (
          <div className="space-y-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileChange}
              disabled={isBusy}
              className="block w-full text-sm text-gray-400 file:mr-3 file:rounded-lg file:border-0 file:bg-amber-400 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-black hover:file:bg-amber-300 disabled:opacity-50"
            />

            <p className="text-[11px] text-gray-500">
              JPEG, PNG, or WebP · Maximum 10 MB. Videos are not supported yet.
            </p>

            {previewUrl && (
              <div className="overflow-hidden rounded-lg border border-white/10 bg-black/40 p-2">
                <img
                  src={previewUrl}
                  alt="Selected image preview"
                  className="mx-auto max-h-64 max-w-full rounded-md object-contain"
                />

                <p className="mt-2 truncate text-xs text-gray-400">
                  {file?.name}
                </p>
              </div>
            )}

            {/* REQUIRED ATTESTATIONS */}

            <label className="flex items-start gap-2 text-xs leading-5 text-gray-300">
              <input
                type="checkbox"
                checked={rightsConfirmed}
                onChange={(event) =>
                  setRightsConfirmed(event.target.checked)
                }
                disabled={isBusy}
                className="mt-1 accent-amber-400"
              />

              I own this image or have permission to share it.
            </label>

            <label className="flex items-start gap-2 text-xs leading-5 text-gray-300">
              <input
                type="checkbox"
                checked={adultsConsented}
                onChange={(event) =>
                  setAdultsConsented(event.target.checked)
                }
                disabled={isBusy}
                className="mt-1 accent-amber-400"
              />

              Everyone depicted is an adult and has consented to this image being shared.
            </label>

            {uploading && (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3 text-xs text-gray-400">
                  <span>{uploadStage}</span>
                  <span>{uploadProgress}%</span>
                </div>

                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-amber-400 transition-all"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>

                <button
                  type="button"
                  onClick={() => uploadControllerRef.current?.abort()}
                  className="text-xs text-rose-400 hover:text-rose-300"
                >
                  Cancel upload
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => void handleUpload()}
              disabled={
                !file ||
                !rightsConfirmed ||
                !adultsConsented ||
                isBusy ||
                uploadComplete
              }
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-400 px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {uploading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload size={16} />
                  Upload free image
                </>
              )}
            </button>

            {uploadComplete && (
              <button
                type="button"
                onClick={() => {
                  setUploadComplete(false);
                  setMode("library");
                  void loadMedia();
                }}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 px-4 py-2.5 text-sm text-gray-300 hover:bg-white/5"
              >
                <RefreshCw size={15} />
                Check approved uploads
              </button>
            )}
          </div>
        )}

        {/* APPROVED USER UPLOADS */}

        {mode === "library" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-gray-400">
                Only approved images can be attached.
              </p>

              <button
                type="button"
                onClick={() => void loadMedia()}
                disabled={loading || isBusy}
                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-amber-400 hover:bg-white/5 disabled:opacity-50"
              >
                <RefreshCw
                  size={13}
                  className={loading ? "animate-spin" : ""}
                />
                Refresh
              </button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-400">
                <Loader2 size={17} className="animate-spin" />
                Loading approved images...
              </div>
            ) : media.length === 0 ? (
              <div className="rounded-lg border border-dashed border-white/10 px-4 py-8 text-center">
                <Image
                  size={25}
                  className="mx-auto mb-2 text-gray-500"
                />

                <p className="text-sm text-gray-300">
                  No approved images yet.
                </p>

                <p className="mt-1 text-xs text-gray-500">
                  Upload an image or wait for moderation approval.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {media.map((item) => {
                  const isSelected =
                    selectedMedia?.id === item.id;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setSelectedMedia(item);
                        setError("");
                      }}
                      disabled={isBusy}
                      aria-pressed={isSelected}
                      className={`overflow-hidden rounded-lg border text-left transition ${
                        isSelected
                          ? "border-amber-400 ring-2 ring-amber-400/30"
                          : "border-white/10 hover:border-white/30"
                      }`}
                    >
                      <div className="flex aspect-square items-center justify-center bg-black/40">
                        {item.imageUrl ? (
                          <img
                            src={item.imageUrl}
                            alt="Your approved upload"
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <Image
                            size={25}
                            className="text-gray-500"
                          />
                        )}
                      </div>

                      <div className="flex items-center justify-between gap-2 px-2 py-2">
                        <span className="truncate text-[11px] text-gray-300">
                          Approved image
                        </span>

                        {isSelected && (
                          <CheckCircle2
                            size={15}
                            className="shrink-0 text-amber-400"
                          />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {selectedMedia && (
              <div className="space-y-3 border-t border-white/10 pt-3">
                <label className="block text-xs text-gray-400">
                  Caption (optional)

                  <textarea
                    value={caption}
                    onChange={(event) =>
                      setCaption(
                        event.target.value.slice(
                          0,
                          MAX_CAPTION_LENGTH
                        )
                      )
                    }
                    maxLength={MAX_CAPTION_LENGTH}
                    rows={2}
                    disabled={isBusy}
                    placeholder="Write a caption..."
                    className="mt-2 w-full resize-y rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-amber-400/50"
                  />
                </label>

                <button
                  type="button"
                  onClick={() => void handleSend()}
                  disabled={isBusy || !selectedMedia}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-400 px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {sending || isSendingMessage ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send size={16} />
                      Send image
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}