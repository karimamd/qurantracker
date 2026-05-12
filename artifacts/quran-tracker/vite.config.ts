import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { VitePWA } from "vite-plugin-pwa";

// PORT is only required at dev/preview time (it binds the server). The
// production build is a pure static asset emit and runs without it during
// `pnpm build` at publish time, so we fall back to a placeholder that the
// `server`/`preview` blocks never use unless the dev workflow actually
// starts.
const rawPort = process.env.PORT;
const port = rawPort ? Number(rawPort) : 0;
if (rawPort && (Number.isNaN(port) || port <= 0)) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// BASE_PATH controls the asset prefix in the emitted bundle. In production
// the artifact is served at "/" via the path-based proxy (see
// .replit-artifact/artifact.toml services[].paths), so default to that
// when the env var isn't set (e.g. during the publish build step).
const basePath = process.env.BASE_PATH ?? "/";

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss({ optimize: false }),
    runtimeErrorOverlay(),
    VitePWA({
      registerType: "autoUpdate",
      devOptions: { enabled: false },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webp,woff2,json}"],
        runtimeCaching: [
          {
            urlPattern: ({ url, request }) =>
              url.pathname.startsWith("/api/") &&
              !url.pathname.startsWith("/api/__clerk") &&
              request.method === "GET",
            handler: "NetworkFirst",
            options: {
              cacheName: "api-runtime-cache",
              networkTimeoutSeconds: 8,
              expiration: { maxEntries: 300, maxAgeSeconds: 7 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      manifest: {
        name: "Quran Memorization Tracker",
        short_name: "Quran Tracker",
        description: "Track your Quran memorization progress with spaced repetition",
        theme_color: "#2d6a4f",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
          { src: "/logo.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
        ],
      },
    }),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
