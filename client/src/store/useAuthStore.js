
import { create } from "zustand";

import {
  registerUser,
  loginUser,
  getAuthenticatedUser,
  logoutUser,
} from "../api/services/authService.js";

/**
 * ============================================================
 * PREMIUMCHAT AUTHENTICATION STORE
 * ============================================================
 *
 * Authentication uses HTTP-only cookies.
 *
 * JWTs must never be stored in localStorage,
 * sessionStorage, or Zustand.
 *
 * Improvements:
 * - Prevent duplicate session initialization requests
 * - Avoid stale initialization responses
 * - Restore authentication after browser refresh
 * - Preserve existing registration/login/logout behavior
 */

/**
 * Track an initialization request outside Zustand.
 *
 * React Strict Mode may call initializeAuth()
 * more than once while the first request is pending.
 */
let initializationPromise = null;

/**
 * Increment this whenever an authentication operation
 * should invalidate an older initialization result.
 */
let authVersion = 0;

const getErrorMessage = (error) => {
  return (
    error?.apiError?.message ||
    error?.response?.data?.message ||
    error?.message ||
    "Something went wrong. Please try again."
  );
};

export const useAuthStore = create((set, get) => ({
  /**
   * ==========================================================
   * AUTHENTICATION STATE
   * ==========================================================
   */

  user: null,

  isAuthenticated: false,

  isInitializing: true,

  isLoading: false,

  error: null,

  /**
   * ==========================================================
   * INITIALIZE AUTHENTICATION
   * ==========================================================
   */

  initializeAuth: async () => {
    // Reuse an existing initialization request.
    if (initializationPromise) {
      return initializationPromise;
    }

    // Session initialization has already completed.
    if (!get().isInitializing) {
      return get().user;
    }

    const requestVersion = authVersion;

    const request = (async () => {
      try {
        const response = await getAuthenticatedUser();

        const user = response?.data?.user;

        if (!user) {
          throw new Error(
            "Authenticated user data was not returned."
          );
        }

        // Ignore a response made obsolete by login/logout.
        if (requestVersion !== authVersion) {
          return get().user;
        }

        set({
          user,
          isAuthenticated: true,
          error: null,
        });

        return user;
      } catch (error) {
        if (requestVersion !== authVersion) {
          return get().user;
        }

        // A missing or invalid session is normal
        // when the visitor is not logged in.
        set({
          user: null,
          isAuthenticated: false,
          error: null,
        });

        return null;
      } finally {
        if (requestVersion === authVersion) {
          set({
            isInitializing: false,
          });
        }
      }
    })();

    initializationPromise = request;

    try {
      return await request;
    } finally {
      if (initializationPromise === request) {
        initializationPromise = null;
      }
    }
  },

  /**
   * ==========================================================
   * REGISTER
   * ==========================================================
   *
   * Registration does not automatically log in.
   */

  register: async (details) => {
    set({
      isLoading: true,
      error: null,
    });

    try {
      const response = await registerUser(details);

      const registeredUser = response?.data?.user;

      if (!registeredUser) {
        throw new Error(
          "Registration response did not include a user."
        );
      }

      set({
        error: null,
      });

      return registeredUser;
    } catch (error) {
      set({
        error: getErrorMessage(error),
      });

      throw error;
    } finally {
      set({
        isLoading: false,
      });
    }
  },

  /**
   * ==========================================================
   * LOGIN
   * ==========================================================
   */

  login: async (credentials) => {
    // Invalidate any older initialization response.
    authVersion += 1;

    set({
      isLoading: true,
      error: null,
    });

    try {
      const response = await loginUser(credentials);

      const user = response?.data?.user;

      if (!user) {
        throw new Error(
          "Login response did not include a user."
        );
      }

      set({
        user,
        isAuthenticated: true,
        isInitializing: false,
        error: null,
      });

      return user;
    } catch (error) {
      set({
        user: null,
        isAuthenticated: false,
        isInitializing: false,
        error: getErrorMessage(error),
      });

      throw error;
    } finally {
      set({
        isLoading: false,
      });
    }
  },

  /**
   * ==========================================================
   * LOGOUT
   * ==========================================================
   */

  logout: async () => {
    // Invalidate any older initialization response.
    authVersion += 1;

    set({
      isLoading: true,
      error: null,
    });

    try {
      await logoutUser();

      set({
        user: null,
        isAuthenticated: false,
        isInitializing: false,
        error: null,
      });

      return true;
    } catch (error) {
      set({
        error: getErrorMessage(error),
      });

      throw error;
    } finally {
      set({
        isLoading: false,
      });
    }
  },

  /**
   * ==========================================================
   * CLEAR ERROR
   * ==========================================================
   */

  clearError: () => {
    set({
      error: null,
    });
  },
}));

export default useAuthStore;
