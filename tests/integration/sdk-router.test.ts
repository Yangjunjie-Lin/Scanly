import path from "node:path";
import { describe, expect, it } from "vitest";
import { createRgbaFrame } from "@scanly/core";
import { getBuiltinScenario } from "@scanly/scenario-schema";
import { createNodeCaptureRouter, loadPixelBufferFromPath } from "@scanly/node";

const root = path.resolve(__dirname, "../..");

describe("SDK capture router integration", () => {
  it("decodes through the public result API and keeps raw text available", async () => {
    const pixels = await loadPixelBufferFromPath(path.join(root, "fixtures/02-clear-text.png"));
    const router = createNodeCaptureRouter({ scenario: getBuiltinScenario("fast") });
    const outcome = await router.scan(createRgbaFrame(pixels.data, pixels.width, pixels.height, { id: "router-clear", sourceType: "upload" }));
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.results.length).toBeGreaterThan(0);
      expect(outcome.primary.rawText).toBe("SCANLY_CLEAR_TEXT");
      expect(outcome.primary.format).toBe("qr_code");
      expect(outcome.primary.engine.id).toBe("jsqr");
      expect(outcome.primary.rawBytes).toBeInstanceOf(Uint8Array);
      expect(outcome.timing.timeToFirstResultMs).toBeTypeOf("number");
    }
  });

  it("preserves the retained moire fixture through the public balanced scenario", async () => {
    const pixels = await loadPixelBufferFromPath(path.join(root, "fixtures/40-moire.png"));
    const router = createNodeCaptureRouter({ scenario: getBuiltinScenario("balanced") });
    const outcome = await router.scan(createRgbaFrame(pixels.data, pixels.width, pixels.height, { id: "router-moire", sourceType: "upload" }));
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.results.map((result) => result.rawText)).toContain("SCANLY_MOIRE_01");
  });

  it("returns a typed failure for unsupported YUV conversion", async () => {
    const router = createNodeCaptureRouter();
    const outcome = await router.scan({ id: "yuv", timestampMs: Date.now(), width: 2, height: 2, rowStride: 2, pixelFormat: "yuv420", orientation: 0, sourceType: "video-frame", ownership: "borrowed", data: new Uint8Array(6) });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error.code).toBe("unsupported_format");
  });

  it("returns invalid_image for a non-object runtime frame", async () => {
    const outcome = await createNodeCaptureRouter().scan(null as never);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error.code).toBe("invalid_image");
      expect(outcome.frameId).toBe("invalid-frame");
    }
  });

  it("rejects frames above the scenario pixel budget before decoding", async () => {
    const scenario = getBuiltinScenario("fast");
    scenario.budgets.maxPixels = 4;
    const router = createNodeCaptureRouter({ scenario });
    const outcome = await router.scan(createRgbaFrame(new Uint8ClampedArray(3 * 3 * 4), 3, 3, { id: "oversized" }));
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error.code).toBe("resource_limit_exceeded");
  });

  it("returns malformed_scenario for an invalid per-call scenario instead of throwing", async () => {
    const router = createNodeCaptureRouter();
    const scenario = { ...getBuiltinScenario("fast"), output: undefined };
    const outcome = await router.scan(
      createRgbaFrame(new Uint8ClampedArray(4), 1, 1, { id: "malformed-scenario" }),
      { scenario: scenario as never }
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error.code).toBe("malformed_scenario");
  });

  it("enforces router concurrency before launching a second frame", async () => {
    const scenario = getBuiltinScenario("fast");
    scenario.budgets.maxConcurrentFrames = 1;
    const router = createNodeCaptureRouter({ scenario });
    const first = router.scan(createRgbaFrame(new Uint8ClampedArray(160 * 160 * 4).fill(255), 160, 160, { id: "active" }));
    const second = await router.scan(createRgbaFrame(new Uint8ClampedArray(4), 1, 1, { id: "rejected" }));
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error.code).toBe("concurrent_call_rejected");
    await first;
  });
});
