import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Read the monorepo root's package.json (not client/package.json) so the
// UI shows the overall app version.
const rootPackageJson = JSON.parse(
  readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf-8"),
) as { version: string };

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(rootPackageJson.version),
  },
  server: {
    // Not 5173/5174/5181 - lets this run alongside the other workshop
    // apps' dev servers without a port clash.
    port: 5175,
    host: true,
    // Docker Desktop bind mounts don't always deliver fs events on macOS.
    watch: process.env.VITE_POLL ? { usePolling: true, interval: 300 } : undefined,
    proxy: {
      "/api": {
        // Overridable so the dual-service Docker Compose dev setup can
        // point at the "app" container instead of localhost.
        target: process.env.VITE_PROXY_TARGET ?? "http://localhost:3003",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
