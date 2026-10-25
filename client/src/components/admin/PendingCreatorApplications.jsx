
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  ClipboardList,
  RefreshCw,
  CalendarDays,
  Mail,
  UserRound,
  CheckCircle2,
  XCircle,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  Inbox,
} from "lucide-react";

import Card from "../ui/Card.jsx";
import Button from "../ui/Button.jsx";
import Alert from "../ui/Alert.jsx";
import Spinner from "../ui/Spinner.jsx";

import {
  getPendingCreatorApplications,
  approveCreatorApplication,
  rejectCreatorApplication,
} from "../../api/services/adminCreatorApplicationService.js";

/**
 * ============================================================
 * PREMIUMCHAT PENDING CREATOR APPLICATIONS
 * ============================================================
 *
 * Displays creator applications awaiting review.
 *
 * Features:
 * - Backend pagination
 * - Manual refresh
 * - Loading and error states
 * - Empty state
 * - Safe rendering of applicant information
 * - Stale response protection
 *
 * Approval/rejection controls will be added
 * in the next development step.
 */

const PAGE_SIZE = 10;

const getErrorMessage = (error) => {
  return (
    error?.apiError?.message ||
    error?.response?.data?.message ||
    error?.message ||
    "Unable to load creator applications."
  );
};

const formatDate = (value) => {
  if (!value) {
    return "Not available";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }

  return date.toLocaleString("en-KE", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const createEmptyPagination = (page = 1) => ({
  page,
  limit: PAGE_SIZE,
  total: 0,
  totalPages: 0,
});


/**
 * ============================================================
 * APPLICATION CARD
 * ============================================================
 *
 * Displays applicant details and provides explicit
 * approval/rejection confirmation controls.
 *
 * The confirmation UI does not grant permissions.
 * All authorization happens on the backend.
 */

function ApplicationCard({
  applicant,
  reviewingUserId,
  onReview,
}) {
  const [confirmation, setConfirmation] =
    useState(null);

  const application = applicant.application || {};

  const userId = applicant.userId;

  const isReviewing =
    reviewingUserId === userId;

  const anotherReviewInProgress =
    reviewingUserId !== null &&
    reviewingUserId !== userId;

  const actionsDisabled =
    isReviewing || anotherReviewInProgress;

  const handleConfirm = () => {
    if (
      !confirmation ||
      actionsDisabled
    ) {
      return;
    }

    const decision = confirmation;

    setConfirmation(null);

    onReview(userId, decision);
  };

  return (
    <Card>
      {/* ============================================= */}
      {/* APPLICANT INFORMATION                         */}
      {/* ============================================= */}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-light">
            <UserRound
              size={22}
              className="text-accent"
            />
          </div>

          <div className="min-w-0">
            <h3 className="break-words text-lg font-semibold">
              {applicant.displayName ||
                "Unnamed applicant"}
            </h3>

            <p className="mt-1 flex items-center gap-2 break-all text-sm text-muted">
              <Mail
                size={15}
                className="shrink-0"
              />

              {applicant.email ||
                "Email unavailable"}
            </p>
          </div>
        </div>

        <span className="rounded-full border border-border bg-surface-light px-3 py-1 text-xs font-semibold text-accent">
          Pending Review
        </span>
      </div>

      {/* ============================================= */}
      {/* MOTIVATION                                    */}
      {/* ============================================= */}

      <div className="mt-5 border-t border-border pt-5">
        <h4 className="text-sm font-semibold">
          Application Motivation
        </h4>

        <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-muted">
          {application.motivation ||
            "No motivation provided."}
        </p>
      </div>

      {/* ============================================= */}
      {/* APPLICATION DETAILS                           */}
      {/* ============================================= */}

      <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-border pt-4 text-xs text-muted">
        <span className="flex items-center gap-2">
          <CalendarDays size={15} />

          Submitted:{" "}
          {formatDate(application.appliedAt)}
        </span>

        <span>
          Account:{" "}
          {applicant.accountStatus || "Unknown"}
        </span>
      </div>

      {/* ============================================= */}
      {/* REVIEW ACTIONS                                */}
      {/* ============================================= */}

      <div className="mt-6 border-t border-border pt-5">
        <h4 className="text-sm font-semibold">
          Administrator Review
        </h4>

        <p className="mt-2 text-xs leading-6 text-muted">
          Review the applicant's motivation before
          making a decision. This action cannot
          currently be reversed.
        </p>

        {isReviewing ? (
          <div className="mt-4">
            <Spinner
              size="sm"
              label="Submitting review..."
            />
          </div>
        ) : (
          <div className="mt-4 flex flex-wrap gap-3">
            <Button
              variant="primary"
              size="sm"
              disabled={actionsDisabled}
              onClick={() =>
                setConfirmation("APPROVE")
              }
            >
              <CheckCircle2 size={16} />

              Approve
            </Button>

            <Button
              variant="danger"
              size="sm"
              disabled={actionsDisabled}
              onClick={() =>
                setConfirmation("REJECT")
              }
            >
              <XCircle size={16} />

              Reject
            </Button>
          </div>
        )}

        {/* =========================================== */}
        {/* EXPLICIT CONFIRMATION                       */}
        {/* =========================================== */}

        {confirmation && !isReviewing && (
          <div
            className="mt-5 rounded-xl border border-border bg-surface-light p-4"
            role="group"
            aria-label="Confirm creator application review"
          >
            <div className="flex items-start gap-3">
              <ShieldAlert
                size={20}
                className="mt-0.5 shrink-0 text-accent"
              />

              <div>
                <h5 className="text-sm font-semibold">
                  Confirm{" "}
                  {confirmation === "APPROVE"
                    ? "Approval"
                    : "Rejection"}
                </h5>

                <p className="mt-2 text-sm leading-6 text-muted">
                  {confirmation === "APPROVE"
                    ? `Approve the creator application submitted by ${applicant.displayName || "this user"}? The backend will assign the CREATOR role. Age verification requirements remain in place.`
                    : `Reject the creator application submitted by ${applicant.displayName || "this user"}? The applicant will remain a USER and cannot reapply under the current workflow.`}
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <Button
                variant={
                  confirmation === "APPROVE"
                    ? "primary"
                    : "danger"
                }
                size="sm"
                disabled={actionsDisabled}
                onClick={handleConfirm}
              >
                {confirmation === "APPROVE"
                  ? "Confirm Approval"
                  : "Confirm Rejection"}
              </Button>

              <Button
                variant="outline"
                size="sm"
                disabled={actionsDisabled}
                onClick={() =>
                  setConfirmation(null)
                }
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}


/**
 * ============================================================
 * PENDING APPLICATIONS COMPONENT
 * ============================================================
 */

export default function PendingCreatorApplications() {
  const [applications, setApplications] = useState([]);

  const [page, setPage] = useState(1);

  const [pagination, setPagination] = useState(
    createEmptyPagination()
  );

  const [isLoading, setIsLoading] = useState(true);

  const [error, setError] = useState(null);

  const [reviewingUserId, setReviewingUserId] =
  useState(null);

const [reviewMessage, setReviewMessage] =
  useState(null);


const reviewInProgressRef = useRef(false);

  /*
   * Each request gets a sequence number.
   *
   * Older responses must not overwrite newer
   * page or refresh results.
   */

  const requestSequence = useRef(0);

  const loadApplications = useCallback(async () => {
    const requestId = ++requestSequence.current;

    setIsLoading(true);
    setError(null);

    try {
      const response =
        await getPendingCreatorApplications({
          page,
          limit: PAGE_SIZE,
        });

      if (requestId !== requestSequence.current) {
        return;
      }

      const result = response?.data;

      if (
        !result ||
        !Array.isArray(result.applications) ||
        !result.pagination
      ) {
        throw new Error(
          "Invalid creator applications response."
        );
      }

      const nextPagination = result.pagination;

      const totalPages = Number(
        nextPagination.totalPages
      );

      /*
       * An administrator may request a page that
       * has become empty after other reviews.
       *
       * Return to the last available page.
       */

      if (
        Number.isInteger(totalPages) &&
        totalPages > 0 &&
        page > totalPages
      ) {
        setPage(totalPages);
        return;
      }

      setApplications(result.applications);

      setPagination(nextPagination);

      return true;
    } catch (requestError) {
      if (requestId !== requestSequence.current) {
        return false;
      }

      setError(getErrorMessage(requestError));

      /*
       * Do not display potentially stale records
       * when the requested page fails to load.
       */

      setApplications([]);

      setPagination(createEmptyPagination(page));

      return false;
    } finally {
      if (requestId === requestSequence.current) {
        setIsLoading(false);
      }
    }
  }, [page]);

  useEffect(() => {
    loadApplications();

    return () => {
      /*
       * Invalidate outstanding requests on page
       * changes or component unmount.
       */

      requestSequence.current += 1;
    };
  }, [loadApplications]);

  const totalPages = Math.max(
    0,
    Number(pagination.totalPages) || 0
  );

  
  /**
   * ==========================================================
   * HANDLE CREATOR APPLICATION REVIEW
   * ==========================================================
   *
   * The administrator explicitly confirms a decision
   * before this handler is called.
   *
   * On success:
   * - Show a confirmation message
   * - Reload the current pending applications page
   *
   * On failure:
   * - Preserve the list
   * - Show the backend error
   */


  /**
   * ==========================================================
   * HANDLE CREATOR APPLICATION REVIEW
   * ==========================================================
   *
   * Review submission and list refreshing are
   * treated as separate operations.
   *
   * A successful backend review must never be
   * reported as a failed review merely because
   * the subsequent list refresh fails.
   */

  const handleReview = async (userId, decision) => {
    if (reviewInProgressRef.current) {
      return;
    }

    reviewInProgressRef.current = true;

    setReviewingUserId(userId);
    setReviewMessage(null);
    setError(null);

    let reviewSucceeded = false;

    try {
      /*
       * ======================================================
       * SUBMIT ADMINISTRATOR DECISION
       * ======================================================
       */

      if (decision === "APPROVE") {
        await approveCreatorApplication(userId);
      } else if (decision === "REJECT") {
        await rejectCreatorApplication(userId);
      } else {
        throw new Error(
          "Invalid creator application review decision."
        );
      }

      reviewSucceeded = true;

      /*
       * ======================================================
       * REPORT SUCCESSFUL REVIEW
       * ======================================================
       */

      setReviewMessage({
        type: "success",
        message:
          decision === "APPROVE"
            ? "Creator application approved successfully."
            : "Creator application rejected successfully.",
      });

      /*
       * ======================================================
       * REFRESH PENDING APPLICATIONS
       * ======================================================
       *
       * loadApplications returns:
       *
       * true  - refreshed successfully
       * false - refresh failed
       */

      const refreshed = await loadApplications();

      if (!refreshed) {
        setReviewMessage({
          type: "success",
          message:
            "The creator application was reviewed successfully. However, the pending applications list could not be refreshed. Please try refreshing the list.",
        });
      }
    } catch (reviewError) {
      /*
       * If the review request itself fails, do not
       * claim the application was reviewed.
       *
       * Network failures may leave the outcome
       * uncertain. The administrator should
       * refresh the list before attempting again.
       */

      if (!reviewSucceeded) {
        setReviewMessage({
          type: "error",
          message:
            `${getErrorMessage(reviewError)} ` +
            "If the request timed out or the connection was interrupted, refresh the application list before retrying.",
        });
      }
    } finally {
      reviewInProgressRef.current = false;

      setReviewingUserId(null);
    }
  };


  const totalApplications = Math.max(
    0,
    Number(pagination.total) || 0
  );

    const canGoPrevious =
    !isLoading &&
    reviewingUserId === null &&
    page > 1;

    const canGoNext =
    !isLoading &&
    reviewingUserId === null &&
    totalPages > 0 &&
    page < totalPages;

  const handlePreviousPage = () => {
    if (!canGoPrevious) {
      return;
    }

    setPage((current) => current - 1);
  };

  const handleNextPage = () => {
    if (!canGoNext) {
      return;
    }

    setPage((current) => current + 1);
  };

  return (
    <section
      aria-labelledby="pending-creator-applications-title"
    >
      {/* ============================================= */}
      {/* SECTION HEADER                                */}
      {/* ============================================= */}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <ClipboardList
              size={26}
              className="text-accent"
            />

            <h2
              id="pending-creator-applications-title"
              className="text-2xl font-bold"
            >
              Pending Creator Applications
            </h2>
          </div>

          <p className="mt-3 text-sm leading-6 text-muted">
            Review applications submitted by users
            requesting creator access.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          disabled={isLoading || reviewingUserId !== null}
          onClick={loadApplications}
        >
          <RefreshCw
            size={16}
            className={
              isLoading ? "animate-spin" : ""
            }
          />

          Refresh
        </Button>
      </div>

      {/* ============================================= */}
        {/* REVIEW FEEDBACK                               */}
        {/* ============================================= */}

        {reviewMessage && (
        <div className="mt-6">
            <Alert type={reviewMessage.type}>
            {reviewMessage.message}
            </Alert>
        </div>
        )}

      {/* ============================================= */}
      {/* ERROR STATE                                   */}
      {/* ============================================= */}

      {error && (
        <div className="mt-6">
          <Alert type="error">
            {error}
          </Alert>
        </div>
      )}

      {/* ============================================= */}
      {/* LOADING STATE                                 */}
      {/* ============================================= */}

      {isLoading && (
        <div className="mt-8 flex justify-center rounded-2xl border border-border bg-surface px-6 py-12">
          <Spinner
            label="Loading pending creator applications..."
          />
        </div>
      )}

      {/* ============================================= */}
      {/* EMPTY STATE                                   */}
      {/* ============================================= */}

      {!isLoading &&
        !error &&
        applications.length === 0 && (
          <Card className="mt-8 text-center">
            <Inbox
              size={42}
              className="mx-auto text-accent"
            />

            <h3 className="mt-4 text-lg font-semibold">
              No Pending Applications
            </h3>

            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted">
              There are currently no creator
              applications waiting for review.
            </p>
          </Card>
        )}

      {/* ============================================= */}
      {/* APPLICATION LIST                              */}
      {/* ============================================= */}

      {!isLoading &&
        !error &&
        applications.length > 0 && (
          <div className="mt-8 space-y-5">
           {applications.map((applicant) => (
            <ApplicationCard
                key={applicant.userId}
                applicant={applicant}
                reviewingUserId={reviewingUserId}
                onReview={handleReview}
            />
            ))}
          </div>
        )}

      {/* ============================================= */}
      {/* PAGINATION                                    */}
      {/* ============================================= */}

      {!isLoading &&
        !error &&
        totalPages > 0 && (
          <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-surface p-4">
            <div>
              <p className="text-sm font-medium">
                Page {page} of {totalPages}
              </p>

              <p className="mt-1 text-xs text-muted">
                {totalApplications} pending{" "}
                {totalApplications === 1
                  ? "application"
                  : "applications"}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                disabled={!canGoPrevious}
                onClick={handlePreviousPage}
              >
                <ChevronLeft size={16} />

                Previous
              </Button>

              <Button
                variant="outline"
                size="sm"
                disabled={!canGoNext}
                onClick={handleNextPage}
              >
                Next

                <ChevronRight size={16} />
              </Button>
            </div>
          </div>
        )}
    </section>
  );
}
