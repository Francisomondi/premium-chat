
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
   * REFRESH AUTHENTICATED USER
   * ==========================================================
   *
   * Fetches the latest authenticated user from the backend.
   *
   * Used after:
   *
   * - Creator application submission
   * - Creator application review
   * - Account role changes
   * - Profile updates
   * - Verification status changes
   *
   * Does not store or expose authentication tokens.
   *
   * Uses authVersion to prevent stale refresh responses
   * from restoring an older user after login/logout.
   */

  refreshAuthenticatedUser: async () => {
    const requestVersion = authVersion;

    const currentUser = get().user;

    if (!get().isAuthenticated || !currentUser) {
      return null;
    }

    try {
      const response = await getAuthenticatedUser();

      const updatedUser = response?.data?.user;

      if (!updatedUser) {
        throw new Error(
          "Authenticated user data was not returned."
        );
      }

      /*
       * A login/logout may have occurred while the
       * refresh request was in progress.
       *
       * Never overwrite the newer authentication state.
       */

      if (requestVersion !== authVersion) {
        return get().user;
      }

      /*
       * Ensure the response still belongs to
       * the same authenticated account.
       *
       * The backend may return either id or _id
       * depending on its response serializer.
       */

      const previousUserId =
        currentUser.id ?? currentUser._id;

      const updatedUserId =
        updatedUser.id ?? updatedUser._id;

      if (
        !previousUserId ||
        !updatedUserId ||
        String(previousUserId) !== String(updatedUserId)
      ) {
        throw new Error(
          "Authenticated user identity mismatch."
        );
      }

      /*
       * Replace the entire user object with the
       * latest authoritative backend response.
       *
       * This updates:
       *
       * - role
       * - accountStatus
       * - creatorApplicationStatus
       * - ageVerificationStatus
       * - other user profile fields
       */

      set({
        user: updatedUser,
        isAuthenticated: true,
        error: null,
      });

      return updatedUser;
    } catch (error) {
      /*
       * Ignore errors from obsolete requests.
       */

      if (requestVersion !== authVersion) {
        return get().user;
      }

      /*
       * A 401 means the session is no longer valid.
       *
       * Clear stale authenticated state.
       */

      if (error?.response?.status === 401) {
        authVersion += 1;

        set({
          user: null,
          isAuthenticated: false,
          isInitializing: false,
          error: null,
        });

        return null;
      }

      /*
       * Other failures should not erase the current
       * user or destroy a potentially valid session.
       *
       * Let the calling component display the error.
       */

      throw error;
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
