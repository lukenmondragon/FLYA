import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src"), "server-only": path.resolve(import.meta.dirname, "tests/server-only-stub.ts") } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    env: { FLIGHT_PROVIDER: "mock", LLM_PROVIDER: "rules", DATABASE_URL: "memory:", LOG_LEVEL: "silent" },
  },
});
