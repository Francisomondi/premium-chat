
import { useState } from "react";

import {
  NavLink,
  Link,
  useNavigate,
} from "react-router-dom";

import {
  Menu,
  X,
  MessageCircleHeart,
  LayoutDashboard,
  LogOut,
  UserRound,
} from "lucide-react";

import Button from "../ui/Button.jsx";

import { useAuthStore } from "../../store/useAuthStore.js";
import { useUIStore } from "../../store/useUIStore.js";

/**
 * ============================================================
 * PREMIUMCHAT NAVBAR
 * ============================================================
 *
 * Features:
 * - Responsive desktop and mobile navigation
 * - Authentication-aware navigation
 * - Role-based dashboard links
 * - Creator eligibility-aware navigation
 * - Authenticated user display name
 * - Secure session logout
 * - Loading states
 * - Notification feedback
 */

const navigationLinks = [
  { label: "Home", path: "/" },
  { label: "Explore Creators", path: "/explore" },
];

/**
 * ============================================================
 * GET DASHBOARD PATH
 * ============================================================
 *
 * Determines the appropriate dashboard using the
 * authenticated user's account information.
 *
 * IMPORTANT:
 * This is a frontend navigation check only.
 * The backend must independently enforce permissions,
 * including verification expiry.
 */

const getDashboardPath = (user) => {
  if (!user) {
    return "/dashboard";
  }

  if (
    user.role === "ADMIN" &&
    user.accountStatus === "ACTIVE"
  ) {
    return "/admin/dashboard";
  }

  if (
    user.role === "CREATOR" &&
    user.accountStatus === "ACTIVE" &&
    user.ageVerificationStatus === "VERIFIED" &&
    user.creatorApplicationStatus === "APPROVED"
  ) {
    return "/creator/dashboard";
  }

  return "/dashboard";
};

export default function Navbar() {
  const navigate = useNavigate();

  const [menuOpen, setMenuOpen] = useState(false);

  /**
   * ==========================================================
   * ZUSTAND AUTHENTICATION
   * ==========================================================
   */

  const user = useAuthStore(
    (state) => state.user
  );

  const isAuthenticated = useAuthStore(
    (state) => state.isAuthenticated
  );

  const isInitializing = useAuthStore(
    (state) => state.isInitializing
  );

  const isLoading = useAuthStore(
    (state) => state.isLoading
  );

  const logout = useAuthStore(
    (state) => state.logout
  );

  const showNotification = useUIStore(
    (state) => state.showNotification
  );

  /**
   * ==========================================================
   * NAVIGATION HELPERS
   * ==========================================================
   */

  const closeMenu = () => {
    setMenuOpen(false);
  };

  const dashboardPath = getDashboardPath(user);

  /**
   * ==========================================================
   * LOGOUT
   * ==========================================================
   */

  const handleLogout = async () => {
    if (isLoading || isInitializing) {
      return;
    }

    try {
      await logout();

      closeMenu();

      navigate("/", {
        replace: true,
      });

      showNotification({
        type: "success",
        message:
          "You have been logged out successfully.",
      });
    } catch (error) {
      showNotification({
        type: "error",
        message:
          error?.apiError?.message ||
          error?.response?.data?.message ||
          "Unable to log out. Please try again.",
      });
    }
  };

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur-xl">
      <div className="page-container flex min-h-19 items-center justify-between gap-5">
        {/* ============================================= */}
        {/* BRANDING                                      */}
        {/* ============================================= */}

        <Link
          to="/"
          onClick={closeMenu}
          className="flex items-center gap-2 text-xl font-extrabold text-accent"
        >
          <MessageCircleHeart size={28} />
          <span>PremiumChat</span>
        </Link>

        {/* ============================================= */}
        {/* NAVIGATION                                    */}
        {/* ============================================= */}

        <nav
          id="premiumchat-navigation"
          aria-label="Main navigation"
          className={[
            "absolute left-0 right-0 top-full border-b border-border",
            "bg-surface p-5 md:static md:flex md:items-center",
            "md:gap-7 md:border-0 md:bg-transparent md:p-0",
            menuOpen ? "block" : "hidden md:flex",
          ].join(" ")}
        >
          {/* PUBLIC LINKS */}

          <div className="flex flex-col gap-5 md:flex-row md:items-center md:gap-7">
            {navigationLinks.map((link) => (
              <NavLink
                key={link.path}
                to={link.path}
                end={link.path === "/"}
                onClick={closeMenu}
                className={({ isActive }) =>
                  [
                    "text-sm font-medium transition-colors",
                    isActive
                      ? "text-accent"
                      : "text-muted hover:text-foreground",
                  ].join(" ")
                }
              >
                {link.label}
              </NavLink>
            ))}
          </div>

          {/* AUTHENTICATION ACTIONS */}

          <div className="mt-5 flex flex-col gap-3 md:ml-7 md:mt-0 md:flex-row md:items-center">
            {isInitializing ? (
              <span
                className="text-sm text-muted"
                role="status"
              >
                Checking session...
              </span>
            ) : isAuthenticated && user ? (
              <>
                {/* USER NAME */}

                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <UserRound
                    size={18}
                    className="text-accent"
                  />

                  <span className="max-w-35 truncate">
                    {user.displayName || "My Account"}
                  </span>
                </div>

                {/* DASHBOARD */}

                <NavLink
                  to={dashboardPath}
                  onClick={closeMenu}
                  className={({ isActive }) =>
                    [
                      "inline-flex items-center justify-center gap-2",
                      "rounded-lg border border-border px-4 py-2",
                      "text-sm font-semibold transition-colors",
                      isActive
                        ? "border-accent text-accent"
                        : "text-foreground hover:border-accent hover:text-accent",
                    ].join(" ")
                  }
                >
                  <LayoutDashboard size={17} />
                  Dashboard
                </NavLink>

                {/* LOGOUT */}

                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={isLoading}
                  className={[
                    "inline-flex items-center justify-center gap-2",
                    "rounded-lg bg-accent px-4 py-2",
                    "text-sm font-semibold text-white",
                    "transition-opacity hover:opacity-90",
                    "disabled:cursor-not-allowed disabled:opacity-60",
                  ].join(" ")}
                >
                  <LogOut size={17} />

                  {isLoading
                    ? "Signing out..."
                    : "Logout"}
                </button>
              </>
            ) : (
              <>
                {/* LOGIN */}

                <Button
                  to="/login"
                  variant="outline"
                  onClick={closeMenu}
                >
                  Login
                </Button>

                {/* REGISTER */}

                <Button
                  to="/register"
                  variant="accent"
                  onClick={closeMenu}
                >
                  Get Started
                </Button>
              </>
            )}
          </div>
        </nav>

        {/* ============================================= */}
        {/* MOBILE MENU TOGGLE                            */}
        {/* ============================================= */}

        <button
          type="button"
          className="rounded-lg p-2 text-foreground md:hidden"
          onClick={() =>
            setMenuOpen((previous) => !previous)
          }
          aria-label={
            menuOpen ? "Close menu" : "Open menu"
          }
          aria-expanded={menuOpen}
          aria-controls="premiumchat-navigation"
        >
          {menuOpen ? (
            <X size={24} />
          ) : (
            <Menu size={24} />
          )}
        </button>
      </div>
    </header>
  );
}
