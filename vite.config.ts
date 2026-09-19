import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// The app bundles no family data: it fetches public/packet/ at runtime
// (src/lib/packet.ts), so there is no data alias and nothing under data/
// reaches the bundle.
export default defineConfig({
  plugins: [react()],
  base: "./",
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  // MapLibre ships its worker as a sibling module. Pre-bundling rewrites
  // the import to .vite/deps/maplibre-gl-worker.mjs, which does not exist,
  // and without a worker the style never finishes loading and the film
  // sits on "loading the world" forever.
  optimizeDeps: { exclude: ["maplibre-gl"] },
  build: { outDir: "dist", chunkSizeWarningLimit: 1400 },
});
