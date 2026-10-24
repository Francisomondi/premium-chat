
import {
  useEffect,
  useState,
} from "react";

import {
  Link,
  Navigate,
  useLocation,
  useNavigate,
} from "react-router-dom";

import {
  LogIn,
  Mail,
  LockKeyhole,
  Eye,
  EyeOff,
} from "lucide-react";

import Card from "../../components/ui/Card.jsx";
import Alert from "../../components/ui/Alert.jsx";

import { useAuthStore } from "../../store/useAuthStore.js";

/**
 * ============================================================
 * PREMIUMCHAT LOGIN PAGE
 * ============================================================
 *
 * Authentication uses:
 *
 * - Zustand for user state
 * - Axios for API requests
 * - HTTP-only cookies for session authentication
 *
 * Never store JWTs in localStorage.
 */

const EMAIL_REGEX =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  /**
 * Return the appropriate dashboard for the user's role.
 *
 * Creator dashboard access requires approved creator
 * status and completed age verification.
 */
const getDashboardPath = (user) => {
  if (
    user?.role === "ADMIN" &&
    user?.accountStatus === "ACTIVE"
  ) {
    return "/admin/dashboard";
  }

  if (
    user?.role === "CREATOR" &&
    user?.accountStatus === "ACTIVE" &&
    user?.ageVerificationStatus === "VERIFIED" &&
    user?.creatorApplicationStatus === "APPROVED"
  ) {
    return "/creator/dashboard";
  }

  return "/dashboard";
};

/**
 * Only restore a known, authorized protected route.
 *
 * Do not accept arbitrary URLs or external redirects.
 */
