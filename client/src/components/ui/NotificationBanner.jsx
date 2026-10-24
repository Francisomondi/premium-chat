
import { useEffect } from "react";
import { X } from "lucide-react";

import Alert from "./Alert.jsx";
import { useUIStore } from "../../store/useUIStore.js";

/**
 * ============================================================
 * PREMIUMCHAT NOTIFICATION BANNER
 * ============================================================
 *
 * Displays global notifications.
 *
 * Features:
 * - Success, error, warning and info messages
 * - Automatic dismissal after 5 seconds
 * - Manual dismissal
 * - Timer cleanup
 */

const NOTIFICATION_DURATION = 5000;

export default function NotificationBanner() {
  const notification = useUIStore(
    (state) => state.notification
  );

  const clearNotification = useUIStore(
    (state) => state.clearNotification
  );

  useEffect(() => {
    if (!notification) {
      return undefined;
    }

    const timeoutId = setTimeout(() => {
      // Only clear the notification associated with this timer.
      if (
        useUIStore.getState().notification === notification
      ) {
        clearNotification();
      }
    }, NOTIFICATION_DURATION);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [notification, clearNotification]);

  if (!notification) {
    return null;
  }

  return (
    <div
      className="fixed right-4 top-20 z-[100] w-[calc(100%-2rem)] max-w-sm"
      role="status"
      aria-live="polite"
    >
      <div className="relative">
        <Alert
          type={notification.type}
          className="pr-12 shadow-xl"
        >
          {notification.message}
        </Alert>

        <button
          type="button"
          onClick={clearNotification}
          aria-label="Dismiss notification"
          className="absolute right-3 top-3 rounded-lg p-1 text-foreground hover:bg-white/10"
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
}
