import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    testTimeout: 20_000,
    hookTimeout: 30_000,
    setupFiles: ["./tests/setupEnv.ts"],
    // These are integration tests against one real, shared Postgres instance
    // (schema creation, seat counters) — running files in parallel would let
    // them interfere with each other.
    fileParallelism: false,
  },
  resolve: {
    alias: [
      // Regex + trailing slash, not a bare "@" -> "/src" map: a naive prefix
      // alias would also rewrite scoped package imports like @prisma/client.
      { find: /^@\//, replacement: path.resolve(__dirname, "./src") + "/" },
    ],
  },
});
