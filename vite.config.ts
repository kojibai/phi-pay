import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => ({
  base: "/",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      includeAssets: ["favicon.svg", "phi.svg", "robots.txt", "apple-touch-icon.png"],
      manifest: {
        name: "Φ Terminal",
        short_name: "Φ Terminal",
        description: "Offline-first sovereign payment terminal",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#0A1216",
        theme_color: "#0A1216",
        icons: [
          {
            src: "/favicon.svg",
            sizes: "any",
            type: "image/svg+xml"
          },
          {
            src: "/phi.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "maskable"
          }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2,json}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//, /\/assets\//],
        runtimeCaching: [
          {
            urlPattern: ({ request }) =>
              ["script", "style", "worker", "font", "image"].includes(request.destination),
            handler: "CacheFirst",
            options: {
              cacheName: "phi-terminal-assets",
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 30
              }
            }
          },
          {
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: {
              cacheName: "phi-terminal-pages",
              networkTimeoutSeconds: 3
            }
          }
        ],
        cleanupOutdatedCaches: true
      }
    })
  ],
  build: {
    sourcemap: mode === "development"
  }
}));
