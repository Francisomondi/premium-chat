import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  RefreshCw,
  Users,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  UserRound,
  Mail,
  CheckCircle2,
  XCircle,
  Clock3,
} from "lucide-react";

import Card from "../ui/Card.jsx";

import {
  getAllCreatorApplications,
  getCreatorApplication,
} from "../../api/services/adminCreatorApplicationService.js";

const PAGE_SIZE = 10;

const FILTERS = [
  "ALL",
  "PENDING",
  "APPROVED",
  "REJECTED",
];

const getErrorMessage = (error) =>
  error?.apiError?.message ||
  error?.response?.data?.message ||
  error?.message ||
  "Unable to load creator applications.";

const formatDate = (value) => {
  if (!value) return "Not available";

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

const getStatusStyles = (status) => {
  switch (status) {
    case "APPROVED":
      return "border-green-500/30 bg-green-500/10 text-green-400";

    case "REJECTED":
      return "border-red-500/30 bg-red-500/10 text-red-400";

    default:
      return "border-yellow-500/30 bg-yellow-500/10 text-yellow-400";
  }
};

export default function CreatorApplicationHistory() {
  const [status, setStatus] = useState("ALL");
  const [page, setPage] = useState(1);

  const [applications, setApplications] = useState([]);

  const [pagination, setPagination] = useState({
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    totalPages: 0,
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [selectedApplication, setSelectedApplication] =
    useState(null);

  const [detailsLoading, setDetailsLoading] =
    useState(false);

  const [detailsError, setDetailsError] =
    useState(null);

  const requestSequence = useRef(0);
  const detailsSequence = useRef(0);

  const loadApplications = useCallback(async () => {
    const requestId = ++requestSequence.current;

    setLoading(true);
    setError(null);

    try {
      const response = await getAllCreatorApplications({
        status,
        page,
        limit: PAGE_SIZE,
      });

      if (requestId !== requestSequence.current) {
        return;
      }

      const result = response?.data;

      if (
        !Array.isArray(result?.applications) ||
        !result?.pagination
      ) {
        throw new Error(
          "Invalid creator applications response."
        );
      }

      const totalPages = Number(
        result.pagination.totalPages
      );

      if (
        Number.isInteger(totalPages) &&
        totalPages > 0 &&
        page > totalPages
      ) {
        setPage(totalPages);
        return;
      }

      setApplications(result.applications);
      setPagination(result.pagination);
    } catch (requestError) {
      if (requestId !== requestSequence.current) {
        return;
      }

      setError(getErrorMessage(requestError));
      setApplications([]);
    } finally {
      if (requestId === requestSequence.current) {
        setLoading(false);
      }
    }
  }, [status, page]);

  useEffect(() => {
    loadApplications();

    return () => {
      requestSequence.current += 1;
    };
  }, [loadApplications]);

    useEffect(() => {
  const handleApplicationReviewed = () => {
    loadApplications();
  };

  window.addEventListener(
    "premiumchat:creator-application-reviewed",
    handleApplicationReviewed
  );

  return () => {
    window.removeEventListener(
      "premiumchat:creator-application-reviewed",
      handleApplicationReviewed
    );
  };
}, [loadApplications]);

  useEffect(() => {
    return () => {
      detailsSequence.current += 1;
    };
  }, []);
  


  const handleStatusChange = (nextStatus) => {
    detailsSequence.current += 1;

    setStatus(nextStatus);
    setPage(1);
    setSelectedApplication(null);
    setDetailsError(null);
  };

  const handleViewDetails = async (userId) => {
    const requestId = ++detailsSequence.current;

    setDetailsLoading(true);
    setDetailsError(null);
    setSelectedApplication(null);

    try {
      const response = await getCreatorApplication(userId);

      if (requestId !== detailsSequence.current) {
        return;
      }

      const application = response?.data?.application;

      if (!application) {
        throw new Error(
          "Application details were not returned."
        );
      }

      setSelectedApplication(application);
    } catch (requestError) {
      if (requestId !== detailsSequence.current) {
        return;
      }

      setDetailsError(getErrorMessage(requestError));
    } finally {
      if (requestId === detailsSequence.current) {
        setDetailsLoading(false);
      }
    }
  };

  const handleCloseDetails = () => {
    detailsSequence.current += 1;

    setSelectedApplication(null);
    setDetailsError(null);
    setDetailsLoading(false);
  };

  const totalPages = Number(pagination.totalPages) || 0;

  return (
    <section
      aria-labelledby="creator-application-history-title"
      className="mt-10"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Users size={26} className="text-accent" />

            <h2
              id="creator-application-history-title"
              className="text-2xl font-bold"
            >
              Creator Applications & Profiles
            </h2>
          </div>

          <p className="mt-2 text-sm text-muted">
            Browse submitted applications and inspect
            approved creator accounts.
          </p>
        </div>

        <button
          type="button"
          onClick={loadApplications}
          disabled={loading}
          className="rounded-xl border border-border px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          <span className="flex items-center gap-2">
            <RefreshCw
              size={16}
              className={loading ? "animate-spin" : ""}
            />
            Refresh
          </span>
        </button>
      </div>

      {/* STATUS FILTERS */}

      <div className="mt-6 flex flex-wrap gap-3">
        {FILTERS.map((filter) => (
          <button
            key={filter}
            type="button"
            onClick={() => handleStatusChange(filter)}
            aria-pressed={status === filter}
            className={`rounded-xl border px-4 py-2 text-sm font-medium transition ${
              status === filter
                ? "border-accent bg-accent/10 text-accent"
                : "border-border text-muted hover:text-white"
            }`}
          >
            {filter === "ALL"
              ? "All Applications"
              : filter.charAt(0) +
                filter.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {/* ERROR */}

      {error && (
        <div
          role="alert"
          className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400"
        >
          {error}
        </div>
      )}

      {/* LOADING */}

      {loading && (
        <p
          role="status"
          className="mt-8 text-sm text-muted"
        >
          Loading creator applications...
        </p>
      )}

      {/* EMPTY STATE */}

      {!loading && !error && applications.length === 0 && (
        <Card className="mt-6">
          <p className="text-center text-sm text-muted">
            No applications found for this filter.
          </p>
        </Card>
      )}

      {/* APPLICATION CARDS */}

      {!loading && !error && applications.length > 0 && (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {applications.map((applicant) => {
            const application = applicant.application || {};
            const applicationStatus =
              application.status || "UNKNOWN";

            return (
              <Card key={applicant.userId}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    {applicant.avatarUrl ? (
                      <img
                        src={applicant.avatarUrl}
                        alt=""
                        className="h-12 w-12 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-light">
                        <UserRound
                          size={24}
                          className="text-accent"
                        />
                      </div>
                    )}

                    <div className="min-w-0">
                      <h3 className="break-words font-semibold">
                        {applicant.displayName ||
                          "Unnamed applicant"}
                      </h3>

                      <p className="mt-1 break-all text-xs text-muted">
                        {applicant.email || "Email unavailable"}
                      </p>
                    </div>
                  </div>

                  <span
                    className={`rounded-full border px-2 py-1 text-xs font-medium ${getStatusStyles(
                      applicationStatus
                    )}`}
                  >
                    {applicationStatus}
                  </span>
                </div>

                <div className="mt-5 space-y-3 text-sm">
                  <p className="flex items-center gap-2 text-muted">
                    <CalendarDays size={15} />
                    Applied: {formatDate(application.appliedAt)}
                  </p>

                  <p className="text-muted">
                    Account role:{" "}
                    <span className="font-medium text-white">
                      {applicant.role || "Unknown"}
                    </span>
                  </p>

                  <p className="line-clamp-3 whitespace-pre-wrap break-words text-muted">
                    {application.motivation ||
                      "No application motivation provided."}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    handleViewDetails(applicant.userId)
                  }
                  disabled={detailsLoading}
                  className="mt-5 w-full rounded-xl border border-accent px-4 py-2 text-sm font-semibold text-accent transition hover:bg-accent/10 disabled:opacity-50"
                >
                  View Details
                </button>
              </Card>
            );
          })}
        </div>
      )}

      {/* PAGINATION */}

      {!loading && !error && totalPages > 0 && (
        <div className="mt-6 flex items-center justify-between gap-4">
          <p className="text-sm text-muted">
            Page {page} of {totalPages} —{" "}
            {pagination.total} applications
          </p>

          <div className="flex gap-3">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((current) => current - 1)}
              className="rounded-xl border border-border px-4 py-2 text-sm disabled:opacity-50"
            >
              <ChevronLeft size={18} />
            </button>

            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((current) => current + 1)}
              className="rounded-xl border border-border px-4 py-2 text-sm disabled:opacity-50"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      )}

      {/* APPLICATION DETAILS */}

      {(detailsLoading || detailsError || selectedApplication) && (
        <div className="mt-8 rounded-2xl border border-border bg-surface p-6">
          <div className="flex items-center justify-between gap-4">
            <h3 className="text-xl font-semibold">
              Application Details
            </h3>

            <button
              type="button"
              onClick={handleCloseDetails}
              className="rounded-lg border border-border px-3 py-2 text-sm"
            >
              Close
            </button>
          </div>

          {detailsLoading && (
            <p className="mt-4 text-sm text-muted">
              Loading application details...
            </p>
          )}

          {detailsError && (
            <p role="alert" className="mt-4 text-sm text-red-400">
              {detailsError}
            </p>
          )}

          {selectedApplication && (
            <div className="mt-6 space-y-4 text-sm">
              <div className="flex items-center gap-3">
                {selectedApplication.avatarUrl ? (
                  <img
                    src={selectedApplication.avatarUrl}
                    alt=""
                    className="h-14 w-14 rounded-full object-cover"
                  />
                ) : (
                  <UserRound
                    size={32}
                    className="text-accent"
                  />
                )}

                <div>
                  <h4 className="font-semibold">
                    {selectedApplication.displayName}
                  </h4>

                  <p className="text-muted">
                    {selectedApplication.role}
                  </p>
                </div>
              </div>

              <p className="flex items-center gap-2 break-all">
                <Mail size={16} />
                {selectedApplication.email}
              </p>

              <p>
                <strong>Account status:</strong>{" "}
                {selectedApplication.accountStatus}
              </p>

              <p>
                <strong>Registered:</strong>{" "}
                {formatDate(selectedApplication.registeredAt)}
              </p>

              <p>
                <strong>Application status:</strong>{" "}
                {selectedApplication.application?.status}
              </p>

              <p className="flex items-center gap-2">
                <Clock3 size={16} />
                Applied:{" "}
                {formatDate(
                  selectedApplication.application?.appliedAt
                )}
              </p>

              <p className="flex items-center gap-2">
                {selectedApplication.application?.status ===
                "APPROVED" ? (
                  <CheckCircle2
                    size={16}
                    className="text-green-400"
                  />
                ) : (
                  <XCircle
                    size={16}
                    className="text-muted"
                  />
                )}

                Reviewed:{" "}
                {formatDate(
                  selectedApplication.application?.reviewedAt
                )}
              </p>

              <div>
                <h4 className="font-semibold">
                  Application Motivation
                </h4>

                <p className="mt-2 whitespace-pre-wrap break-words leading-7 text-muted">
                  {selectedApplication.application?.motivation ||
                    "Not provided"}
                </p>
              </div>

              {selectedApplication.application?.reviewedBy && (
                <p className="break-all text-xs text-muted">
                  Reviewed by administrator ID:{" "}
                  {selectedApplication.application.reviewedBy}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}