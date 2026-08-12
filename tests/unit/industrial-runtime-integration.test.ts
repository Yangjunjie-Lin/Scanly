import { describe, expect, it, vi } from "vitest";
import { BrowserScannerFrameDecoder, ScannerTrackingRuntime, type ScannerDecodeRequest } from "@scanly/browser";
import { createRgbaFrame, getBuiltinScenario, sdkError, type CaptureRouter, type NormalizedFrame, type ScanOutcome, type ScanResult } from "@scanly/core";
import { scanWithNodeIndustrialRecovery } from "@scanly/node";
import { syntheticFrame } from "./industrial-test-helpers.js";

function failure(frameId: string): ScanOutcome { return { ok: false, error: sdkError("no_symbol_found", "miss"), frameId, scenarioId: "fake", attemptCount: 1, timing: { totalMs: 1 } }; }
function success(frame: NormalizedFrame): ScanOutcome {
  const result: ScanResult = { format: "qr_code", rawText: "RUNTIME-PARITY", cornerPoints: [{ x: 4, y: 4 }, { x: 20, y: 4 }, { x: 20, y: 20 }, { x: 4, y: 20 }], engine: { id: "fake", version: "1" }, preprocessingPath: [], frameId: frame.id, structuredPayload: null, validation: { valid: true, validatorIds: [], messages: [] }, warnings: [], timing: { totalMs: 1 } };
  return { ok: true, results: [result], primary: result, frameId: frame.id, scenarioId: "fake", attemptCount: 1, timing: { totalMs: 1 } };
}
function fakeRouter(): CaptureRouter {
  return {
    scan: vi.fn(async (frame: NormalizedFrame, options?: { scenario?: { id: string } }) => options?.scenario?.id.startsWith("recovery-") ? success(frame) : failure(frame.id)),
    engines: { get: () => undefined }, dispose: async () => undefined,
  } as unknown as CaptureRouter;
}

describe("industrial Browser/Node runtime integration", () => {
  it("keeps Browser and Node payload/format parity on the same static pixels", async () => {
    const source = syntheticFrame(48, 48, (x, y) => 120 + (((x >> 3) + (y >> 3)) % 2) * 5, "runtime-parity");
    const node = await scanWithNodeIndustrialRecovery(fakeRouter(), source, {
      profile: "balanced", scenario: getBuiltinScenario("balanced"),
      budget: { maximumRoutes: 2, maximumAttempts: 2, maximumPixelsProcessed: source.width * source.height * 4, maximumCandidates: 2, maximumTemporaryBytes: 1_000_000 },
    });
    const browserDecoder = new BrowserScannerFrameDecoder({ router: fakeRouter(), useWorker: false, disposeRouter: false, recovery: { profile: "balanced", budget: { maximumRoutes: 2, maximumAttempts: 2, maximumPixelsProcessed: source.width * source.height * 4, maximumCandidates: 2, maximumTemporaryBytes: 1_000_000 } } });
    const request: ScannerDecodeRequest = { profile: "balanced", quality: { blurScore: 0.2, brightness: 0.5, contrast: 0.02, glareRatio: 0, edgeDensity: 0.2, underexposed: false, overexposed: false, blurred: false, glareDominated: false, usable: false }, signal: new AbortController().signal, generation: 1 };
    const browser = await browserDecoder.decode(createRgbaFrame(new Uint8ClampedArray(source.data), source.width, source.height, { id: source.id, sourceType: "camera" }), request);
    expect(node.outcome.ok).toBe(true); expect(browser.ok).toBe(true);
    if (node.outcome.ok && browser.ok) {
      expect([browser.primary.format, browser.primary.rawText]).toEqual([node.outcome.primary.format, node.outcome.primary.rawText]);
      expect(browser.primary.metadata?.originalFrameGeometry).toBe(true);
      const geometry = browser.primary.cornerPoints!; const tracker = new ScannerTrackingRuntime();
      tracker.observe({ frameId: 1, timestamp: 1, frameWidth: source.width, frameHeight: source.height, generation: 1, quality: request.quality, observations: [{ barcode: { text: browser.primary.rawText, format: browser.primary.format, formatClass: "matrix", engineId: "fake", cornerPoints: geometry }, frameId: 1, timestamp: 1, geometry: { cornerPoints: geometry, boundingBox: { x: 4, y: 4, width: 16, height: 16 } } }] });
      expect(tracker.getTracks()).toHaveLength(1);
    }
    await browserDecoder.dispose();
  });
});
