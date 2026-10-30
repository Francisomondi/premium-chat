import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  Users,
  RefreshCw,
  UserRound,
  ShieldCheck,
  ShieldAlert,
  Wallet,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Eye,
  X,
} from "lucide-react";

import Card from "../ui/Card.jsx";
import Button from "../ui/Button.jsx";
import Alert from "../ui/Alert.jsx";
import Spinner from "../ui/Spinner.jsx";

import {
  getAdminCreatorProfiles,
  getAdminCreatorProfile,
} from "../../api/services/adminCreatorProfileService.js";

/**
 * ============================================================
 * PREMIUMCHAT — ADMIN CREATOR PROFILES
 * ============================================================
 *
 * Administrator-only creator management interface.
 *
 * Features:
 *
 * - Approved creator listing
 * - Creator account details
 * - Age verification status
 * - Public discoverability
 * - Monetization configuration
 * - Creator profile details
 * - Backend pagination
 * - Manual refresh
 * - Loading and error handling
 */

const PAGE_SIZE = 10;

const getErrorMessage = (error) =>
  error?.apiError?.message ||
  error?.response?.data?.message ||
  error?.message ||
  "Unable to load creator profiles.";

const formatDate = (value) => {
  if (!value) return "Not available";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }

  return date.toLocaleDateString("en-KE", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const formatPrice = (minor, currency = "KES") => {
  const amount = Number(minor);

  if (!Number.isFinite(amount)) {
    return "Not available";
  }

  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency,
  }).format(amount / 100);
};

