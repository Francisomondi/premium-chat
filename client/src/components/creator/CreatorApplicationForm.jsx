
import { useCallback, useEffect, useState } from "react";

import {
  BadgeCheck,
  Clock3,
  FileText,
  LoaderCircle,
  RefreshCw,
  Send,
  ShieldCheck,
  XCircle,
} from "lucide-react";

import {
  getMyCreatorApplication,
  submitCreatorApplication,
} from "../../api/services/creatorApplicationService.js";

import { useAuthStore } from "../../store/useAuthStore.js";

/**
 * ============================================================
 * PREMIUMCHAT CREATOR APPLICATION FORM
 * ============================================================
 *
 * Responsibilities:
 *
 * 1. Load the user's current application.
 * 2. Display the application form when eligible.
 * 3. Validate motivation.
 * 4. Submit an application.
 * 5. Display the current application status.
 *
 * The backend remains responsible for:
 *
 * - Authentication
 * - Application eligibility
 * - Duplicate prevention
 * - Creator role assignment
 * - Age verification requirements
 */

const MIN_LENGTH = 30;
const MAX_LENGTH = 1000;

const APPLICATION_STATUSES = {
  NOT_APPLIED: "NOT_APPLIED",
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
};

/**
 * ============================================================
 * ERROR MESSAGE HELPER
 * ============================================================
 */

const getErrorMessage = (error) => {
  if (error?.apiError?.message) {
    return error.apiError.message;
  }

  if (error?.response?.data?.message) {
    return error.response.data.message;
  }

  if (error?.message) {
    return error.message;
  }

  return "Something went wrong. Please try again.";
};

/**
 * ============================================================
 * DATE FORMATTER
 * ============================================================
 */

