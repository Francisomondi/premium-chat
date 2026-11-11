
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  Image as ImageIcon,
  RefreshCw,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  Clock,
  ChevronLeft,
  ChevronRight,
  Eye,
  AlertTriangle,
} from "lucide-react";

import Card from "../ui/Card.jsx";
import Button from "../ui/Button.jsx";
import Alert from "../ui/Alert.jsx";
import Spinner from "../ui/Spinner.jsx";

import {
  getPendingMediaForModeration,
  getAdminMediaPreview,
  approveGalleryMedia,
  rejectGalleryMedia,
} from "../../api/services/adminMediaModerationService.js";

const PAGE_SIZE = 10;

const getErrorMessage = (error) =>
  error?.apiError?.message ||
  error?.response?.data?.message ||
  error?.message ||
  "Unable to complete the moderation request.";

const formatDate = (value) => {
  if (!value) return "Not available";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }

  return date.toLocaleString("en-KE", {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

const formatFileSize = (bytes) => {
  const size = Number(bytes);

  if (!Number.isFinite(size) || size <= 0) {
    return "Not available";
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
};

/**
 * ============================================================
 * ADMIN MEDIA PREVIEW
 * ============================================================
 */

function AdminMediaPreview({ mediaId, hasPreview }) {
  const [previewUrl, setPreviewUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const requestSequence = useRef(0);

  const loadPreview = useCallback(async () => {
    const requestId = ++requestSequence.current;

    setLoading(true);
    setError("");
    setPreviewUrl("");

    try {
      const result = await getAdminMediaPreview(mediaId);

      if (requestId !== requestSequence.current) {
        return;
      }

      setPreviewUrl(result.previewUrl);
    } catch (requestError) {
      if (requestId !== requestSequence.current) {
        return;
      }

      setError(getErrorMessage(requestError));
    } finally {
      if (requestId === requestSequence.current) {
        setLoading(false);
      }
    }
  }, [mediaId]);

  useEffect(() => {
    if (hasPreview) {
      loadPreview();
    } else {
      setLoading(false);
      setError("No processed preview is available.");
    }

    return () => {
      requestSequence.current += 1;
    };
  }, [hasPreview, loadPreview]);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface-light">
      <div className="flex aspect-video items-center justify-center">
        {loading && (
          <Spinner label="Loading secure preview..." />
        )}

        {!loading && previewUrl && (
          <img
            src={previewUrl}
            alt="Blurred pending media submission"
            className="h-full w-full object-contain"
            loading="eager"
            referrerPolicy="no-referrer"
            onError={() => {
              setPreviewUrl("");
              setError(
                "Preview expired or could not be displayed. Refresh it to try again."
              );
            }}
          />
        )}

        {!loading && !previewUrl && (
          <div className="px-5 text-center">
            <ImageIcon
              size={34}
              className="mx-auto text-muted"
            />

            <p className="mt-3 text-sm text-muted">
              {error || "Preview unavailable."}
            </p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
        <span className="flex items-center gap-2 text-xs text-muted">
          <Eye size={14} />
          Blurred admin preview
        </span>

        <Button
          variant="outline"
          size="sm"
          disabled={loading || !hasPreview}
          onClick={loadPreview}
        >
          <RefreshCw size={14} />
          Refresh preview
        </Button>
      </div>
    </div>
  );
}

/**
 * ============================================================
 * MEDIA CARD
 * ============================================================
 */

function MediaModerationCard({
  media,
  busy,
  onApprove,
  onReject,
}) {
  const [confirmation, setConfirmation] = useState("");

  const mediaId = media.mediaId || media._id || media.id;

  const confirmAction = async (action) => {
    setConfirmation("");

    if (action === "approve") {
      await onApprove(mediaId);
      return;
    }

    await onReject(mediaId);
  };

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ImageIcon
              size={20}
              className="text-accent"
            />

            <h3 className="font-semibold">
              Image Submission
            </h3>
          </div>

          <p className="mt-2 break-all text-xs text-muted">
            Media ID: {mediaId}
          </p>
        </div>

        <span className="inline-flex items-center gap-2 rounded-full border border-yellow-500/30 bg-yellow-500/10 px-3 py-1 text-xs font-medium text-yellow-400">
          <Clock size={13} />
          Pending review
        </span>
      </div>

      <div className="mt-5">
        <AdminMediaPreview
          mediaId={mediaId}
          hasPreview={media.hasPreview === true}
        />
      </div>

      <div className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
        <div>
          <p className="text-muted">Creator ID</p>
          <p className="mt-1 break-all font-medium">
            {media.creatorId || "Not available"}
          </p>
        </div>

        <div>
          <p className="text-muted">Media type</p>
          <p className="mt-1 font-medium">
            {media.mediaType || media.type || "IMAGE"}
          </p>
        </div>

        <div>
          <p className="text-muted">Upload date</p>
          <p className="mt-1 font-medium">
            {formatDate(
              media.createdAt || media.uploadedAt
            )}
          </p>
        </div>

        <div>
          <p className="text-muted">File size</p>
          <p className="mt-1 font-medium">
            {formatFileSize(
              media.fileSizeBytes || media.sizeBytes
            )}
          </p>
        </div>

        <div>
          <p className="text-muted">Media status</p>
          <p className="mt-1 font-medium">
            {media.status || "READY"}
          </p>
        </div>

        <div>
          <p className="text-muted">Moderation status</p>
          <p className="mt-1 font-medium">
            {media.moderationStatus || "PENDING"}
          </p>
        </div>
      </div>

      {confirmation ? (
        <div className="mt-6 rounded-xl border border-border bg-surface-light p-4">
          <p className="text-sm font-medium">
            {confirmation === "approve"
              ? "Approve this image for the creator's public gallery?"
              : "Reject this image from the creator's public gallery?"}
          </p>

          <div className="mt-4 flex flex-wrap gap-3">
            <Button
              size="sm"
              disabled={busy}
              onClick={() => confirmAction(confirmation)}
            >
              {confirmation === "approve"
                ? "Confirm approval"
                : "Confirm rejection"}
            </Button>

            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => setConfirmation("")}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-6 flex flex-wrap gap-3 border-t border-border pt-5">
          <Button
            size="sm"
            disabled={busy}
            onClick={() => setConfirmation("approve")}
          >
            <CheckCircle2 size={16} />
            Approve image
          </Button>

          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => setConfirmation("reject")}
          >
            <XCircle size={16} />
            Reject image
          </Button>
        </div>
      )}
    </Card>
  );
}

/**
 * ============================================================
 * MAIN ADMIN MEDIA MODERATION
 * ============================================================
 */

export default function AdminMediaModeration() {
  const [media, setMedia] = useState([]);

  const [page, setPage] = useState(1);

  const [pagination, setPagination] = useState({
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    totalPages: 0,
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busyMediaId, setBusyMediaId] = useState("");

  const requestSequence = useRef(0);

  const loadPendingMedia = useCallback(async () => {
    const requestId = ++requestSequence.current;

    setLoading(true);
    setError("");

    try {
      const result = await getPendingMediaForModeration({
        page,
        limit: PAGE_SIZE,
      });

      if (requestId !== requestSequence.current) {
        return;
      }

      if (!Array.isArray(result?.media)) {
        throw new Error(
          "Invalid pending media response."
        );
      }

      setMedia(result.media);

      if (result.pagination) {
        setPagination(result.pagination);
      } else {
        setPagination({
          page,
          limit: PAGE_SIZE,
          total: result.total ?? result.media.length,
          totalPages: result.totalPages ?? 0,
        });
      }
    } catch (requestError) {
      if (requestId !== requestSequence.current) {
        return;
      }

      setError(getErrorMessage(requestError));
      setMedia([]);
    } finally {
      if (requestId === requestSequence.current) {
        setLoading(false);
      }
    }
  }, [page]);

  useEffect(() => {
    loadPendingMedia();

    return () => {
      requestSequence.current += 1;
    };
  }, [loadPendingMedia]);

  const handleModeration = async (mediaId, action) => {
    if (!mediaId || busyMediaId) {
      return;
    }

    setBusyMediaId(mediaId);
    setActionError("");

    try {
      if (action === "approve") {
        await approveGalleryMedia(mediaId);
      } else {
        await rejectGalleryMedia(mediaId);
      }

      await loadPendingMedia();
    } catch (requestError) {
      setActionError(getErrorMessage(requestError));
    } finally {
      setBusyMediaId("");
    }
  };

  const totalPages = Number(pagination.totalPages) || 0;

  return (
    <section
      aria-labelledby="admin-media-moderation-title"
      className="mt-10"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <ShieldCheck
              size={27}
              className="text-accent"
            />

            <h2
              id="admin-media-moderation-title"
              className="text-2xl font-bold"
            >
              Media Moderation
            </h2>
          </div>

          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
            Review creator image submissions before
            allowing them to appear in public galleries.
            Only processed, pending images are displayed.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          disabled={loading || Boolean(busyMediaId)}
          onClick={loadPendingMedia}
        >
          <RefreshCw
            size={16}
            className={loading ? "animate-spin" : ""}
          />
          Refresh queue
        </Button>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-4">
        <Clock size={19} className="text-accent" />

        <p className="text-sm">
          Pending submissions:{" "}
          <strong>{pagination.total ?? media.length}</strong>
        </p>

        <span className="text-xs text-muted">
          Images become publicly visible only after approval.
        </span>
      </div>

      {actionError && (
        <div className="mt-5">
          <Alert type="error">{actionError}</Alert>
        </div>
      )}

      {error && (
        <div className="mt-5">
          <Alert type="error">{error}</Alert>
        </div>
      )}

      {loading && (
        <div className="mt-8 flex justify-center">
          <Spinner label="Loading pending media..." />
        </div>
      )}

      {!loading && !error && media.length === 0 && (
        <Card className="mt-6 text-center">
          <CheckCircle2
            size={42}
            className="mx-auto text-accent"
          />

          <h3 className="mt-4 text-lg font-semibold">
            No Pending Images
          </h3>

          <p className="mt-2 text-sm text-muted">
            All currently processed image submissions
            have been reviewed.
          </p>
        </Card>
      )}

      {!loading && !error && media.length > 0 && (
        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          {media.map((item) => {
            const mediaId =
              item.mediaId || item._id || item.id;

            return (
              <div key={mediaId}>
                {busyMediaId === mediaId && (
                  <div className="mb-3 flex items-center gap-2 text-sm text-muted">
                    <Spinner label="Processing moderation..." />
                  </div>
                )}

                <MediaModerationCard
                  media={item}
                  busy={Boolean(busyMediaId)}
                  onApprove={(id) =>
                    handleModeration(id, "approve")
                  }
                  onReject={(id) =>
                    handleModeration(id, "reject")
                  }
                />
              </div>
            );
          })}
        </div>
      )}

      {!loading && !error && totalPages > 1 && (
        <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-muted">
            Page {page} of {totalPages}
          </p>

          <div className="flex gap-3">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || Boolean(busyMediaId)}
              onClick={() =>
                setPage((current) => current - 1)
              }
            >
              <ChevronLeft size={16} />
              Previous
            </Button>

            <Button
              variant="outline"
              size="sm"
              disabled={
                page >= totalPages ||
                Boolean(busyMediaId)
              }
              onClick={() =>
                setPage((current) => current + 1)
              }
            >
              Next
              <ChevronRight size={16} />
            </Button>
          </div>
        </div>
      )}

      <div className="mt-8 flex items-start gap-3 rounded-xl border border-border bg-surface p-4">
        <AlertTriangle
          size={20}
          className="mt-0.5 shrink-0 text-accent"
        />

        <p className="text-xs leading-6 text-muted">
          Moderation decisions are enforced by the
          backend. This interface displays blurred
          previews only; it does not expose original
          protected media or storage credentials.
        </p>
      </div>
    </section>
  );
}
