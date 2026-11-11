
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
  LockKeyhole,
  ShieldCheck,
  FileVideo,
  FileImage,
} from "lucide-react";

import { Link } from "react-router-dom";

import {
  createMediaUploadIntent,
  uploadMediaFile,
  completeMediaUpload,
} from "../../api/services/paidMediaService.js";

import {
  getMyCreatorMedia,
} from "../../api/services/creatorMediaManagementService.js";

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

const PURCHASE_POLICIES = [
  "PURCHASE_ONLY",
  "SUBSCRIPTION_OR_PURCHASE",
];

const FREE_POLICIES = [
  "PUBLIC",
  "SUBSCRIBERS_ONLY",
];

const formatFileSize = (bytes) => {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 MB";
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatMediaPrice = (item) => {
  if (!item.priceMinor || item.priceMinor <= 0) {
    return null;
  }

  try {
    return new Intl.NumberFormat("en-KE", {
      style: "currency",
      currency: item.currency || "KES",
    }).format(item.priceMinor / 100);
  } catch {
    return `${item.currency || "KES"} ${(item.priceMinor / 100).toFixed(2)}`;
  }
};

const getMediaStatusLabel = (item) => {
  switch (item.visibility) {
    case "PUBLIC":
      return "Public";

    case "LOCKED":
      return "Approved · Locked";

    case "PENDING":
      return "Unavailable";

    case "REJECTED":
      return "Rejected";

    case "PROCESSING":
      return "Processing";

    case "UPLOADING":
      return "Uploading";

    case "FAILED":
      return "Processing failed";

    default:
      return "Unavailable";
  }
};

const getMediaStatusClass = (item) => {
  switch (item.visibility) {
    case "PUBLIC":
      return "border-emerald-400/20 bg-emerald-400/10 text-emerald-300";

    case "LOCKED":
      return "border-[#ffcc42]/20 bg-[#ffcc42]/10 text-[#ffcc42]";

    case "PENDING":
      return "border-blue-400/20 bg-blue-400/10 text-blue-300";

    case "REJECTED":
    case "FAILED":
      return "border-red-400/20 bg-red-400/10 text-red-300";

    default:
      return "border-white/10 bg-white/5 text-zinc-400";
  }
};

export default function CreatorGallery() {
  const fileInputRef = useRef(null);

  const [activeFilter, setActiveFilter] = useState("ALL");

  const [galleryItems, setGalleryItems] = useState([]);
  const [galleryLoading, setGalleryLoading] = useState(true);
  const [galleryError, setGalleryError] = useState("");
  const [galleryPage, setGalleryPage] = useState(1);

  const [galleryPagination, setGalleryPagination] = useState({
    page: 1,
    limit: 12,
    total: 0,
    totalPages: 0,
    hasNextPage: false,
    hasPreviousPage: false,
  });

  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [caption, setCaption] = useState("");

  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [consentConfirmed, setConsentConfirmed] = useState(false);

  const [accessPolicy, setAccessPolicy] = useState("");
  const [priceAmount, setPriceAmount] = useState("");
  const [currency, setCurrency] = useState("KES");

  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  /**
   * ============================================================
   * LOAD CREATOR GALLERY
   * ============================================================
   */

  const fetchGallery = async ({
    page = galleryPage,
    signal,
    showLoading = true,
  } = {}) => {
    try {
      if (showLoading) {
        setGalleryLoading(true);
      }

      setGalleryError("");

      const result = await getMyCreatorMedia({
        page,
        limit: 12,
        signal,
      });

      if (signal?.aborted) {
        return false;
      }

      setGalleryItems(result?.media || []);

      setGalleryPagination(
        result?.pagination || {
          page,
          limit: 12,
          total: 0,
          totalPages: 0,
          hasNextPage: false,
          hasPreviousPage: false,
        }
      );

      return true;
    } catch (fetchError) {
      if (signal?.aborted) {
        return false;
      }

      console.error(
        "Creator gallery loading error:",
        fetchError
      );

      setGalleryError(
        fetchError?.response?.data?.message ||
          fetchError?.message ||
          "Unable to load your gallery."
      );

      return false;
    } finally {
      if (!signal?.aborted) {
        setGalleryLoading(false);
      }
    }
  };

  /**
   * Automatically load the current gallery page.
   */

  useEffect(() => {
    const controller = new AbortController();

    fetchGallery({
      page: galleryPage,
      signal: controller.signal,
    });

    return () => {
      controller.abort();
    };
  }, [galleryPage]);

  /**
   * ============================================================
   * TEMPORARY UPLOAD PREVIEW CLEANUP
   * ============================================================
   */

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  /**
   * ============================================================
   * FILTERED GALLERY
   * ============================================================
   */

  const filteredGalleryItems = galleryItems.filter(
    (item) => {
      if (activeFilter === "ALL") {
        return true;
      }

      return item.mediaType === activeFilter;
    }
  );

  /**
   * ============================================================
   * UPLOAD MODAL
   * ============================================================
   */

  const openUploadModal = () => {
    setError("");
    setSuccessMessage("");
    setIsUploadModalOpen(true);
  };

  const closeUploadModal = (force = false) => {
    if (isUploading && !force) {
      return;
    }

    setIsUploadModalOpen(false);
    setSelectedFile(null);
    setCaption("");
    setRightsConfirmed(false);
    setConsentConfirmed(false);
    setAccessPolicy("");
    setPriceAmount("");
    setCurrency("KES");
    setError("");
    setUploadProgress(0);

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl("");
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  /**
   * ============================================================
   * FILE SELECTION
   * ============================================================
   */

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

  /**
   * ============================================================
   * UPLOAD WORKFLOW
   * ============================================================
   */

  const handleUploadContinue = async (event) => {
    event.preventDefault();

    if (isUploading) {
      return;
    }

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

    if (
      !PURCHASE_POLICIES.includes(accessPolicy) &&
      !FREE_POLICIES.includes(accessPolicy)
    ) {
      setError("Choose an access policy for this media.");
      return;
    }

    let priceMinor = 0;

    if (PURCHASE_POLICIES.includes(accessPolicy)) {
      const normalizedPrice = priceAmount.trim();

      if (!/^\d+(\.\d{1,2})?$/.test(normalizedPrice)) {
        setError(
          "Enter a valid price with no more than two decimal places."
        );
        return;
      }

      const parsedPrice = Number(normalizedPrice);

      if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
        setError(
          "Purchase media must have a price greater than zero."
        );
        return;
      }

      priceMinor = Math.round(parsedPrice * 100);

      if (!Number.isSafeInteger(priceMinor) || priceMinor <= 0) {
        setError("Enter a valid media price.");
        return;
      }
    }

    let fileUploadedToStorage = false;

    try {
      setError("");
      setSuccessMessage("");
      setIsUploading(true);
      setUploadProgress(0);

      const mediaType = selectedFile.type.startsWith("image/")
        ? "IMAGE"
        : "VIDEO";

      // 1. Request permission and a temporary private upload URL.

      const intentResponse = await createMediaUploadIntent({
        destination: "GALLERY",
        mediaType,
        mimeType: selectedFile.type,
        fileSize: selectedFile.size,
        accessPolicy,
        priceMinor,
        currency,
        rightsConfirmed: true,
        allDepictedAdultsAndConsented: true,
        attestationVersion: "1",
      });

      if (
        !intentResponse?.success ||
        !intentResponse?.data?.media?.id ||
        !intentResponse?.data?.upload?.url
      ) {
        throw new Error(
          "The server did not return a valid upload authorization."
        );
      }

      const { media, upload } = intentResponse.data;

      // 2. Upload directly to private object storage.

      const storageResult = await uploadMediaFile({
        file: selectedFile,
        upload,
        onUploadProgress: (progressEvent) => {
          if (!progressEvent.total) {
            return;
          }

          const percentage = Math.round(
            (progressEvent.loaded / progressEvent.total) * 100
          );

          setUploadProgress(
            Math.min(100, Math.max(0, percentage))
          );
        },
      });

      if (!storageResult?.success) {
        throw new Error(
          "The file upload could not be confirmed."
        );
      }

      fileUploadedToStorage = true;

      // 3. Ask the backend to verify the uploaded object.

      const completionResponse = await completeMediaUpload(media.id);

      if (
        !completionResponse?.success ||
        !completionResponse?.data?.mediaId
      ) {
        throw new Error(
          "The file was uploaded, but server verification was not confirmed."
        );
      }

      setUploadProgress(100);

      // Close and clean up the upload modal.

      closeUploadModal(true);

      setSuccessMessage(
        "Your media was uploaded successfully and is awaiting processing and moderation. It is not publicly available yet."
      );

      // Refresh the gallery independently.
      // A refresh failure must not invalidate a successful upload.

      const refreshed = await fetchGallery({
        page: 1,
        showLoading: false,
      });

      if (galleryPage !== 1) {
        setGalleryPage(1);
      }

      if (!refreshed) {
        setGalleryError(
          "Upload successful. Your gallery could not refresh automatically. Use Refresh gallery to try again."
        );
      }
    } catch (uploadError) {
      console.error(
        "Creator media upload error:",
        uploadError
      );

      if (fileUploadedToStorage) {
        setError(
          "Your file reached storage, but final server verification did not complete. Do not upload it again yet. Please check the media status before retrying."
        );
      } else {
        setError(
          uploadError?.response?.data?.message ||
            uploadError?.message ||
            "Unable to upload your media. Please try again."
        );
      }
    } finally {
      setIsUploading(false);
    }
  };

  const isSelectedImage =
    selectedFile?.type.startsWith("image/");

  const emptyStateTitle =
    activeFilter === "VIDEO"
      ? "Your video gallery is waiting"
      : activeFilter === "IMAGE"
        ? "Your image gallery is waiting"
        : "Your gallery is ready for its first upload";

  /**
   * ============================================================
   * RENDER
   * ============================================================
   */

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
                processing, and moderation are completed.
              </p>
            </div>
          </div>

          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-xs text-zinc-400">
            <span className="size-1.5 rounded-full bg-zinc-500" />
            Private uploads
          </span>
        </div>

        {/* SUCCESS MESSAGE */}

        {successMessage && (
          <div
            role="status"
            className="mt-5 flex items-start gap-3 rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-4"
          >
            <CheckCircle2
              size={19}
              className="mt-0.5 shrink-0 text-emerald-400"
            />

            <p className="text-sm leading-6 text-emerald-200">
              {successMessage}
            </p>
          </div>
        )}

        {/* GALLERY ERROR */}

        {galleryError && (
          <div
            role="alert"
            className="mt-5 flex items-start justify-between gap-3 rounded-xl border border-amber-400/20 bg-amber-400/5 p-4"
          >
            <div className="flex items-start gap-2">
              <AlertCircle
                size={17}
                className="mt-0.5 shrink-0 text-amber-300"
              />

              <p className="text-sm leading-5 text-amber-200">
                {galleryError}
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                fetchGallery({
                  page: galleryPage,
                })
              }
              className="shrink-0 text-xs font-semibold text-[#ffcc42] hover:underline"
            >
              Retry
            </button>
          </div>
        )}

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

        {/* CREATOR MEDIA GALLERY */}

        <div className="mt-8">
          {galleryLoading ? (
            <div className="flex min-h-64 flex-col items-center justify-center rounded-3xl border border-white/10 bg-white/[0.02]">
              <div className="size-9 animate-spin rounded-full border-2 border-white/10 border-t-[#ffcc42]" />

              <p className="mt-4 text-sm text-zinc-400">
                Loading your gallery...
              </p>
            </div>
          ) : galleryError && galleryItems.length === 0 ? (
            <div
              role="alert"
              className="rounded-3xl border border-red-400/20 bg-red-400/5 px-5 py-12 text-center"
            >
              <AlertCircle
                size={32}
                className="mx-auto text-red-400"
              />

              <h2 className="mt-4 text-lg font-bold">
                Unable to load your gallery
              </h2>

              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-400">
                {galleryError}
              </p>

              <button
                type="button"
                onClick={() =>
                  fetchGallery({
                    page: galleryPage,
                  })
                }
                className="mt-6 rounded-xl bg-[#ffcc42] px-5 py-3 text-sm font-bold text-black transition hover:bg-[#f5bd22]"
              >
                Try again
              </button>
            </div>
          ) : filteredGalleryItems.length === 0 ? (
            <div className="relative overflow-hidden rounded-3xl border border-dashed border-white/15 bg-white/[0.02] px-5 py-16 text-center sm:px-10">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,204,66,0.06),transparent_60%)]" />

              <div className="relative">
                <div className="mx-auto flex size-20 items-center justify-center rounded-3xl border border-[#ffcc42]/20 bg-[#ffcc42]/10 text-[#ffcc42]">
                  {activeFilter === "VIDEO" ? (
                    <Video size={34} strokeWidth={1.5} />
                  ) : activeFilter === "IMAGE" ? (
                    <ImagePlus size={34} strokeWidth={1.5} />
                  ) : (
                    <Images size={34} strokeWidth={1.5} />
                  )}
                </div>

                <h2 className="mt-6 text-xl font-bold">
                  {galleryItems.length === 0
                    ? emptyStateTitle
                    : activeFilter === "IMAGE"
                      ? "No images found"
                      : activeFilter === "VIDEO"
                        ? "No videos found"
                        : "Your gallery is empty"}
                </h2>

                <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-zinc-400">
                  {galleryItems.length === 0
                    ? "Add your first image or video to begin building your creator gallery. Media will remain private until it passes the platform's processing and moderation steps."
                    : "There are no media items matching this filter. Try another category."}
                </p>

                {galleryItems.length === 0 && (
                  <button
                    type="button"
                    onClick={openUploadModal}
                    className="mt-7 inline-flex items-center gap-2 rounded-xl border border-[#ffcc42]/30 bg-[#ffcc42]/10 px-5 py-3 text-sm font-semibold text-[#ffcc42] transition hover:bg-[#ffcc42]/15"
                  >
                    <ImagePlus size={17} />
                    Choose media
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* GALLERY SUMMARY */}

              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-zinc-400">
                  {galleryPagination.total} media item
                  {galleryPagination.total === 1 ? "" : "s"}
                </p>

                <button
                  type="button"
                  onClick={() =>
                    fetchGallery({
                      page: galleryPage,
                    })
                  }
                  className="rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-zinc-400 transition hover:bg-white/5 hover:text-white"
                >
                  Refresh gallery
                </button>
              </div>

              {/* MEDIA CARDS */}

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filteredGalleryItems.map((item) => {
                  const price = formatMediaPrice(item);

                  return (
                    <article
                      key={item.id}
                      className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] transition hover:border-white/20"
                    >
                      {/* MEDIA PREVIEW */}

                      <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-black/60">
                        {item.mediaType === "IMAGE" &&
                        item.imageUrl ? (
                          <img
                            src={item.imageUrl}
                            alt="Creator gallery media"
                            loading="lazy"
                            referrerPolicy="no-referrer"
                            className={[
                              "h-full w-full object-cover",
                              item.visibility === "LOCKED" ||
                              item.visibility === "PENDING"
                                ? "blur-md scale-105"
                                : "",
                            ].join(" ")}
                          />
                        ) : (
                          <div className="flex flex-col items-center gap-3 text-zinc-500">
                            {item.mediaType === "VIDEO" ? (
                              <Video
                                size={42}
                                strokeWidth={1.4}
                              />
                            ) : (
                              <Images
                                size={42}
                                strokeWidth={1.4}
                              />
                            )}

                            <span className="text-xs">
                              {item.mediaType === "VIDEO"
                                ? "Video media"
                                : "Preview unavailable"}
                            </span>
                          </div>
                        )}

                        {(item.visibility === "LOCKED" ||
                          item.visibility === "PENDING") && (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="flex items-center gap-2 rounded-full border border-white/20 bg-black/75 px-3 py-2 text-xs font-semibold text-white backdrop-blur">
                              <LockKeyhole size={14} />

                              {item.visibility === "PENDING"
                                ? "Unavailable"
                                : "Locked media"}
                            </div>
                          </div>
                        )}

                        {item.mediaType === "VIDEO" && (
                          <div className="absolute left-3 top-3 rounded-full bg-black/75 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-white">
                            Video
                          </div>
                        )}
                      </div>

                      {/* MEDIA DETAILS */}

                      <div className="space-y-3 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span
                            className={[
                              "inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold",
                              getMediaStatusClass(item),
                            ].join(" ")}
                          >
                            {getMediaStatusLabel(item)}
                          </span>

                          {item.mediaType === "IMAGE" ? (
                            <FileImage
                              size={16}
                              className="text-zinc-500"
                            />
                          ) : (
                            <FileVideo
                              size={16}
                              className="text-zinc-500"
                            />
                          )}
                        </div>

                        <div>
                          <p className="text-sm font-semibold text-white">
                            {item.accessPolicy === "PUBLIC"
                              ? "Public media"
                              : item.accessPolicy === "SUBSCRIBERS_ONLY"
                                ? "Subscribers only"
                                : item.accessPolicy === "PURCHASE_ONLY"
                                  ? "Individual purchase"
                                  : "Subscription or purchase"}
                          </p>

                          {price && (
                            <p className="mt-1 text-xs font-medium text-[#ffcc42]">
                              {price}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center justify-between border-t border-white/10 pt-3 text-[11px] text-zinc-500">
                          <span>
                            {formatFileSize(item.fileSize)}
                          </span>

                          <span>
                            {item.createdAt
                              ? new Date(
                                  item.createdAt
                                ).toLocaleDateString()
                              : ""}
                          </span>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>

              {/* PAGINATION */}

              {galleryPagination.totalPages > 1 && (
                <div className="mt-8 flex items-center justify-center gap-4">
                  <button
                    type="button"
                    disabled={!galleryPagination.hasPreviousPage}
                    onClick={() =>
                      setGalleryPage((current) =>
                        Math.max(1, current - 1)
                      )
                    }
                    className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-medium text-zinc-300 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    Previous
                  </button>

                  <span className="text-xs text-zinc-500">
                    Page {galleryPagination.page} of{" "}
                    {galleryPagination.totalPages}
                  </span>

                  <button
                    type="button"
                    disabled={!galleryPagination.hasNextPage}
                    onClick={() =>
                      setGalleryPage((current) => current + 1)
                    }
                    className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-medium text-zinc-300 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
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
                onClick={() => closeUploadModal()}
                disabled={isUploading}
                aria-label="Close upload dialog"
                className="rounded-lg p-2 text-zinc-400 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
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
                disabled={isUploading}
                className="hidden"
              />

              {!selectedFile ? (
                <button
                  type="button"
                  disabled={isUploading}
                  onClick={() => fileInputRef.current?.click()}
                  className="flex min-h-48 w-full flex-col items-center justify-center rounded-2xl border border-dashed border-white/20 bg-white/[0.02] px-5 text-center transition hover:border-[#ffcc42]/50 hover:bg-[#ffcc42]/[0.04] disabled:opacity-40"
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
                      disabled={isUploading}
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
                      className="shrink-0 rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-400 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Change
                    </button>
                  </div>
                </div>
              )}

              {/* MEDIA ACCESS POLICY */}

              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="media-access-policy"
                    className="mb-2 block text-sm font-medium text-zinc-300"
                  >
                    Who can access this media?
                  </label>

                  <select
                    id="media-access-policy"
                    value={accessPolicy}
                    onChange={(event) => {
                      setAccessPolicy(event.target.value);
                      setPriceAmount("");
                      setError("");
                    }}
                    disabled={isUploading}
                    className="w-full rounded-xl border border-white/10 bg-[#19191f] px-4 py-3 text-sm text-white outline-none focus:border-[#ffcc42]/50"
                  >
                    <option value="">Choose an access policy</option>

                    <option value="PUBLIC">
                      Public — Free access
                    </option>

                    <option value="SUBSCRIBERS_ONLY">
                      Subscribers only
                    </option>

                    <option value="PURCHASE_ONLY">
                      Pay to unlock
                    </option>

                    <option value="SUBSCRIPTION_OR_PURCHASE">
                      Subscribers or individual purchase
                    </option>
                  </select>
                </div>

                {PURCHASE_POLICIES.includes(accessPolicy) && (
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <label
                        htmlFor="media-price"
                        className="mb-2 block text-sm font-medium text-zinc-300"
                      >
                        Purchase price
                      </label>

                      <input
                        id="media-price"
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={priceAmount}
                        onChange={(event) =>
                          setPriceAmount(event.target.value)
                        }
                        disabled={isUploading}
                        placeholder="e.g. 150"
                        className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-[#ffcc42]/50"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="media-currency"
                        className="mb-2 block text-sm font-medium text-zinc-300"
                      >
                        Currency
                      </label>

                      <select
                        id="media-currency"
                        value={currency}
                        onChange={(event) =>
                          setCurrency(event.target.value)
                        }
                        disabled={isUploading}
                        className="w-full rounded-xl border border-white/10 bg-[#19191f] px-3 py-3 text-sm text-white outline-none focus:border-[#ffcc42]/50"
                      >
                        <option value="KES">KES</option>
                        <option value="USD">USD</option>
                      </select>
                    </div>
                  </div>
                )}

                <p className="text-xs leading-5 text-zinc-500">
                  {accessPolicy === "PUBLIC" &&
                    "Anyone will be able to access this media after approval."}

                  {accessPolicy === "SUBSCRIBERS_ONLY" &&
                    "Only users with an eligible subscription will be able to access this media."}

                  {accessPolicy === "PURCHASE_ONLY" &&
                    "Users must purchase this media individually after approval."}

                  {accessPolicy === "SUBSCRIPTION_OR_PURCHASE" &&
                    "Users can access this media through an eligible subscription or individual purchase."}

                  {!accessPolicy &&
                    "Select an access policy before uploading."}
                </p>
              </div>

              {/* CAPTION */}

              <div>
                <label
                  htmlFor="media-caption"
                  className="mb-2 block text-sm font-medium text-zinc-300"
                >
                  Caption

                  <span className="ml-2 text-xs font-normal text-zinc-500">
                    Optional · Not saved yet
                  </span>
                </label>

                <textarea
                  id="media-caption"
                  value={caption}
                  onChange={(event) =>
                    setCaption(event.target.value)
                  }
                  disabled={isUploading}
                  maxLength={1000}
                  rows={3}
                  placeholder="Write something about this media..."
                  className="w-full resize-y rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-[#ffcc42]/50 disabled:opacity-50"
                />

                <p className="mt-1 text-xs text-zinc-600">
                  Captions are currently local drafts and are not included in the upload.
                </p>

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
                    disabled={isUploading}
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
                    disabled={isUploading}
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

              {/* UPLOAD PROGRESS */}

              {isUploading && (
                <div
                  className="rounded-xl border border-[#ffcc42]/20 bg-[#ffcc42]/5 p-4"
                  role="status"
                  aria-live="polite"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-[#ffcc42]">
                      Uploading your media...
                    </span>

                    <span className="text-zinc-400">
                      {uploadProgress}%
                    </span>
                  </div>

                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-[#ffcc42] transition-all duration-300"
                      style={{
                        width: `${uploadProgress}%`,
                      }}
                    />
                  </div>

                  <p className="mt-2 text-xs text-zinc-500">
                    Please keep this window open until verification finishes.
                  </p>
                </div>
              )}

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
                  onClick={() => closeUploadModal()}
                  disabled={isUploading}
                  className="rounded-xl border border-white/10 px-5 py-3 text-sm font-semibold text-zinc-300 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={
                    isUploading ||
                    !selectedFile ||
                    !rightsConfirmed ||
                    !consentConfirmed ||
                    !accessPolicy ||
                    (PURCHASE_POLICIES.includes(accessPolicy) &&
                      !priceAmount.trim())
                  }
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#ffcc42] px-5 py-3 text-sm font-bold text-black transition hover:bg-[#f5bd22] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isUploading ? (
                    <>
                      <Upload size={15} className="animate-pulse" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload size={15} />
                      Upload media
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
