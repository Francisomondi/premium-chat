import { useEffect, useState } from "react";

import {
  Link,
  NavLink,
  useLocation,
  useNavigate,
} from "react-router-dom";

import {
  Crown,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareText,
  Search,
  UserRound,
  X,
} from "lucide-react";

import { useAuthStore } from "../../store/useAuthStore.js";
import { useUIStore } from "../../store/useUIStore.js";

/**
 * ============================================================
 * PREMIUMCHAT — RESPONSIVE PREMIUM NAVBAR
 * ============================================================
 *
 * STEP 4.1.2 — RESPONSIVE IMPROVEMENTS
 *
 * Features:
 * - Compact black-and-gold navigation
 * - Responsive desktop/mobile layouts
 * - Home and Pricing links removed
 * - Compact navigation and authentication buttons
 * - Creator search
 * - Authenticated Messages navigation
 * - Role-based dashboard navigation
 * - Secure logout
 * - Active route highlighting
 */

/**
 * ============================================================
 * PUBLIC NAVIGATION
 * ============================================================
 */

const publicLinks = [
  {
    label: "Explore ",
    path: "/explore",
  },

  {
    label: "How It Works",
    path: "/#how-it-works",
  },
];

/**
 * ============================================================
 * DASHBOARD PATH
 * ============================================================
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

/**
 * ============================================================
 * NAVBAR
 * ============================================================
 */

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();

  const [menuOpen, setMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  /**
   * ==========================================================
   * AUTH STORE
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

  /**
   * ==========================================================
   * UI STORE
   * ==========================================================
   */

  const showNotification = useUIStore(
    (state) => state.showNotification
  );

  const dashboardPath = getDashboardPath(user);

  /**
   * ==========================================================
   * CLOSE MOBILE MENU ON NAVIGATION
   * ==========================================================
   */

  useEffect(() => {
    setMenuOpen(false);
  }, [
    location.pathname,
    location.search,
    location.hash,
  ]);

  /**
   * ==========================================================
   * NAVIGATION HELPERS
   * ==========================================================
   */

  const closeMenu = () => {
    setMenuOpen(false);
  };

  /**
   * ==========================================================
   * SECTION NAVIGATION
   * ==========================================================
   */

  const handleSectionNavigation = (
    event,
    sectionId
  ) => {
    event.preventDefault();

    closeMenu();

    const hash = `#${sectionId}`;

    if (
      location.pathname === "/" &&
      location.hash === hash
    ) {
      document
        .getElementById(sectionId)
        ?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });

      return;
    }

    navigate({
      pathname: "/",
      hash,
    });
  };

  /**
   * ==========================================================
   * SCROLL TO SECTION
   * ==========================================================
   */

  useEffect(() => {
    if (
      location.pathname !== "/" ||
      !location.hash
    ) {
      return;
    }

    const sectionId = decodeURIComponent(
      location.hash.slice(1)
    );

    const timeout = window.setTimeout(() => {
      document
        .getElementById(sectionId)
        ?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
    }, 60);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [
    location.pathname,
    location.hash,
  ]);

  /**
   * ==========================================================
   * CREATOR SEARCH
   * ==========================================================
   */

  const handleSearch = (event) => {
    event.preventDefault();

    const query = searchQuery.trim();

    closeMenu();

    navigate(
      query
        ? `/explore?q=${encodeURIComponent(query)}`
        : "/explore"
    );
  };

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

  /**
   * ==========================================================
   * NAVIGATION LINK
   * ==========================================================
   */

  const renderNavigationLink = (link) => {
    const isSectionLink =
      link.path.startsWith("/#");

    if (isSectionLink) {
      const sectionId = link.path.slice(2);

      const isActive =
        location.pathname === "/" &&
        location.hash === `#${sectionId}`;

      return (
        <a
          key={link.label}
          href={link.path}
          onClick={(event) =>
            handleSectionNavigation(
              event,
              sectionId
            )
          }
          className={[
            "relative whitespace-nowrap",
            "py-2 text-[13px] font-medium",
            "transition-colors duration-200",
            isActive
              ? "text-[#ffcc42]"
              : "text-zinc-300 hover:text-[#ffcc42]",
          ].join(" ")}
        >
          {link.label}

          {isActive && (
            <span className="absolute bottom-0 left-0 h-[2px] w-full bg-[#ffcc42]" />
          )}
        </a>
      );
    }

    return (
      <NavLink
        key={link.label}
        to={link.path}
        onClick={closeMenu}
        className={({ isActive }) =>
          [
            "relative whitespace-nowrap",
            "py-2 text-[13px] font-medium",
            "transition-colors duration-200",
            isActive
              ? "text-[#ffcc42]"
              : "text-zinc-300 hover:text-[#ffcc42]",
          ].join(" ")
        }
      >
        {({ isActive }) => (
          <>
            {link.label}

            {isActive && (
              <span className="absolute bottom-0 left-0 h-[2px] w-full bg-[#ffcc42]" />
            )}
          </>
        )}
      </NavLink>
    );
  };

  /**
   * ==========================================================
   * SEARCH FORM
   * ==========================================================
   */

  const renderSearch = (mobile = false) => (
    <form
      onSubmit={handleSearch}
      role="search"
      className={[
        "flex items-center gap-2",
        "rounded-lg border border-white/20",
        "bg-white/5",
        "transition-colors",
        "focus-within:border-[#ffcc42]/60",
        mobile
          ? "w-full px-3 py-2.5"
          : "h-9 w-36 px-2.5 2xl:w-44",
      ].join(" ")}
    >
      <Search
        size={16}
        className="shrink-0 text-zinc-300"
      />

      <input
        type="search"
        value={searchQuery}
        onChange={(event) =>
          setSearchQuery(event.target.value)
        }
        placeholder="Search creators..."
        aria-label="Search creators"
        className="min-w-0 flex-1 bg-transparent text-xs text-white outline-none placeholder:text-zinc-500"
      />
    </form>
  );

  /**
   * ==========================================================
   * AUTHENTICATED ACTIONS
   * ==========================================================
   */

  const renderAuthenticatedActions = (
    mobile = false
  ) => (
    <>
      {/* USER NAME */}

      <div
        className={[
          "items-center gap-1.5",
          "text-xs text-zinc-300",
          mobile ? "flex" : "hidden 2xl:flex",
        ].join(" ")}
      >
        <UserRound
          size={15}
          className="text-[#ffcc42]"
        />

        <span className="max-w-24 truncate">
          {user?.displayName || "My Account"}
        </span>
      </div>

      {/* MESSAGES */}

      <NavLink
        to="/messages"
        onClick={closeMenu}
        className={({ isActive }) =>
          [
            "inline-flex items-center justify-center gap-1.5",
            "rounded-lg border",
            "px-3 py-2",
            "text-xs font-semibold",
            "transition-colors",
            mobile ? "w-full" : "",
            isActive
              ? "border-[#ffcc42] bg-[#ffcc42]/10 text-[#ffcc42]"
              : "border-white/20 text-white hover:border-[#ffcc42] hover:text-[#ffcc42]",
          ].join(" ")
        }
      >
        <MessageSquareText size={15} />
        Messages
      </NavLink>

      {/* DASHBOARD */}

      <NavLink
        to={dashboardPath}
        onClick={closeMenu}
        className={({ isActive }) =>
          [
            "inline-flex items-center justify-center gap-1.5",
            "rounded-lg border",
            "px-3 py-2",
            "text-xs font-semibold",
            "transition-colors",
            mobile ? "w-full" : "",
            isActive
              ? "border-[#ffcc42] text-[#ffcc42]"
              : "border-white/20 text-white hover:border-[#ffcc42] hover:text-[#ffcc42]",
          ].join(" ")
        }
      >
        <LayoutDashboard size={15} />
        Dashboard
      </NavLink>

      {/* LOGOUT */}

      <button
        type="button"
        onClick={handleLogout}
        disabled={isLoading}
        className={[
          "inline-flex items-center justify-center gap-1.5",
          "rounded-lg",
          "bg-gradient-to-r",
          "from-[#ffe27a] to-[#ffbd30]",
          "px-3 py-2",
          "text-xs font-bold text-black",
          "transition hover:brightness-110",
          "disabled:cursor-not-allowed",
          "disabled:opacity-60",
          mobile ? "w-full" : "",
        ].join(" ")}
      >
        <LogOut size={15} />

        {isLoading
          ? "Signing out..."
          : "Logout"}
      </button>
    </>
  );

  /**
   * ==========================================================
   * GUEST ACTIONS
   * ==========================================================
   */

  const renderGuestActions = (
    mobile = false
  ) => (
    <>
      <Link
        to="/login"
        onClick={closeMenu}
        className={[
          "inline-flex items-center justify-center",
          "rounded-lg border border-white/25",
          "px-4 py-2",
          "text-xs font-semibold text-white",
          "transition hover:border-[#ffcc42]",
          mobile ? "w-full" : "",
        ].join(" ")}
      >
        Sign In
      </Link>

      <Link
        to="/register"
        onClick={closeMenu}
        className={[
          "inline-flex items-center justify-center",
          "rounded-lg",
          "bg-gradient-to-r",
          "from-[#ffe27a] to-[#ffbd30]",
          "px-4 py-2",
          "text-xs font-bold text-black",
          "transition hover:brightness-110",
          mobile ? "w-full" : "",
        ].join(" ")}
      >
        Sign Up
      </Link>
    </>
  );

  /**
   * ==========================================================
   * ACCOUNT ACTIONS
   * ==========================================================
   */

  const renderAccountActions = (
    mobile = false
  ) => {
    if (isInitializing) {
      return (
        <span
          role="status"
          className="text-xs text-zinc-400"
        >
          Checking session...
        </span>
      );
    }

    if (isAuthenticated && user) {
      return renderAuthenticatedActions(mobile);
    }

    return renderGuestActions(mobile);
  };

  /**
   * ==========================================================
   * RENDER
   * ==========================================================
   */

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#08080b]/95 backdrop-blur-xl">
      {/* ================================================= */}
      {/* MAIN NAVBAR                                       */}
      {/* ================================================= */}

      <div className="mx-auto flex min-h-[64px] max-w-[1600px] items-center justify-between gap-3 px-4 sm:px-6 xl:px-8">
        {/* =============================================== */}
        {/* BRAND                                           */}
        {/* =============================================== */}

        <Link
          to="/"
          onClick={closeMenu}
          aria-label="PremiumChat home"
          className="flex shrink-0 items-center gap-1.5"
        >
          <Crown
            size={30}
            strokeWidth={2.2}
            className="text-[#ffcc42]"
            fill="#ffcc42"
          />

          <span className="text-xl font-extrabold tracking-tight text-white sm:text-[23px]">
            Premium
            <span className="text-[#ffcc42]">
              Chat
            </span>
          </span>
        </Link>

        {/* =============================================== */}
        {/* DESKTOP NAVIGATION                              */}
        {/* =============================================== */}

        <nav
          aria-label="Desktop navigation"
          className="hidden items-center gap-4 xl:flex 2xl:gap-6"
        >
          {publicLinks.map(renderNavigationLink)}
        </nav>

        {/* =============================================== */}
        {/* DESKTOP ACTIONS                                 */}
        {/* =============================================== */}

        <div className="hidden shrink-0 items-center gap-2 xl:flex">
          {renderSearch()}

          {renderAccountActions()}
        </div>

        {/* =============================================== */}
        {/* MOBILE/TABLET MENU BUTTON                       */}
        {/* =============================================== */}

        <button
          type="button"
          onClick={() =>
            setMenuOpen((previous) => !previous)
          }
          aria-label={
            menuOpen
              ? "Close navigation menu"
              : "Open navigation menu"
          }
          aria-expanded={menuOpen}
          aria-controls="premiumchat-mobile-navigation"
          className="rounded-lg border border-white/20 p-2 text-white transition hover:border-[#ffcc42] xl:hidden"
        >
          {menuOpen ? (
            <X size={20} />
          ) : (
            <Menu size={20} />
          )}
        </button>
      </div>

      {/* ================================================= */}
      {/* MOBILE/TABLET NAVIGATION                          */}
      {/* ================================================= */}

      {menuOpen && (
        <nav
          id="premiumchat-mobile-navigation"
          aria-label="Mobile navigation"
          className="max-h-[calc(100dvh-64px)] overflow-y-auto border-t border-white/10 bg-[#111115] px-4 py-5 sm:px-6 xl:hidden"
        >
          {/* SEARCH */}

          {renderSearch(true)}

          {/* PUBLIC LINKS */}

          <div className="mt-5 flex flex-col gap-3">
            {publicLinks.map(renderNavigationLink)}
          </div>

          {/* ACCOUNT ACTIONS */}

          <div className="mt-5 flex flex-col gap-2.5 border-t border-white/10 pt-5">
            {renderAccountActions(true)}
          </div>
        </nav>
      )}
    </header>
  );
}