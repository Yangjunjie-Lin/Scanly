import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reportsDirectory: "coverage",
      include: ["packages/core/src/**/*.ts", "packages/browser/src/**/*.ts", "packages/node/src/**/*.ts", "engines/*/src/**/*.ts", "packages/scenario-schema/src/**/*.ts", "packages/parsers/src/**/*.ts", "packages/benchmark/src/**/*.ts"],
      exclude: [
        "packages/**/src/index.ts",
        "packages/**/src/types.ts",
        "packages/core/src/contracts/engine.ts",
        "packages/core/src/contracts/result.ts",
        "packages/browser/src/image-loader.ts",
        "packages/browser/src/worker/decode-worker.ts",
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
      "@scanly/core/qr": path.resolve(__dirname, "packages/core/src/qr/index.ts"),
      "@scanly/core": path.resolve(__dirname, "packages/core/src/index.ts"),
      "@scanly/node": path.resolve(__dirname, "packages/node/src/index.ts"),
      "@scanly/engine-jsqr": path.resolve(__dirname, "engines/jsqr/src/index.ts"),
      "@scanly/engine-zxing-js": path.resolve(__dirname, "engines/zxing-js/src/index.ts"),
      "@scanly/engine-zxing-cpp-wasm": path.resolve(__dirname, "engines/zxing-cpp-wasm/src/index.ts"),
      "@scanly/browser": path.resolve(__dirname, "packages/browser/src/index.ts"),
      "@scanly/scenario-schema": path.resolve(__dirname, "packages/scenario-schema/src/index.ts"),
      "@scanly/parsers": path.resolve(__dirname, "packages/parsers/src/index.ts"),
      "@scanly/benchmark": path.resolve(__dirname, "packages/benchmark/src/index.ts"),
      "@": path.resolve(__dirname, "."),
    },
  },
});
