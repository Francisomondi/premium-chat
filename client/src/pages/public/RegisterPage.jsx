
import { useState } from "react";

import {
  Link,
  Navigate,
  useLocation,
  useNavigate,
} from "react-router-dom";

import {
  UserPlus,
  UserRound,
  Mail,
  LockKeyhole,
  Eye,
  EyeOff,
} from "lucide-react";

import Card from "../../components/ui/Card.jsx";
import Alert from "../../components/ui/Alert.jsx";
import { useAuthStore } from "../../store/useAuthStore.js";
import { useUIStore } from "../../store/useUIStore.js";
import { validateAuthRedirect} from "../../utils/authRedirect.js";

/**
 * ============================================================
 * PREMIUMCHAT REGISTRATION PAGE
 * ============================================================
 *
 * Registration creates a user account.
 *
 * It does NOT automatically authenticate the user.
 *
 * Successful registration redirects to /login.
 *
 * Creator applications and identity/age verification
 * will be implemented separately.
 */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RegisterPage() {
  const navigate = useNavigate();
  
    /**
   * ==========================================================
   * STEP 4.2.5.6 — REGISTRATION REDIRECT CONTINUITY
   * ==========================================================
   */

  const location = useLocation();

  const requestedPath = location.state?.from;

  const safeReturnPath =
    validateAuthRedirect(requestedPath);

  const showNotification = useUIStore(
    (state) => state.showNotification
  );

  const register = useAuthStore((state) => state.register);
  const isLoading = useAuthStore((state) => state.isLoading);
  const isInitializing = useAuthStore(
    (state) => state.isInitializing
  );
  const isAuthenticated = useAuthStore(
    (state) => state.isAuthenticated
  );
  const authError = useAuthStore((state) => state.error);
  const clearError = useAuthStore((state) => state.clearError);

  const [form, setForm] = useState({
    displayName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const [fieldErrors, setFieldErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] =
    useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;

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

  const validateForm = () => {
    const errors = {};

    const displayName = form.displayName.trim();
    const email = form.email.trim();

    if (!displayName) {
      errors.displayName = "Display name is required.";
    } else if (displayName.length < 2) {
      errors.displayName =
        "Display name must contain at least 2 characters.";
    }

    if (!email) {
      errors.email = "Email address is required.";
    } else if (!EMAIL_REGEX.test(email)) {
      errors.email = "Enter a valid email address.";
    }

  if (!form.password) {
    errors.password = "Password is required.";
  } else if (form.password.length < 12) {
    errors.password =
      "Password must contain at least 12 characters.";
  }

    if (!form.confirmPassword) {
      errors.confirmPassword =
        "Please confirm your password.";
    } else if (form.password !== form.confirmPassword) {
      errors.confirmPassword = "Passwords do not match.";
    }

    setFieldErrors(errors);

    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (submitting || isLoading || isInitializing) {
      return;
    }

    clearError();

    if (!validateForm()) {
      return;
    }

    setSubmitting(true);

    try {
      await register({
        displayName: form.displayName.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
      });
      showNotification({
        type: "success",
        message:
          "Account created successfully! Welcome to PremiumChat. Please sign in to continue.",
      });

      setForm({
        displayName: "",
        email: "",
        password: "",
        confirmPassword: "",
      });

      navigate("/login", {
        replace: true,
        state: {
          registrationSuccess: true,
          ...(safeReturnPath
            ? { from: safeReturnPath }
            : {}),
        },
      });
    } catch {
      /**
       * The Zustand store provides the API error message.
       */
    } finally {
      setSubmitting(false);
    }
  };

  if (isInitializing) {
    return (
      <section className="flex min-h-[70vh] items-center justify-center px-4 py-16">
        <Card className="w-full max-w-md text-center">
          <div
            role="status"
            aria-label="Checking authentication"
            className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-border border-t-accent"
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
        to="/login"
        state={
          safeReturnPath
            ? { from: safeReturnPath }
            : undefined
        }
        replace
      />
    );
  }

  const busy = isLoading || submitting;

  const inputClass =
    "w-full rounded-xl border border-border bg-surface-light py-3 pl-11 pr-12 text-sm outline-none transition focus:border-accent disabled:opacity-60";

  return (
    <section className="flex min-h-[70vh] items-center justify-center px-4 py-16">
      <Card className="w-full max-w-md">
        <div className="text-center">
          <UserPlus
            size={32}
            className="mx-auto text-accent"
          />

          <h1 className="mt-5 text-3xl font-bold">
            Create Your Account
          </h1>

          <p className="mt-3 text-sm leading-7 text-muted">
            Join PremiumChat and connect with creators.
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

          {/* DISPLAY NAME */}

          <div>
            <label
              htmlFor="register-display-name"
              className="mb-2 block text-sm font-semibold"
            >
              Display name
            </label>

            <div className="relative">
              <UserRound
                size={18}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
              />

              <input
                id="register-display-name"
                name="displayName"
                type="text"
                autoComplete="nickname"
                maxLength={100}
                value={form.displayName}
                onChange={handleChange}
                disabled={busy}
                placeholder="Your display name"
                aria-invalid={Boolean(fieldErrors.displayName)}
                className={inputClass}
              />
            </div>

            {fieldErrors.displayName && (
              <p className="mt-2 text-sm text-red-500" role="alert">
                {fieldErrors.displayName}
              </p>
            )}
          </div>

          {/* EMAIL */}

          <div>
            <label
              htmlFor="register-email"
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
                id="register-email"
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
                className={inputClass}
              />
            </div>

            {fieldErrors.email && (
              <p className="mt-2 text-sm text-red-500" role="alert">
                {fieldErrors.email}
              </p>
            )}
          </div>

          {/* PASSWORD */}

          <div>
            <label
              htmlFor="register-password"
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
                id="register-password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={form.password}
                onChange={handleChange}
                disabled={busy}
                placeholder="Create a secure password"
                aria-invalid={Boolean(fieldErrors.password)}
                className={inputClass}
              />

              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  setShowPassword((previous) => !previous)
                }
                aria-label={
                  showPassword
                    ? "Hide password"
                    : "Show password"
                }
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-accent"
              >
                {showPassword ? (
                  <EyeOff size={19} />
                ) : (
                  <Eye size={19} />
                )}
              </button>
            </div>

            {fieldErrors.password && (
              <p className="mt-2 text-sm text-red-500" role="alert">
                {fieldErrors.password}
              </p>
            )}
          </div>

          {/* CONFIRM PASSWORD */}

          <div>
            <label
              htmlFor="register-confirm-password"
              className="mb-2 block text-sm font-semibold"
            >
              Confirm password
            </label>

            <div className="relative">
              <LockKeyhole
                size={18}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
              />

              <input
                id="register-confirm-password"
                name="confirmPassword"
                type={
                  showConfirmPassword ? "text" : "password"
                }
                autoComplete="new-password"
                value={form.confirmPassword}
                onChange={handleChange}
                disabled={busy}
                placeholder="Repeat your password"
                aria-invalid={Boolean(
                  fieldErrors.confirmPassword
                )}
                className={inputClass}
              />

              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  setShowConfirmPassword(
                    (previous) => !previous
                  )
                }
                aria-label={
                  showConfirmPassword
                    ? "Hide confirmation password"
                    : "Show confirmation password"
                }
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-accent"
              >
                {showConfirmPassword ? (
                  <EyeOff size={19} />
                ) : (
                  <Eye size={19} />
                )}
              </button>
            </div>

            {fieldErrors.confirmPassword && (
              <p className="mt-2 text-sm text-red-500" role="alert">
                {fieldErrors.confirmPassword}
              </p>
            )}
          </div>

          {/* AGE NOTICE */}

          <Alert type="info">
            PremiumChat is for adults aged 18 and above.
            Age verification will be required before
            accessing age-restricted features.
          </Alert>

          {/* SUBMIT */}

          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-5 py-3 font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? (
              <>
                <span
                  aria-hidden="true"
                  className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
                />
                Creating account...
              </>
            ) : (
              <>
                <UserPlus size={18} />
                Create Account
              </>
            )}
          </button>
        </form>

        <p className="mt-7 text-center text-sm text-muted">
          Already have an account?{" "}
          <Link
            to="/login"
            state={
              safeReturnPath
                ? { from: safeReturnPath }
                : undefined
            }
            className="font-semibold text-accent hover:underline"
          >
            Sign in
          </Link>
        </p>
      </Card>
    </section>
  );
}
