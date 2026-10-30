import { Outlet } from "react-router-dom";

import Navbar from "./Navbar.jsx";
import Footer from "./Footer.jsx";
import NotificationBanner from "../ui/NotificationBanner.jsx";

/**
 * ============================================================
 * PREMIUMCHAT — MAIN APPLICATION LAYOUT
 * ============================================================
 *
 * STEP 19.2
 *
 * Features:
 * - Responsive application shell
 * - Existing premium Navbar
 * - Global notifications
 * - Consistent page dimensions
 * - Existing Footer
 * - React Router nested routes
 */

export default function MainLayout() {
  return (
    <div className="flex min-h-screen min-w-0 flex-col bg-[#08080b] text-white">
      {/* NAVIGATION */}

      <Navbar />

      {/* GLOBAL NOTIFICATIONS */}

      <NotificationBanner />

      {/* PAGE CONTENT */}

      <main
        id="main-content"
        className="relative flex w-full min-w-0 flex-1 flex-col"
      >
        <Outlet />
      </main>

      {/* FOOTER */}

      <Footer />
    </div>
  );
}