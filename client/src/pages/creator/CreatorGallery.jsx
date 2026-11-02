import { useEffect, useRef, useState } from "react";

import {
  ArrowLeft,
  ImagePlus,
  Images,
  Video,
  Upload,
  X,
  CheckCircle2,
  AlertCircle,
  Play,
  LockKeyhole,
  ShieldCheck,
  FileVideo,
  FileImage,
} from "lucide-react";

import { Link } from "react-router-dom";

const MEDIA_FILTERS = [
  {
    label: "All media",
    value: "ALL",
    icon: Images,
  },
  {
    label: "Images",
    value: "IMAGE",
    icon: ImagePlus,
  },
  {
    label: "Videos",
    value: "VIDEO",
    icon: Video,
  },
];

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const MAX_VIDEO_SIZE = 200 * 1024 * 1024;

const formatFileSize = (bytes) => {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 MB";
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export default function CreatorGallery() {
  const fileInputRef = useRef(null);

  const [activeFilter, setActiveFilter] = useState("ALL");
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [error, setError] = useState("");

  /**
   * Revoke temporary browser preview URLs
   * when the selected file changes or the
   * component unmounts.
   */
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const openUploadModal = () => {
    setError("");
    setIsUploadModalOpen(true);
  };

  const closeUploadModal = () => {
    setIsUploadModalOpen(false);
    setSelectedFile(null);
    setCaption("");
    setRightsConfirmed(false);
    setConsentConfirmed(false);
    setError("");

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl("");
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleFileSelection = (event) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setError("");

    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "video/mp4",
      "video/webm",
    ];

    if (!allowedTypes.includes(file.type)) {
      setError(
        "Choose a supported JPEG, PNG, WebP, MP4, or WebM file."
      );

      event.target.value = "";
      return;
    }

    const maximumSize = isImage
      ? MAX_IMAGE_SIZE
      : MAX_VIDEO_SIZE;

    if (file.size > maximumSize) {
      setError(
        isImage
          ? "Images must be 10 MB or smaller."
          : "Videos must be 200 MB or smaller."
      );

      event.target.value = "";
      return;
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleUploadContinue = (event) => {
    event.preventDefault();

    if (!selectedFile) {
      setError("Select an image or video first.");
      return;
    }

    if (!rightsConfirmed || !consentConfirmed) {
      setError(
        "Please confirm the content rights and consent requirements."
      );
      return;
    }

    /**
     * Backend upload integration will be added
     * in a later step.
     */
    setError(
      "Upload is not connected yet. Your file has not been uploaded."
    );
  };

  const isSelectedImage =
    selectedFile?.type.startsWith("image/");

  const emptyStateTitle =
    activeFilter === "VIDEO"
      ? "Your video gallery is waiting"
      : activeFilter === "IMAGE"
        ? "Your image gallery is waiting"
        : "Your gallery is ready for its first upload";

  return (
    <section className="min-h-screen bg-[#09090c] px-4 py-8 text-white sm:px-6 sm:py-10 lg:px-8">
      <div className="mx-auto max-w-7xl">
        {/* PAGE HEADER */}

        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link
              to="/creator/dashboard"
              className="mb-6 inline-flex items-center gap-2 text-sm text-zinc-400 transition hover:text-white"
            >
              <ArrowLeft size={16} />
              Back to dashboard
            </Link>

            <div className="flex items-center gap-3">
              <div className="flex size-12 items-center justify-center rounded-2xl border border-[#ffcc42]/20 bg-[#ffcc42]/10 text-[#ffcc42]">
                <Images size={24} />
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#ffcc42]">
                  Creator workspace
                </p>

                <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
                  Your gallery
                </h1>
              </div>
            </div>

            <p className="mt-4 max-w-2xl text-sm leading-6 text-zinc-400">
              Organize the images and videos you share
              with your audience on PremiumChat.
            </p>
          </div>

          <button
            type="button"
            onClick={openUploadModal}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#ffcc42] px-5 py-3 text-sm font-bold text-black transition hover:bg-[#f5bd22]"
          >
            <Upload size={17} />
            Add media
          </button>
        </div>

        {/* GALLERY STATUS */}

        <div className="mt-8 flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-400">
              <LockKeyhole size={17} />
            </div>

            <div>
              <p className="text-sm font-semibold">
                Private creator workspace
              </p>

              <p className="mt-1 text-xs leading-5 text-zinc-500">
                Media remains private until upload,
                processing, and moderation are connected.
              </p>
            </div>
          </div>

          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-xs text-zinc-400">
            <span className="size-1.5 rounded-full bg-zinc-500" />
            Uploads not connected
          </span>
        </div>

        {/* FILTERS */}

        <div className="mt-8 flex flex-wrap items-center gap-2 border-b border-white/10 pb-5">
          {MEDIA_FILTERS.map(
            ({ label, value, icon: Icon }) => {
              const isActive = activeFilter === value;

              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setActiveFilter(value)}
                  aria-pressed={isActive}
                  className={[
                    "inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium transition",
                    isActive
                      ? "bg-[#ffcc42] text-black"
                      : "border border-white/10 bg-white/[0.03] text-zinc-400 hover:bg-white/[0.07] hover:text-white",
                  ].join(" ")}
                >
                  <Icon size={16} />
                  {label}
                </button>
              );
            }
          )}
        </div>

        {/* EMPTY GALLERY */}

        <div className="relative mt-8 overflow-hidden rounded-3xl border border-dashed border-white/15 bg-white/[0.02] px-5 py-16 text-center sm:px-10">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,204,66,0.06),transparent_60%)]" />

          <div className="relative">
            <div className="mx-auto flex size-20 items-center justify-center rounded-3xl border border-[#ffcc42]/20 bg-[#ffcc42]/10 text-[#ffcc42]">
              {activeFilter === "VIDEO" ? (
                <Video size={34} strokeWidth={1.5} />
              ) : (
                <Images size={34} strokeWidth={1.5} />
              )}
            </div>

            <h2 className="mt-6 text-xl font-bold">
              {emptyStateTitle}
            </h2>

            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-zinc-400">
              Add your first image or video to begin
              building your creator gallery. Media will
              remain private until it passes the
              platform's processing and moderation steps.
            </p>

            <button
              type="button"
              onClick={openUploadModal}
              className="mt-7 inline-flex items-center gap-2 rounded-xl border border-[#ffcc42]/30 bg-[#ffcc42]/10 px-5 py-3 text-sm font-semibold text-[#ffcc42] transition hover:bg-[#ffcc42]/15"
            >
              <ImagePlus size={17} />
              Choose media
            </button>
          </div>
        </div>

        {/* UPLOAD GUIDANCE */}

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <div className="flex size-10 items-center justify-center rounded-xl bg-[#ffcc42]/10 text-[#ffcc42]">
              <FileImage size={20} />
            </div>

            <h3 className="mt-4 text-sm font-semibold">
              Images
            </h3>

            <p className="mt-1 text-xs leading-5 text-zinc-500">
              JPEG, PNG, or WebP
              <br />
              Up to 10 MB
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <div className="flex size-10 items-center justify-center rounded-xl bg-[#ffcc42]/10 text-[#ffcc42]">
              <FileVideo size={20} />
            </div>

            <h3 className="mt-4 text-sm font-semibold">
              Videos
            </h3>

            <p className="mt-1 text-xs leading-5 text-zinc-500">
              MP4 or WebM
              <br />
              Up to 200 MB
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-400">
              <ShieldCheck size={20} />
            </div>

            <h3 className="mt-4 text-sm font-semibold">
              Private by default
            </h3>

            <p className="mt-1 text-xs leading-5 text-zinc-500">
              Uploading media will not make it
              immediately available to viewers.
            </p>
          </div>
        </div>
      </div>

      {/* UPLOAD MODAL */}

      {isUploadModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeUploadModal();
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="upload-media-title"
            className="my-auto w-full max-w-xl rounded-3xl border border-white/10 bg-[#111115] p-5 shadow-2xl sm:p-7"
          >
            {/* MODAL HEADER */}

            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#ffcc42]">
                  Creator gallery
                </p>

                <h2
                  id="upload-media-title"
                  className="mt-2 text-xl font-bold"
                >
                  Add new media
                </h2>

                <p className="mt-2 text-sm leading-5 text-zinc-400">
                  Select an image or video from your device.
                </p>
              </div>

              <button
                type="button"
                onClick={closeUploadModal}
                aria-label="Close upload dialog"
                className="rounded-lg p-2 text-zinc-400 transition hover:bg-white/10 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            <form
              onSubmit={handleUploadContinue}
              className="mt-6 space-y-5"
            >
              {/* FILE PICKER */}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
                onChange={handleFileSelection}
                className="hidden"
              />

              {!selectedFile ? (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex min-h-48 w-full flex-col items-center justify-center rounded-2xl border border-dashed border-white/20 bg-white/[0.02] px-5 text-center transition hover:border-[#ffcc42]/50 hover:bg-[#ffcc42]/[0.04]"
                >
                  <div className="flex size-12 items-center justify-center rounded-xl bg-[#ffcc42]/10 text-[#ffcc42]">
                    <Upload size={22} />
                  </div>

                  <span className="mt-4 text-sm font-semibold">
                    Choose a file
                  </span>

                  <span className="mt-2 text-xs text-zinc-500">
                    Images up to 10 MB · Videos up to 200 MB
                  </span>
                </button>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-white/10 bg-black">
                  <div className="relative flex max-h-72 min-h-40 items-center justify-center overflow-hidden bg-black">
                    {isSelectedImage ? (
                      <img
                        src={previewUrl}
                        alt="Selected media preview"
                        className="max-h-72 max-w-full object-contain"
                      />
                    ) : (
                      <video
                        src={previewUrl}
                        controls
                        className="max-h-72 max-w-full"
                      />
                    )}

                    <span className="absolute left-3 top-3 rounded-full bg-black/70 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
                      {isSelectedImage
                        ? "Image preview"
                        : "Video preview"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-3 p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {selectedFile.name}
                      </p>

                      <p className="mt-1 text-xs text-zinc-500">
                        {formatFileSize(selectedFile.size)}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedFile(null);

                        if (previewUrl) {
                          URL.revokeObjectURL(previewUrl);
                          setPreviewUrl("");
                        }

                        if (fileInputRef.current) {
                          fileInputRef.current.value = "";
                        }
                      }}
                      className="shrink-0 rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-400 transition hover:bg-white/10 hover:text-white"
                    >
                      Change
                    </button>
                  </div>
                </div>
              )}

              {/* CAPTION */}

              <div>
                <label
                  htmlFor="media-caption"
                  className="mb-2 block text-sm font-medium text-zinc-300"
                >
                  Caption
                  <span className="ml-2 text-xs font-normal text-zinc-500">
                    Optional
                  </span>
                </label>

                <textarea
                  id="media-caption"
                  value={caption}
                  onChange={(event) => setCaption(event.target.value)}
                  maxLength={1000}
                  rows={3}
                  placeholder="Write something about this media..."
                  className="w-full resize-y rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-[#ffcc42]/50"
                />

                <p className="mt-1 text-right text-xs text-zinc-600">
                  {caption.length}/1000
                </p>
              </div>

              {/* REQUIRED CONFIRMATIONS */}

              <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={rightsConfirmed}
                    onChange={(event) =>
                      setRightsConfirmed(event.target.checked)
                    }
                    className="mt-1 accent-[#ffcc42]"
                  />

                  <span className="text-xs leading-5 text-zinc-400">
                    I confirm that I own or have the
                    necessary rights to upload and share
                    this content.
                  </span>
                </label>

                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={consentConfirmed}
                    onChange={(event) =>
                      setConsentConfirmed(event.target.checked)
                    }
                    className="mt-1 accent-[#ffcc42]"
                  />

                  <span className="text-xs leading-5 text-zinc-400">
                    I confirm that everyone depicted is
                    an adult and has given consent for
                    this content to be shared.
                  </span>
                </label>
              </div>

              {/* ERROR */}

              {error && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-xs leading-5 text-amber-200"
                >
                  <AlertCircle
                    size={16}
                    className="mt-0.5 shrink-0"
                  />

                  {error}
                </div>
              )}

              {/* ACTIONS */}

              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeUploadModal}
                  className="rounded-xl border border-white/10 px-5 py-3 text-sm font-semibold text-zinc-300 transition hover:bg-white/5"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={
                    !selectedFile ||
                    !rightsConfirmed ||
                    !consentConfirmed
                  }
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#ffcc42] px-5 py-3 text-sm font-bold text-black transition hover:bg-[#f5bd22] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Play size={15} />
                  Continue
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}