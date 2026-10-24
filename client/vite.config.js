import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],

  server: {
    port: 5173,
    strictPort: true,
    host: "localhost",
  },

  preview: {
    port: 4173,
  },

  build: {
    outDir: "dist",
    sourcemap: false,
  },
});