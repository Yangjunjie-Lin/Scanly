import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reportsDirectory: "coverage",
      include: ["lib/qr/**/*.ts", "lib/benchmark/**/*.ts"],
      exclude: [
        "lib/qr/index.ts",
        "lib/qr/benchmark-types.ts",
        "lib/qr/image-loader.ts",
        "lib/qr/worker/decode-worker.ts",
      ],
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 70,
        statements: 85,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
