import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Vitest configuration. Node is the default environment; component tests
 * opt into jsdom with a `// @vitest-environment jsdom` docblock.
 */
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,tsx}"],
    setupFiles: ["tests/setup.ts"],
    testTimeout: 15_000,
  },
});
