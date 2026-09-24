import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/{unit,integration,security}/**/*.test.ts"],
    environment: "node",
    fileParallelism: false,
  },
});
