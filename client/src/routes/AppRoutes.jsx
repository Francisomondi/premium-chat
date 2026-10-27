import {
  Routes,
  Route,
} from "react-router-dom";

import MainLayout from "../components/layout/MainLayout.jsx";

import ProtectedRoute from "./ProtectedRoute.jsx";

import HomePage from "../pages/public/HomePage.jsx";
import ExplorePage from "../pages/public/ExplorePage.jsx";
import LoginPage from "../pages/public/LoginPage.jsx";
import RegisterPage from "../pages/public/RegisterPage.jsx";
import NotFoundPage from "../pages/public/NotFoundPage.jsx";
import CreatorProfilePage from "../pages/public/CreatorProfilePage.jsx";

import DevStatusPage from "../pages/public/DevStatusPage.jsx";

import UserDashboard from "../pages/user/UserDashboard.jsx";
import CreatorDashboard from "../pages/creator/CreatorDashboard.jsx";
import AdminDashboard from "../pages/admin/AdminDashboard.jsx";

/**
 * ============================================================
 * STEP 3.5.8 — CHAT PAGE
 * ============================================================
 */

import ChatPage from "../pages/ChatPage.jsx";

/**
 * ============================================================
 * PREMIUMCHAT APPLICATION ROUTES
 * ============================================================
 *
 * Public routes:
 * - Home
 * - Explore
 * - Login
 * - Register
 *
 * Authenticated routes:
 * - User dashboard
 * - Messages
 *
 * Creator routes:
 * - Creator dashboard
 *
 * Admin routes:
 * - Admin dashboard
 *
 * Authentication and role checks are handled by
 * ProtectedRoute.
 */

export default function AppRoutes() {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        {/* ============================================= */}
        {/* PUBLIC ROUTES                                 */}
        {/* ============================================= */}

        <Route
          path="/"
          element={<HomePage />}
        />

        <Route
          path="/explore"
          element={<ExplorePage />}
        />

        <Route
          path="/login"
          element={<LoginPage />}
        />

        <Route
          path="/register"
          element={<RegisterPage />}
        />
        
        <Route
          path="/creators/:creatorId"
          element={<CreatorProfilePage />}
        />

        {/* ============================================= */}
        {/* DEVELOPMENT DIAGNOSTICS                       */}
        {/* ============================================= */}

        {import.meta.env.DEV && (
          <Route
            path="/dev/status"
            element={<DevStatusPage />}
          />
        )}

        {/* ============================================= */}
        {/* AUTHENTICATED USER ROUTES                     */}
        {/* ============================================= */}

        <Route element={<ProtectedRoute />}>
          <Route
            path="/dashboard"
            element={<UserDashboard />}
          />

          {/* =========================================== */}
          {/* PRIVATE MESSAGING                           */}
          {/* =========================================== */}

          <Route
            path="/messages"
            element={<ChatPage />}
          />
        </Route>

        {/* ============================================= */}
        {/* CREATOR ROUTES                                */}
        {/* ============================================= */}

        <Route
          element={
            <ProtectedRoute
              allowedRoles={["CREATOR"]}
              requireCreatorApproval={true}
            />
          }
        >
          <Route
            path="/creator/dashboard"
            element={<CreatorDashboard />}
          />
        </Route>

        {/* ============================================= */}
        {/* ADMIN ROUTES                                  */}
        {/* ============================================= */}

        <Route
          element={
            <ProtectedRoute
              allowedRoles={["ADMIN"]}
            />
          }
        >
          <Route
            path="/admin/dashboard"
            element={<AdminDashboard />}
          />
        </Route>

        {/* ============================================= */}
        {/* 404                                           */}
        {/* ============================================= */}

        <Route
          path="*"
          element={<NotFoundPage />}
        />
      </Route>
    </Routes>
  );
}