const getSafeRedirectPath = (requestedPath, user) => {
  const fallback = getDashboardPath(user);

  if (
    typeof requestedPath !== "string" ||
    !requestedPath.startsWith("/") ||
    requestedPath.startsWith("//") ||
    requestedPath.includes("\\") ||
    requestedPath.includes("\n") ||
    requestedPath.includes("\r")
  ) {
    return fallback;
  }

  let pathname;

  try {
    const url = new URL(requestedPath, "http://premiumchat.local");

    if (url.origin !== "http://premiumchat.local") {
      return fallback;
    }

    pathname = url.pathname;
  } catch {
    return fallback;
  }

  const allowedPaths = new Set([
    "/dashboard",
    "/creator/dashboard",
    "/admin/dashboard",
  ]);

  if (!allowedPaths.has(pathname)) {
    return fallback;
  }

  if (
    pathname === "/admin/dashboard" &&
    fallback !== "/admin/dashboard"
  ) {
    return fallback;
  }

  if (
    pathname === "/creator/dashboard" &&
    fallback !== "/creator/dashboard"
  ) {
    return fallback;
  }

  return requestedPath;
};

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();

  /**
   * ==========================================================
   * ZUSTAND AUTHENTICATION
   * ==========================================================
   */

  const login = useAuthStore(
    (state) => state.login
  );

  const isAuthenticated = useAuthStore(
    (state) => state.isAuthenticated
  );

  const user = useAuthStore(
    (state) => state.user
  );

  const isInitializing = useAuthStore(
    (state) => state.isInitializing
  );

  const isLoading = useAuthStore(
    (state) => state.isLoading
  );

  const authError = useAuthStore(
    (state) => state.error
  );

  const clearError = useAuthStore(
    (state) => state.clearError
  );

  /**
   * ==========================================================
   * LOCAL FORM STATE
   * ==========================================================
   */

  const [form, setForm] = useState({
    email: "",
    password: "",
  });

  const [fieldErrors, setFieldErrors] = useState({});

  const [showPassword, setShowPassword] =
    useState(false);

  /**
   * Prevent duplicate submissions immediately,
   * before Zustand triggers a rerender.
   */
  const [submitting, setSubmitting] = useState(false);

  /**
   * Restore the original protected destination
   * when supplied by a future ProtectedRoute.
   *
   * Only accept internal application paths.
   */

  const requestedPath = location.state?.from;

  const redirectTo = getSafeRedirectPath(
    requestedPath,
    user
  );

  /**
   * ==========================================================
   * CLEAN UP PREVIOUS AUTHENTICATION ERRORS
   * ==========================================================
   */

  useEffect(() => {
    clearError();

    return () => {
      clearError();
    };
  }, [clearError]);

  /**
   * ==========================================================
   * INPUT HANDLING
   * ==========================================================
   */

  const handleChange = (event) => {
    const {
      name,
      value,
    } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));

    setFieldErrors((previous) => ({
      ...previous,
      [name]: "",
    }));

    if (authError) {
      clearError();
    }
  };

  /**
   * ==========================================================
   * FORM VALIDATION
   * ==========================================================
   */

  const validateForm = () => {
    const errors = {};

    const email = form.email.trim();

    if (!email) {
      errors.email = "Email address is required.";
    } else if (!EMAIL_REGEX.test(email)) {
      errors.email = "Enter a valid email address.";
    }

    if (!form.password) {
      errors.password = "Password is required.";
    }

    setFieldErrors(errors);

    return Object.keys(errors).length === 0;
  };

  /**
   * ==========================================================
   * LOGIN SUBMISSION
   * ==========================================================
   */

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (submitting || isLoading || isInitializing) {
      return;
    }

    if (!validateForm()) {
      return;
    }

    setSubmitting(true);
    clearError();

    try {
      const authenticatedUser = await login({
        email: form.email.trim().toLowerCase(),
        password: form.password,
      });

      /**
       * Clear password from local form state.
       */
      setForm((previous) => ({
        ...previous,
        password: "",
      }));

      navigate(
        getSafeRedirectPath(
          requestedPath,
          authenticatedUser
        ),
        {
          replace: true,
        }
      );
      
    } catch {
      /**
       * The Zustand store handles the error message.
       */
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * ==========================================================
   * EXISTING AUTHENTICATED SESSION
   * ==========================================================
   */

  if (isInitializing) {
    return (
      <section className="flex min-h-[70vh] items-center justify-center px-4 py-16">
        <Card className="w-full max-w-md text-center">
          <div
            className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-border border-t-accent"
            role="status"
            aria-label="Checking authentication"
          />

          <p className="mt-5 text-sm text-muted">
            Checking your session...
          </p>
        </Card>
      </section>
    );
  }

  if (isAuthenticated) {
    return (
      <Navigate
        to={redirectTo}
        replace
      />
    );
  }

  const busy = isLoading || submitting;

  /**
   * ==========================================================
   * LOGIN FORM
   * ==========================================================
   */

  return (
    <section className="flex min-h-[70vh] items-center justify-center px-4 py-16">
      <Card className="w-full max-w-md">
        <div className="text-center">
          <LogIn
            size={32}
            className="mx-auto text-accent"
          />

          <h1 className="mt-5 text-3xl font-bold">
            Welcome Back
          </h1>

          <p className="mt-3 text-sm leading-7 text-muted">
            Sign in to continue your creator experience.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          noValidate
          className="mt-8 space-y-5"
        >
          {authError && (
            <Alert type="error">
              {authError}
            </Alert>
          )}

          {/* EMAIL */}

          <div>
            <label
              htmlFor="login-email"
              className="mb-2 block text-sm font-semibold"
            >
              Email address
            </label>

            <div className="relative">
              <Mail
                size={18}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
              />

              <input
                id="login-email"
                name="email"
                type="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                value={form.email}
                onChange={handleChange}
                disabled={busy}
                placeholder="you@example.com"
                aria-invalid={Boolean(fieldErrors.email)}
                aria-describedby={
                  fieldErrors.email
                    ? "login-email-error"
                    : undefined
                }
                className="w-full rounded-xl border border-border bg-surface-light py-3 pl-11 pr-4 text-sm outline-none transition focus:border-accent disabled:opacity-60"
              />
            </div>

            {fieldErrors.email && (
              <p
                id="login-email-error"
                className="mt-2 text-sm text-red-500"
                role="alert"
              >
                {fieldErrors.email}
              </p>
            )}
          </div>

          {/* PASSWORD */}

          <div>
            <label
              htmlFor="login-password"
              className="mb-2 block text-sm font-semibold"
            >
              Password
            </label>

            <div className="relative">
              <LockKeyhole
                size={18}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
              />

              <input
                id="login-password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={form.password}
                onChange={handleChange}
                disabled={busy}
                placeholder="Enter your password"
                aria-invalid={Boolean(fieldErrors.password)}
                aria-describedby={
                  fieldErrors.password
                    ? "login-password-error"
                    : undefined
                }
                className="w-full rounded-xl border border-border bg-surface-light py-3 pl-11 pr-12 text-sm outline-none transition focus:border-accent disabled:opacity-60"
              />

              <button
                type="button"
                onClick={() =>
                  setShowPassword((previous) => !previous)
                }
                disabled={busy}
                aria-label={
                  showPassword
                    ? "Hide password"
                    : "Show password"
                }
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted transition hover:text-accent disabled:opacity-60"
              >
                {showPassword ? (
                  <EyeOff size={19} />
                ) : (
                  <Eye size={19} />
                )}
              </button>
            </div>

            {fieldErrors.password && (
              <p
                id="login-password-error"
                className="mt-2 text-sm text-red-500"
                role="alert"
              >
                {fieldErrors.password}
              </p>
            )}
          </div>

          {/* SUBMIT */}

          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-5 py-3 font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? (
              <>
                <span
                  className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
                  aria-hidden="true"
                />

                Signing in...
              </>
            ) : (
              <>
                <LogIn size={18} />
                Sign In
              </>
            )}
          </button>
        </form>

        <p className="mt-7 text-center text-sm text-muted">
          Don't have an account?{" "}
          <Link
            to="/register"
            className="font-semibold text-accent hover:underline"
          >
            Create an account
          </Link>
        </p>
      </Card>
    </section>
  );
}
