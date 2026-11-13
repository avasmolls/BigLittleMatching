import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev: the frontend runs on :5173 and forwards /api/* to FastAPI on :8000.
export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": { target: "http://127.0.0.1:8000", rewrite: p => p.replace(/^\/api/, "") } } },
});
