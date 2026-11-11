
import {
  useEffect,
  useState,
} from "react";

import {
  useLocation,
  useNavigate,
} from "react-router-dom";

import {
  submitDateOfBirth,
} from "../../api/services/authService.js";

import { useAuthStore } from "../../store/useAuthStore.js";

const getToday = () => {
  const today = new Date();

  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const getErrorMessage = (error) => {
  return (
    error?.apiError?.message ||
    error?.response?.data?.message ||
    error?.message ||
    "Unable to submit your date of birth. Please try again."
  );
};

const getDashboardPath = (user) => {
  if (
    user?.role === "ADMIN" &&
    user?.accountStatus === "ACTIVE"
  ) {
    return "/admin/dashboard";
  }

  const hasApprovedCreatorAccess =
    user?.role === "CREATOR" &&
    user?.accountStatus === "ACTIVE" &&
    user?.creatorApplicationStatus === "APPROVED" &&
    user?.ageVerificationStatus === "VERIFIED";

  if (hasApprovedCreatorAccess) {
    return "/creator/dashboard";
  }

  return "/dashboard";
};

const getReturnPath = (location, user) => {
  const requestedPath = location.state?.from;

  if (
    typeof requestedPath === "string" &&
    requestedPath.startsWith("/") &&
    !requestedPath.startsWith("//") &&
    !requestedPath.startsWith("/age-verification")
  ) {
    return requestedPath;
  }

  if (
    requestedPath &&
    typeof requestedPath === "object"
  ) {
    const pathname = requestedPath.pathname || "";

    if (
      pathname.startsWith("/") &&
      !pathname.startsWith("//") &&
      !pathname.startsWith("/age-verification")
    ) {
      return (
        pathname +
        (requestedPath.search || "") +
        (requestedPath.hash || "")
      );
    }
  }

  return getDashboardPath(user);
};

export default function AgeVerificationPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const user = useAuthStore((state) => state.user);

  const refreshAuthenticatedUser = useAuthStore(
    (state) => state.refreshAuthenticatedUser
  );

  const [dateOfBirth, setDateOfBirth] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  /**
   * Already-verified users should not remain
   * on the age-verification page.
   */
  useEffect(() => {
    if (user?.ageVerificationStatus === "VERIFIED") {
      navigate(
        getReturnPath(location, user),
        { replace: true }
      );
    }
  }, [user, location, navigate]);

  const handleSubmit = async (event) => {
    event.preventDefault();

    setError("");

    if (!dateOfBirth) {
      setError("Please enter your date of birth.");
      return;
    }

    setIsSubmitting(true);

    try {
      await submitDateOfBirth({
        dateOfBirth,
      });

      const updatedUser =
        await refreshAuthenticatedUser();

      if (!updatedUser) {
        throw new Error(
          "Your session could not be refreshed. Please sign in again."
        );
      }

      if (
        updatedUser.ageVerificationStatus !== "VERIFIED"
      ) {
        throw new Error(
          "Your age verification could not be confirmed. Please try again."
        );
      }

      navigate(
        getReturnPath(location, updatedUser),
        { replace: true }
      );
    } catch (submissionError) {
      setError(getErrorMessage(submissionError));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-[75vh] items-center justify-center px-4 py-12">
      <section className="w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-sm sm:p-8">
        <div className="mb-6">
          <p className="text-sm font-semibold uppercase tracking-wider text-accent">
            Account verification
          </p>

          <h1 className="mt-3 text-2xl font-bold text-foreground sm:text-3xl">
            Confirm your age
          </h1>

          <p className="mt-3 text-sm leading-7 text-muted">
            PremiumChat is intended for adults aged 18 and
            above. Enter your date of birth to complete the
            self-declared age check before accessing your account.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-5"
        >
          <div>
            <label
              htmlFor="dateOfBirth"
              className="mb-2 block text-sm font-medium text-foreground"
            >
              Date of birth
            </label>

            <input
              id="dateOfBirth"
              name="dateOfBirth"
              type="date"
              value={dateOfBirth}
              max={getToday()}
              onChange={(event) => {
                setDateOfBirth(event.target.value);
                setError("");
              }}
              required
              disabled={isSubmitting}
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>

          <div className="rounded-xl border border-border bg-background p-4">
            <p className="text-sm leading-6 text-muted">
              By continuing, you confirm that the date you
              provide is accurate and that you are at least
              18 years old.
            </p>

            <p className="mt-2 text-xs leading-5 text-muted">
              This is a self-declared age check. It does not
              independently verify your identity or prove
              your actual age.
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600"
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting || !dateOfBirth}
            className="w-full rounded-xl bg-accent px-5 py-3 font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting
              ? "Submitting..."
              : "Confirm date of birth"}
          </button>
        </form>

        <p className="mt-5 text-center text-xs text-muted">
          Signed in as {user?.email}
        </p>
      </section>
    </main>
  );
}