const formatDate = (value) => {
  if (!value) {
    return "Not available";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

/**
 * ============================================================
 * COMPONENT
 * ============================================================
 */

export default function CreatorApplicationForm() {
  const refreshAuthenticatedUser = useAuthStore(
    (state) => state.refreshAuthenticatedUser
  );

  const [application, setApplication] = useState(null);

  const [motivation, setMotivation] = useState("");

  const [isLoading, setIsLoading] = useState(true);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const [error, setError] = useState("");

  const [successMessage, setSuccessMessage] = useState("");

  /**
   * ==========================================================
   * LOAD APPLICATION STATUS
   * ==========================================================
   */

  const loadApplication = useCallback(async () => {
    setIsLoading(true);
    setError("");

    try {
      const response =
        await getMyCreatorApplication();

      const applicationData =
        response?.data?.application;

      if (!applicationData) {
        throw new Error(
          "Unable to retrieve your creator application."
        );
      }

      setApplication(applicationData);

        /*
        * Refresh account information after retrieving
        * the latest creator application status.
        *
        * This also picks up administrator role changes.
        */

        try {
        await refreshAuthenticatedUser();
        } catch {
        /*
        * The application status was retrieved successfully.
        * Keep it visible even if account refresh fails.
        */
        }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [refreshAuthenticatedUser]);

  useEffect(() => {
    loadApplication();
  }, [loadApplication]);

  /**
   * ==========================================================
   * MOTIVATION VALIDATION
   * ==========================================================
   */

  const normalizedMotivation = motivation.trim();

  const characterCount =
    normalizedMotivation.length;

  const isMotivationValid =
    characterCount >= MIN_LENGTH &&
    characterCount <= MAX_LENGTH;

  const applicationStatus =
    application?.status ??
    APPLICATION_STATUSES.NOT_APPLIED;

  /**
   * ==========================================================
   * SUBMIT APPLICATION
   * ==========================================================
   */

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (isSubmitting || !isMotivationValid) {
      return;
    }

    if (
      applicationStatus !==
      APPLICATION_STATUSES.NOT_APPLIED
    ) {
      return;
    }

    setIsSubmitting(true);
    setError("");
    setSuccessMessage("");

    try {
      const response =
        await submitCreatorApplication(
          normalizedMotivation
        );

      const submittedApplication =
        response?.data?.application;

      if (!submittedApplication) {
        throw new Error(
          "The server returned an invalid application response."
        );
      }

    /*
    * The backend has successfully saved the application.
    * Update the local application view immediately.
    */

    setApplication(submittedApplication);

    setMotivation("");

    setSuccessMessage(
    "Your creator application has been submitted successfully."
    );

    /*
    * Refresh the authenticated user from the backend.
    *
    * This updates the Creator Eligibility card
    * through its existing Zustand subscription.
    *
    * A refresh failure must not make a successfully
    * submitted application appear unsuccessful.
    */

    try {
    const refreshedUser =
        await refreshAuthenticatedUser();

    if (!refreshedUser) {
        setError(
        "Your application was submitted, but your session could not be refreshed. Please sign in again if necessary."
        );
    }
    } catch {
    setError(
        "Your application was submitted, but the account overview could not be refreshed. Please reload the dashboard."
    );
    }
    } catch (err) {
      setError(getErrorMessage(err));

      /**
       * A conflicting application may already exist.
       * Refresh the server-side status so the UI
       * does not continue showing an outdated form.
       */
      if (err?.response?.status === 409) {
        try {
          const response =
            await getMyCreatorApplication();

          if (response?.data?.application) {
            setApplication(
              response.data.application
            );
          }
        } catch {
          // Preserve the original submission error.
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * ==========================================================
   * LOADING STATE
   * ==========================================================
   */

  if (isLoading) {
    return (
      <section
        className="rounded-2xl border border-border bg-surface p-6"
        aria-busy="true"
      >
        <div className="flex items-center gap-3">
          <LoaderCircle
            size={22}
            className="animate-spin text-accent"
          />

          <p className="text-sm text-muted">
            Loading your creator application...
          </p>
        </div>
      </section>
    );
  }

  /**
   * ==========================================================
   * APPLICATION UI
   * ==========================================================
   */

  return (
    <section className="rounded-2xl border border-border bg-surface p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <FileText
              size={24}
              className="text-accent"
            />

            <h2 className="text-xl font-bold">
              Become a Creator
            </h2>
          </div>

          <p className="mt-2 text-sm leading-6 text-muted">
            Apply to share content and connect with
            your audience on PremiumChat.
          </p>
        </div>

        <button
          type="button"
          onClick={loadApplication}
          disabled={isSubmitting}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium transition-opacity hover:opacity-75 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw size={16} />

          Refresh Status
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="mt-5 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-600"
        >
          {error}
        </div>
      )}

      {successMessage && (
        <div
          role="status"
          className="mt-5 rounded-lg border border-green-500/30 bg-green-500/10 p-4 text-sm text-green-700"
        >
          {successMessage}
        </div>
      )}

      {/* =============================================== */}
      {/* NOT APPLIED                                     */}
      {/* =============================================== */}

      {applicationStatus ===
        APPLICATION_STATUSES.NOT_APPLIED && (
        <form
          onSubmit={handleSubmit}
          className="mt-6 space-y-5"
        >
          <div>
            <label
              htmlFor="creator-motivation"
              className="block text-sm font-semibold"
            >
              Why do you want to become a creator?
            </label>

            <p className="mt-2 text-sm leading-6 text-muted">
              Describe the content you plan to
              create, your audience, and what
              you hope to achieve.
            </p>

            <textarea
              id="creator-motivation"
              name="motivation"
              rows={6}
              value={motivation}
              onChange={(event) =>
                setMotivation(event.target.value)
              }
              maxLength={MAX_LENGTH}
              disabled={isSubmitting}
              required
              aria-describedby="creator-motivation-help"
              className="mt-4 w-full resize-y rounded-xl border border-border bg-background p-4 text-sm outline-none transition-colors focus:border-accent disabled:opacity-60"
              placeholder="Tell us about your creator plans..."
            />

            <div
              id="creator-motivation-help"
              className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted"
            >
              <span>
                Minimum {MIN_LENGTH} characters,
                maximum {MAX_LENGTH}.
              </span>

              <span>
                {characterCount}/{MAX_LENGTH}
              </span>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-xl border border-border p-4">
            <ShieldCheck
              size={20}
              className="mt-0.5 shrink-0 text-accent"
            />

            <p className="text-sm leading-6 text-muted">
              Applications are reviewed before
              creator privileges are granted.
              Additional identity or age verification
              may be required for restricted features.
            </p>
          </div>

          <button
            type="submit"
            disabled={
              isSubmitting ||
              !isMotivationValid
            }
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <LoaderCircle
                  size={18}
                  className="animate-spin"
                />

                Submitting...
              </>
            ) : (
              <>
                <Send size={18} />

                Submit Application
              </>
            )}
          </button>
        </form>
      )}

      {/* =============================================== */}
      {/* PENDING                                         */}
      {/* =============================================== */}

      {applicationStatus ===
        APPLICATION_STATUSES.PENDING && (
        <div className="mt-6 rounded-xl border border-amber-500/30 p-5">
          <div className="flex items-center gap-3">
            <Clock3
              size={24}
              className="text-amber-500"
            />

            <h3 className="font-semibold">
              Application Under Review
            </h3>
          </div>

          <p className="mt-3 text-sm leading-6 text-muted">
            Your application has been received
            and is awaiting administrator review.
          </p>

          <p className="mt-3 text-xs text-muted">
            Submitted:{" "}
            {formatDate(application?.appliedAt)}
          </p>
        </div>
      )}

      {/* =============================================== */}
      {/* APPROVED                                        */}
      {/* =============================================== */}

      {applicationStatus ===
        APPLICATION_STATUSES.APPROVED && (
        <div className="mt-6 rounded-xl border border-green-500/30 p-5">
          <div className="flex items-center gap-3">
            <BadgeCheck
              size={24}
              className="text-green-600"
            />

            <h3 className="font-semibold">
              Application Approved
            </h3>
          </div>

          <p className="mt-3 text-sm leading-6 text-muted">
            Your creator application has been
            approved. Creator features remain
            subject to applicable account and
            verification requirements.
          </p>

          <p className="mt-3 text-xs text-muted">
            Reviewed:{" "}
            {formatDate(application?.reviewedAt)}
          </p>
        </div>
      )}

      {/* =============================================== */}
      {/* REJECTED                                        */}
      {/* =============================================== */}

      {applicationStatus ===
        APPLICATION_STATUSES.REJECTED && (
        <div className="mt-6 rounded-xl border border-red-500/30 p-5">
          <div className="flex items-center gap-3">
            <XCircle
              size={24}
              className="text-red-600"
            />

            <h3 className="font-semibold">
              Application Not Approved
            </h3>
          </div>

          <p className="mt-3 text-sm leading-6 text-muted">
            Your creator application was not
            approved. Reapplication is not
            currently available.
          </p>

          <p className="mt-3 text-xs text-muted">
            Reviewed:{" "}
            {formatDate(application?.reviewedAt)}
          </p>
        </div>
      )}

      {/* =============================================== */}
      {/* UNKNOWN STATUS                                  */}
      {/* =============================================== */}

      {!Object.values(
        APPLICATION_STATUSES
      ).includes(applicationStatus) && (
        <p className="mt-5 text-sm text-muted">
          Your application status could not
          be recognized. Please refresh.
        </p>
      )}
    </section>
  );
}
