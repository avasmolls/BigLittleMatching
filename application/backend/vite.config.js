import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// Dev: the frontend runs on :5173 and forwards /api/* to FastAPI on :8000.
export default defineConfig({
  root: fileURLToPath(new URL("../frontend", import.meta.url)),
  build: {
    outDir: fileURLToPath(new URL("./static", import.meta.url)),
    emptyOutDir: true,
  },
  plugins: [react()],
  server: { proxy: { "/api": { target: "http://127.0.0.1:8000", rewrite: p => p.replace(/^\/api/, "") } } },
});
