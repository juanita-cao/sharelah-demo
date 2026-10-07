/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import type { Plugin } from "vite";

// Serves MSW's service worker in dev only, so the file is never copied into (or referenced by) a production build.
const mockServiceWorker = (): Plugin => ({
  name: "serve-msw-worker",
  apply: "serve",
  configureServer(server) {
    server.middlewares.use("/mockServiceWorker.js", (_req, res) => {
      res.setHeader("Content-Type", "application/javascript");
      res.end(readFileSync("node_modules/msw/lib/mockServiceWorker.js"));
    });
  },
});

// A demo build (mode "demo") carries the mock backend, so it also needs MSW's service worker; a production build never does.
const demoServiceWorker = (): Plugin => ({
  name: "emit-msw-worker-for-demo",
  apply: "build",
  generateBundle() {
    this.emitFile({ type: "asset", fileName: "mockServiceWorker.js", source: readFileSync("node_modules/msw/lib/mockServiceWorker.js") });
  },
});

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  // Mock safeguard: a production build must never carry the mock flag.
  if (mode === "production" && env.VITE_USE_MOCK === "1") {
    throw new Error("VITE_USE_MOCK=1 is not allowed in a production build.");
  }

  return {
    plugins: [react(), mockServiceWorker(), ...(mode === "demo" ? [demoServiceWorker()] : [])],
    // The project lives on an external volume where file-system events are unreliable, which left the dev server
    // serving stale modules (a mix of old and new files); polling makes it notice every change.
    server: { port: 5173, watch: { usePolling: true, interval: 300, ignored: ["**/._*"] }, proxy: { "/api": { target: "http://127.0.0.1:8765", changeOrigin: true } } },   // the live demo server (scripts/demo_server.py)
    test: {
      globals: true,
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
      css: false,
      // The form has ~40 Ant Design inputs; jsdom is far slower than a real browser at re-rendering them (a real
      // browser measures 30-60 ms per keystroke and ~250 ms per Run), so the multi-step component tests need headroom.
      testTimeout: 60000,
      exclude: ["**/node_modules/**", "**/dist/**", "**/._*"],
    },
  };
});
