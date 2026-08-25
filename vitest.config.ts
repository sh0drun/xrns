import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.ts"],
    // The reader suite runs over every song in the local Renoise library, and the
    // largest of those takes over a second to parse on its own.
    testTimeout: 60_000,
  },
});
