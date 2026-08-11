import { describe, expect, it } from "vitest";
import { IndustrialRecoveryPipeline, sdkError, type RecoveryDecodeExecutor, type ScanFailure, type ScanOutcome, type ScanResult } from "@scanly/core";
import { syntheticFrame } from "./industrial-test-helpers.js";

function failure(frameId: string): ScanFailure { return { ok: false, error: sdkError("no_symbol_found", "miss"), frameId, scenarioId: "fake", attemptCount: 1, timing: { totalMs: 1 } }; }
function success(frameId: string, text: string): ScanOutcome {
  const result: ScanResult = { format: "qr_code", rawText: text, cornerPoints: [{ x: 4, y: 4 }, { x: 20, y: 4 }, { x: 20, y: 20 }, { x: 4, y: 20 }], engine: { id: "fake", version: "1" }, preprocessingPath: [], frameId, structuredPayload: null, validation: { valid: true, validatorIds: [], messages: [] }, warnings: [], timing: { totalMs: 1 } };
  return { ok: true, results: [result], primary: result, frameId, scenarioId: "fake", attemptCount: 1, timing: { totalMs: 1 } };
}

describe("IndustrialRecoveryPipeline", () => {
  it("runs diagnosis-targeted recovery after a normal miss and releases all buffers", async () => {
    const frame = syntheticFrame(48, 48, (x, y) => 120 + (((x >> 3) + (y >> 3)) % 2) * 5, "pipeline-low-contrast");
    const decode: RecoveryDecodeExecutor = async (candidate, request) => request.routeId === "low-contrast" ? success(candidate.id, "RECOVERED") : failure(candidate.id);
    const result = await new IndustrialRecoveryPipeline({ now: (() => { let tick = 0; return () => ++tick; })() }).run(frame, decode, {
      profile: "balanced", sourceMode: "static",
      budget: { maximumRoutes: 2, maximumAttempts: 2, maximumPixelsProcessed: frame.width * frame.height * 4, maximumCandidates: 2, maximumTemporaryBytes: 2_000_000, maximumTotalMs: 100 },
    });
    expect(result.outcome.ok).toBe(true);
    if (result.outcome.ok) {
      expect(result.outcome.primary.rawText).toBe("RECOVERED");
      expect(result.outcome.primary.frameId).toBe(frame.id);
      expect(result.outcome.primary.metadata?.originalFrameGeometry).toBe(true);
      expect(result.outcome.primary.metadata?.evidenceScoreIsCalibratedProbability).toBe(false);
    }
    expect(result.diagnostics.attemptCount).toBeLessThanOrEqual(2);
    expect(result.diagnostics.successfulRoute).toBe("low-contrast");
    expect(result.memory.currentBytes).toBe(0);
    expect(result.memory.activeBuffers).toBe(0);
  });

  it("keeps recovery attempts and processed pixels bounded", async () => {
    const frame = syntheticFrame(40, 40, (x, y) => 122 + ((x + y) % 2) * 3);
    const result = await new IndustrialRecoveryPipeline().run(frame, async (candidate) => failure(candidate.id), {
      profile: "fast", sourceMode: "camera",
      budget: { maximumRoutes: 1, maximumAttempts: 1, maximumPixelsProcessed: frame.width * frame.height, maximumCandidates: 1, maximumTemporaryBytes: 1_000_000, maximumTotalMs: 100 },
    });
    expect(result.outcome.ok).toBe(false);
    expect(result.diagnostics.attemptCount).toBeLessThanOrEqual(1);
    expect(result.diagnostics.processedPixels).toBeLessThanOrEqual(frame.width * frame.height);
  });
});
