import { defineConfig } from "vitest/config";

// One test run covers both workspaces - the pure logic worth testing
// (tips shape, enrichment parsers, profile mapping) lives on both sides.
export default defineConfig({
  test: {
    include: ["server/src/**/*.test.ts", "client/src/**/*.test.ts"],
    environment: "node",
    // Tests must not depend on the OrcaSlicer installed on this machine: point its
    // settings file nowhere (version and plate type read as unknown). Tests that
    // need a value pass it explicitly or write their own temp files.
    env: { ORCA_CONF: "/nonexistent/OrcaSlicer.conf" },
  },
});
