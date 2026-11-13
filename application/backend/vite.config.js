import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { dirname } from "node:path";

const require = createRequire(import.meta.url);

// Dev: the frontend runs on :5173 and forwards /api/* to FastAPI on :8000.
export default defineConfig({
  root: fileURLToPath(new URL("../frontend", import.meta.url)),
  // Dependencies are installed beside this config, outside the frontend root.
  resolve: {
    alias: {
      react: dirname(require.resolve("react/package.json")),
      "react-dom": dirname(require.resolve("react-dom/package.json")),
    },
  },
  build: {
    outDir: fileURLToPath(new URL("./static", import.meta.url)),
    emptyOutDir: true,
  },
  plugins: [react()],
  server: { proxy: { "/api": { target: "http://127.0.0.1:8000", rewrite: p => p.replace(/^\/api/, "") } } },
});
