
import {
  Routes,
  Route,
} from "react-router-dom";

import MainLayout from "../components/layout/MainLayout.jsx";
import ProtectedRoute from "./ProtectedRoute.jsx";

// Public pages
import HomePage from "../pages/public/HomePage.jsx";
import ExplorePage from "../pages/public/ExplorePage.jsx";
import LoginPage from "../pages/public/LoginPage.jsx";
import RegisterPage from "../pages/public/RegisterPage.jsx";
import NotFoundPage from "../pages/public/NotFoundPage.jsx";
import CreatorProfilePage from "../pages/public/CreatorProfilePage.jsx";
import DevStatusPage from "../pages/public/DevStatusPage.jsx";
import AgeVerificationPage from "../pages/public/AgeVerificationPage.jsx";

// User pages
import UserDashboard from "../pages/user/UserDashboard.jsx";
import ChatPage from "../pages/ChatPage.jsx";

// Creator pages
import CreatorDashboard from "../pages/creator/CreatorDashboard.jsx";
import CreatorGallery from "../pages/creator/CreatorGallery.jsx";

// Admin pages
import AdminDashboard from "../pages/admin/AdminDashboard.jsx";

export default function AppRoutes() {
  return (
    <Routes>
      <Route element={<MainLayout />}>

        {/* PUBLIC ROUTES */}

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

        {/* DEVELOPMENT DIAGNOSTICS */}

        {import.meta.env.DEV && (
          <Route
            path="/dev/status"
            element={<DevStatusPage />}
          />
        )}

        {/* AGE VERIFICATION */}

        <Route
          element={
            <ProtectedRoute
              requireAgeVerification={false}
            />
          }
        >
          <Route
            path="/age-verification"
            element={<AgeVerificationPage />}
          />
        </Route>

        {/* AUTHENTICATED USER ROUTES */}

        <Route element={<ProtectedRoute />}>
          <Route
            path="/dashboard"
            element={<UserDashboard />}
          />

          <Route
            path="/messages"
            element={<ChatPage />}
          />
        </Route>

        {/* CREATOR ROUTES */}

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

          <Route
            path="/creator/gallery"
            element={<CreatorGallery />}
          />
        </Route>

        {/* ADMIN ROUTES */}

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

        {/* 404 */}

        <Route
          path="*"
          element={<NotFoundPage />}
        />

      </Route>
    </Routes>
  );
}
