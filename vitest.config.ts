import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
    environment: "node",
    // Migrations are applied once, with the real `wrangler d1 migrations apply`,
    // into a throwaway local D1. Test files share it, so run them one at a time.
    globalSetup: ["tests/globalSetup.ts"],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 120_000,
  },
});
