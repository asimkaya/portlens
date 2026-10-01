import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Tauri's dev window loads a fixed URL, so the port must not drift.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 5173, strictPort: true },
  build: { target: "es2022" },
});
