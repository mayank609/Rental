/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiTarget = env.VITE_DEV_API_PROXY || "http://localhost:4000";
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: ["favicon.svg", "icons/*.png"],
        manifest: {
          name: env.VITE_PLATFORM_NAME || "RentNest",
          short_name: env.VITE_PLATFORM_NAME || "RentNest",
          description: "Rent anything from people near you",
          theme_color: "#4f46e5",
          background_color: "#ffffff",
          display: "standalone",
          start_url: "/",
          icons: [
            { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
            { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
            { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          ],
        },
        workbox: {
          navigateFallback: "/index.html",
          navigateFallbackDenylist: [/^\/api\//, /^\/uploads\//, /^\/socket\.io/, /^\/sitemap\.xml/, /^\/robots\.txt/],
          globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
          runtimeCaching: [
            {
              urlPattern: ({ url }) => url.pathname.startsWith("/uploads/") || /\.(webp|png|jpg|jpeg)$/.test(url.pathname),
              handler: "CacheFirst",
              options: { cacheName: "images", expiration: { maxEntries: 300, maxAgeSeconds: 30 * 24 * 3600 } },
            },
            {
              urlPattern: ({ url }) => url.pathname.startsWith("/api/v1/categories") || url.pathname.startsWith("/api/v1/locations/cities"),
              handler: "StaleWhileRevalidate",
              options: { cacheName: "api-static" },
            },
            { urlPattern: ({ url }) => url.pathname.startsWith("/api/v1/listings"), handler: "NetworkFirst", options: { cacheName: "api-listings", networkTimeoutSeconds: 4 } },
          ],
        },
      }),
    ],
    resolve: { alias: { "@": path.resolve(__dirname, "src") } },
    server: {
      port: 5173,
      proxy: {
        "/api": { target: apiTarget, changeOrigin: true },
        "/uploads": { target: apiTarget, changeOrigin: true },
        "/socket.io": { target: apiTarget, ws: true, changeOrigin: true },
        "/sitemap.xml": { target: apiTarget, changeOrigin: true },
        "/robots.txt": { target: apiTarget, changeOrigin: true },
      },
    },
    preview: { port: 4173, proxy: { "/api": apiTarget, "/uploads": apiTarget, "/socket.io": { target: apiTarget, ws: true } } },
    build: {
      sourcemap: true,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ["react", "react-dom", "react-router-dom"],
            query: ["@tanstack/react-query", "axios"],
            maps: ["leaflet", "react-leaflet"],
            charts: ["recharts"],
          },
        },
      },
    },
    test: { environment: "jsdom", globals: true, setupFiles: ["./src/test/setup.ts"], exclude: ["e2e/**", "node_modules/**"] },
  };
});
