import path from "node:path";
import { describe, expect, it } from "vitest";
import { createZxingCppWasmEngine } from "@scanly/engine-zxing-cpp-wasm";
import { createNodeCaptureRouter, loadNormalizedFrameFromPath, loadPixelBufferFromPath } from "@scanly/node";
import { createRgbaFrame } from "@scanly/core";
import { getBuiltinScenario } from "@scanly/scenario-schema";

const fixture = (name: string) => path.join(process.cwd(), "fixtures", name);

describe("ZXing-C++ WASM native boundary", () => {
  it("decodes QR Model 2 with raw bytes, geometry, provenance, and released native results", async () => {
    const engine = createZxingCppWasmEngine();
    try {
      const frame = await loadNormalizedFrameFromPath(fixture("01-clear-url.png"), "zxing-cpp-clear");
      const outcome = await engine.decode(frame, { formats: ["qr_code"], findMultiple: false });
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;
      expect(outcome.results[0]).toMatchObject({
        text: "https://scanly.example/clear",
        format: "qr_code",
        engineMetadata: { variant: "standard", executionModel: "wasm" },
      });
      expect(outcome.results[0].rawBytes?.byteLength).toBeGreaterThan(0);
      expect(outcome.results[0].cornerPoints).toHaveLength(4);
      expect(engine.getMemoryObservation()).toMatchObject({ inputAllocationBytes: 0, activeNativeResultCount: 0, releasedNativeResultCount: 1 });
    } finally {
      await engine.dispose();
    }
  });

  it("distinguishes no-symbol, malformed dimensions, and cancellation", async () => {
    const engine = createZxingCppWasmEngine();
    try {
      const negative = await loadNormalizedFrameFromPath(fixture("53-negative-blank.png"), "zxing-cpp-negative");
      const noSymbol = await engine.decode(negative, { formats: ["qr_code"], findMultiple: false });
      expect(noSymbol).toMatchObject({ ok: false, category: "not-found" });

      const cancelled = new AbortController();
      cancelled.abort();
      expect(await engine.decode(negative, { formats: ["qr_code"], findMultiple: false, signal: cancelled.signal })).toMatchObject({ ok: false, category: "cancelled", code: "cancelled" });

      const malformed = { ...negative, width: Number.MAX_SAFE_INTEGER };
      expect(await engine.decode(malformed, { formats: ["qr_code"], findMultiple: false })).toMatchObject({ ok: false, category: "invalid-input" });
    } finally {
      await engine.dispose();
    }
  });

  it("reuses one instance across repeated decode and releases every native vector", async () => {
    const engine = createZxingCppWasmEngine();
    try {
      const frame = await loadNormalizedFrameFromPath(fixture("02-clear-text.png"), "zxing-cpp-repeat");
      for (let index = 0; index < 25; index += 1) {
        const outcome = await engine.decode(frame, { formats: ["qr_code"], findMultiple: false });
        expect(outcome.ok).toBe(true);
      }
      const memory = engine.getMemoryObservation();
      expect(memory.activeNativeResultCount).toBe(0);
      expect(memory.releasedNativeResultCount).toBe(25);
      expect(memory.currentLinearMemoryBytes).toBeLessThanOrEqual(memory.peakLinearMemoryBytes);
    } finally {
      await engine.dispose();
    }
  });

  it("normalizes rotated, inverted, and multiple native results", async () => {
    const engine = createZxingCppWasmEngine();
    try {
      const rotated = await engine.decode(
        await loadNormalizedFrameFromPath(fixture("12-rotated.png"), "zxing-cpp-rotated"),
        { formats: ["qr_code"], findMultiple: false },
      );
      expect(rotated.ok && rotated.results[0].text).toBe("https://scanly.example/rotated");

      const inverted = await engine.decode(
        await loadNormalizedFrameFromPath(fixture("15-inverted.png"), "zxing-cpp-inverted"),
        { formats: ["qr_code"], findMultiple: false, inversion: "unknown" },
      );
      expect(inverted.ok && inverted.results[0].text).toBe("https://scanly.example/inverted");

      const multiple = await engine.decode(
        await loadNormalizedFrameFromPath(fixture("16-multiple-codes.jpg"), "zxing-cpp-multiple"),
        { formats: ["qr_code"], findMultiple: true },
      );
      expect(multiple.ok).toBe(true);
      if (multiple.ok) {
        expect(new Set(multiple.results.map((result) => result.text))).toEqual(new Set([
          "https://scanly.example/primary",
          "https://scanly.example/secondary",
        ]));
      }
    } finally {
      await engine.dispose();
    }
  });

  it("isolates WASM initialization failure and reports the actual JavaScript fallback", async () => {
    const scenario = getBuiltinScenario("balanced");
    scenario.decoders.order = ["zxing-cpp-wasm", "zxing-js"];
    scenario.output.includeDebugTrace = true;
    const router = createNodeCaptureRouter({
      scenario,
      zxingCppWasm: {
        maxInitializationAttempts: 1,
        assetResolver: () => new URL("file:///definitely-missing/fallback.wasm"),
      },
    });
    try {
      const pixels = await loadPixelBufferFromPath(fixture("74-zxing-contribution-blur.png"));
      const outcome = await router.scan(createRgbaFrame(pixels.data, pixels.width, pixels.height));
      expect(outcome.ok).toBe(true);
      if (outcome.ok) expect(outcome.primary.engine.id).toBe("zxing-js");
      expect(outcome.engineDiagnostics).toEqual(expect.arrayContaining([
        expect.objectContaining({ engineId: "zxing-cpp-wasm", status: "initialization-failure" }),
        expect.objectContaining({ engineId: "zxing-js", status: "success" }),
      ]));
    } finally {
      await router.dispose();
    }
  });
});