const StatusBadge = ({ enabled, label }) => (
  <span
    className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium ${
      enabled
        ? "border-green-500/30 bg-green-500/10 text-green-400"
        : "border-border bg-surface-light text-muted"
    }`}
  >
    {enabled ? (
      <CheckCircle2 size={13} />
    ) : (
      <XCircle size={13} />
    )}

    {label}
  </span>
);

const CreatorAvatar = ({ creator, size = "md" }) => {
  const dimensions =
    size === "lg" ? "h-20 w-20" : "h-14 w-14";

  if (creator.avatarUrl) {
    return (
      <img
        src={creator.avatarUrl}
        alt=""
        className={`${dimensions} shrink-0 rounded-full object-cover`}
      />
    );
  }

  return (
    <div
      className={`${dimensions} flex shrink-0 items-center justify-center rounded-full bg-surface-light`}
    >
      <UserRound
        size={size === "lg" ? 32 : 24}
        className="text-accent"
      />
    </div>
  );
};

/**
 * ============================================================
 * CREATOR DETAILS
 * ============================================================
 */

function CreatorDetails({ creator, onClose }) {
  const monetization = creator.monetization || {};
  const verification = creator.ageVerification || {};
  const application = creator.application || {};

  return (
    <Card className="mt-6">
      <div className="flex items-start justify-between gap-4">
        <h3 className="text-xl font-semibold">
          Creator Profile Details
        </h3>

        <Button
          variant="outline"
          size="sm"
          onClick={onClose}
        >
          <X size={16} />
          Close
        </Button>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <CreatorAvatar creator={creator} size="lg" />

        <div>
          <h4 className="text-xl font-bold">
            {creator.displayName}
          </h4>

          <p className="mt-1 break-all text-sm text-muted">
            {creator.email}
          </p>

          <p className="mt-2 text-xs text-muted">
            Joined {formatDate(creator.joinedAt)}
          </p>
        </div>
      </div>

      {/* ACCOUNT STATUS */}

      <div className="mt-6 border-t border-border pt-5">
        <h4 className="font-semibold">
          Account Information
        </h4>

        <div className="mt-4 grid gap-4 text-sm md:grid-cols-2">
          <p>
            Role:{" "}
            <strong>{creator.role}</strong>
          </p>

          <p>
            Account Status:{" "}
            <strong>{creator.accountStatus}</strong>
          </p>

          <p>
            Application Status:{" "}
            <strong>{application.status || "Unknown"}</strong>
          </p>

          <p>
            Publicly Discoverable:{" "}
            <strong>
              {creator.isPubliclyDiscoverable
                ? "Yes"
                : "No"}
            </strong>
          </p>
        </div>
      </div>

      {/* VERIFICATION */}

      <div className="mt-6 border-t border-border pt-5">
        <h4 className="flex items-center gap-2 font-semibold">
          <ShieldCheck size={19} className="text-accent" />
          Age Verification
        </h4>

        <div className="mt-4 space-y-3 text-sm">
          <p>
            Status:{" "}
            <strong>
              {verification.status || "Unknown"}
            </strong>
          </p>

          <p>
            Verified At:{" "}
            {formatDate(verification.verifiedAt)}
          </p>

          <p>
            Expires At:{" "}
            {formatDate(verification.expiresAt)}
          </p>
        </div>
      </div>

      {/* MONETIZATION */}

      <div className="mt-6 border-t border-border pt-5">
        <h4 className="flex items-center gap-2 font-semibold">
          <Wallet size={19} className="text-accent" />
          Monetization
        </h4>

        {!monetization.configured ? (
          <p className="mt-4 text-sm text-muted">
            This creator has not configured monetization.
          </p>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap gap-3">
              <StatusBadge
                enabled={monetization.isEnabled}
                label={
                  monetization.isEnabled
                    ? "Monetization Enabled"
                    : "Monetization Disabled"
                }
              />

              <StatusBadge
                enabled={monetization.subscription?.isEnabled}
                label="Subscriptions"
              />

              <StatusBadge
                enabled={monetization.paidMedia?.isEnabled}
                label="Paid Media"
              />

              <StatusBadge
                enabled={monetization.paidMessaging?.isEnabled}
                label="Paid Messaging"
              />

              <StatusBadge
                enabled={monetization.tips?.isEnabled}
                label="Tips"
              />
            </div>

            <div className="mt-5 space-y-3 text-sm">
              <p>
                Currency:{" "}
                <strong>
                  {monetization.currency || "KES"}
                </strong>
              </p>

              <p>
                Monthly Subscription Price:{" "}
                <strong>
                  {formatPrice(
                    monetization.subscription
                      ?.monthlyPriceMinor ?? 0,
                    monetization.currency || "KES"
                  )}
                </strong>
              </p>
            </div>
          </>
        )}
      </div>

      {/* APPLICATION */}

      <div className="mt-6 border-t border-border pt-5">
        <h4 className="font-semibold">
          Creator Application
        </h4>

        <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-muted">
          {application.motivation ||
            "No application motivation available."}
        </p>

        <div className="mt-4 space-y-2 text-xs text-muted">
          <p>
            Applied: {formatDate(application.appliedAt)}
          </p>

          <p>
            Approved: {formatDate(application.reviewedAt)}
          </p>
        </div>
      </div>
    </Card>
  );
}

/**
 * ============================================================
 * MAIN COMPONENT
 * ============================================================
 */

export default function AdminCreatorProfiles() {
  const [creators, setCreators] = useState([]);

  const [page, setPage] = useState(1);

  const [pagination, setPagination] = useState({
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    totalPages: 0,
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [selectedCreator, setSelectedCreator] =
    useState(null);

  const [detailsLoading, setDetailsLoading] =
    useState(false);

  const [detailsError, setDetailsError] =
    useState(null);

  const requestSequence = useRef(0);
  const detailsSequence = useRef(0);

  /**
   * LOAD CREATORS
   */
  const loadCreators = useCallback(async () => {
    const requestId = ++requestSequence.current;

    setLoading(true);
    setError(null);

    try {
      const response = await getAdminCreatorProfiles({
        page,
        limit: PAGE_SIZE,
      });

      if (requestId !== requestSequence.current) {
        return;
      }

      const result = response?.data;

      if (
        !Array.isArray(result?.creators) ||
        !result?.pagination
      ) {
        throw new Error(
          "Invalid creator profiles response."
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

      setCreators(result.creators);
      setPagination(result.pagination);
    } catch (requestError) {
      if (requestId !== requestSequence.current) {
        return;
      }

      setError(getErrorMessage(requestError));
      setCreators([]);
    } finally {
      if (requestId === requestSequence.current) {
        setLoading(false);
      }
    }
  }, [page]);

  useEffect(() => {
    loadCreators();

    return () => {
      requestSequence.current += 1;
    };
  }, [loadCreators]);

  useEffect(() => {
    return () => {
      detailsSequence.current += 1;
    };
  }, []);

  /**
   * REFRESH WHEN APPLICATION APPROVED
   */
  useEffect(() => {
    const handleApplicationReviewed = () => {
      loadCreators();
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
  }, [loadCreators]);

  /**
   * LOAD CREATOR DETAILS
   */
  const handleViewDetails = async (creatorId) => {
    const requestId = ++detailsSequence.current;

    setDetailsLoading(true);
    setDetailsError(null);
    setSelectedCreator(null);

    try {
      const response = await getAdminCreatorProfile(
        creatorId
      );

      if (requestId !== detailsSequence.current) {
        return;
      }

      const creator = response?.data?.creator;

      if (!creator) {
        throw new Error(
          "Creator profile details were not returned."
        );
      }

      setSelectedCreator(creator);
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

    setSelectedCreator(null);
    setDetailsError(null);
    setDetailsLoading(false);
  };

  const totalPages = Number(pagination.totalPages) || 0;

  return (
    <section
      aria-labelledby="admin-creator-profiles-title"
      className="mt-10"
    >
      {/* HEADER */}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Users size={26} className="text-accent" />

            <h2
              id="admin-creator-profiles-title"
              className="text-2xl font-bold"
            >
              Creator Profiles
            </h2>
          </div>

          <p className="mt-3 text-sm text-muted">
            Manage approved creators and inspect
            verification and monetization information.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          disabled={loading}
          onClick={loadCreators}
        >
          <RefreshCw
            size={16}
            className={loading ? "animate-spin" : ""}
          />
          Refresh
        </Button>
      </div>

      {/* ERROR */}

      {error && (
        <div className="mt-6">
          <Alert type="error">{error}</Alert>
        </div>
      )}

      {/* LOADING */}

      {loading && (
        <div className="mt-8 flex justify-center">
          <Spinner label="Loading creator profiles..." />
        </div>
      )}

      {/* EMPTY */}

      {!loading && !error && creators.length === 0 && (
        <Card className="mt-6 text-center">
          <UserRound
            size={42}
            className="mx-auto text-accent"
          />

          <h3 className="mt-4 text-lg font-semibold">
            No Creator Profiles
          </h3>

          <p className="mt-2 text-sm text-muted">
            No approved creator accounts were found.
          </p>
        </Card>
      )}

      {/* CREATOR CARDS */}

      {!loading && !error && creators.length > 0 && (
        <div className="mt-6 grid gap-5 md:grid-cols-2">
          {creators.map((creator) => (
            <Card key={creator.creatorId}>
              <div className="flex items-start gap-4">
                <CreatorAvatar creator={creator} />

                <div className="min-w-0 flex-1">
                  <h3 className="break-words text-lg font-semibold">
                    {creator.displayName}
                  </h3>

                  <p className="mt-1 break-all text-sm text-muted">
                    {creator.email}
                  </p>

                  <p className="mt-2 text-xs text-muted">
                    Joined {formatDate(creator.joinedAt)}
                  </p>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <StatusBadge
                  enabled={
                    creator.accountStatus === "ACTIVE"
                  }
                  label={creator.accountStatus}
                />

                <StatusBadge
                  enabled={
                    creator.ageVerification?.status ===
                    "VERIFIED"
                  }
                  label={
                    creator.ageVerification?.status ||
                    "Unverified"
                  }
                />

                <StatusBadge
                  enabled={creator.isPubliclyDiscoverable}
                  label={
                    creator.isPubliclyDiscoverable
                      ? "Publicly Discoverable"
                      : "Not Public"
                  }
                />

                <StatusBadge
                  enabled={
                    creator.monetization?.isEnabled
                  }
                  label="Monetization"
                />
              </div>

              <div className="mt-5 border-t border-border pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={detailsLoading}
                  onClick={() =>
                    handleViewDetails(creator.creatorId)
                  }
                >
                  <Eye size={16} />
                  View Profile
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* PAGINATION */}

      {!loading && !error && totalPages > 0 && (
        <div className="mt-8 flex items-center justify-between gap-4">
          <p className="text-sm text-muted">
            Page {page} of {totalPages} —{" "}
            {pagination.total} creators
          </p>

          <div className="flex gap-3">
            <Button
              variant="outline"
              size="sm"
              disabled={loading || page <= 1}
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
              disabled={loading || page >= totalPages}
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

      {/* DETAILS */}

      {detailsLoading && (
        <div className="mt-6">
          <Spinner label="Loading creator details..." />
        </div>
      )}

      {detailsError && (
        <div className="mt-6">
          <Alert type="error">{detailsError}</Alert>
        </div>
      )}

      {selectedCreator && (
        <CreatorDetails
          creator={selectedCreator}
          onClose={handleCloseDetails}
        />
      )}
    </section>
  );
}