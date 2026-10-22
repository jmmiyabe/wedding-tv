import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// `/api/*` is served by Cloudflare Pages Functions. During `pnpm dev`, requests
// are proxied to `wrangler pages dev` (run `pnpm dev:api` in a second terminal).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    proxy: {
      "/api": "http://127.0.0.1:8788",
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
