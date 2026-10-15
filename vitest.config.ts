import { defineConfig } from "vitest/config";

// One test run covers both workspaces - the pure logic worth testing
// (tips shape, enrichment parsers, profile mapping) lives on both sides.
export default defineConfig({
  test: {
    include: ["server/src/**/*.test.ts", "client/src/**/*.test.ts"],
    environment: "node",
  },
});
