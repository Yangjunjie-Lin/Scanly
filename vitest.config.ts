import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reportsDirectory: "coverage",
      include: ["lib/qr/**/*.ts"],
      exclude: [
        "lib/qr/image-loader.ts",
        "lib/qr/index.ts",
        "lib/qr/benchmark-types.ts",
        "lib/qr/decode-upload.ts",
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 60,
        statements: 80,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
