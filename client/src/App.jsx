
import { useEffect } from "react";

import AppRoutes from "./routes/AppRoutes.jsx";

import { useAuthStore } from "./store/useAuthStore.js";

/**
 * ============================================================
 * PREMIUMCHAT APPLICATION ROOT
 * ============================================================
 *
 * Responsibilities:
 *
 * 1. Initialize authentication on application startup.
 * 2. Restore an existing HTTP-only cookie session.
 * 3. Keep existing application routing intact.
 *
 * Protected route handling will be implemented separately.
 */

export default function App() {
  const initializeAuth = useAuthStore(
    (state) => state.initializeAuth
  );

  useEffect(() => {
    /**
     * Verify the existing authentication cookie.
     *
     * React StrictMode may invoke this effect twice
     * in development. A later step will harden the
     * store against overlapping authentication requests.
     */
    initializeAuth();
  }, [initializeAuth]);

  return <AppRoutes />;
}
