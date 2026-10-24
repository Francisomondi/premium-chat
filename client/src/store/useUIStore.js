import { create } from "zustand";

export const useUIStore = create((set) => ({
  notification: null,

  showNotification: ({
    type = "info",
    message,
  }) => {
    set({
      notification: {
        type,
        message,
      },
    });
  },

  clearNotification: () => {
    set({
      notification: null,
    });
  },
}));