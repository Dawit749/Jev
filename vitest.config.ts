import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@jev/contracts": path.resolve("packages/contracts/src/index.ts"),
      "@jev/shared": path.resolve("packages/shared/src/index.ts"),
    },
  },
});
