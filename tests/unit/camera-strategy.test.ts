import { describe, expect, it } from "vitest";
import { sdkError, type ScanOutcome } from "@scanly/core";
import { CameraEscalationController } from "../../packages/browser/src/camera-strategy.js";
import { getBuiltinScenario as strategyScenario } from "@scanly/scenario-schema";

function miss(): ScanOutcome {
  return { ok: false, error: sdkError("no_symbol_found", "none"), frameId: "f", scenarioId: "fast", attemptCount: 1, timing: { totalMs: 1 } };
}

function hit(): ScanOutcome {
  const result = { format: "qr_code" as const, rawText: "TRACK", cornerPoints: [{ x: 20, y: 10 }, { x: 40, y: 10 }, { x: 40, y: 30 }, { x: 20, y: 30 }], engine: { id: "fake", version: "1" }, preprocessingPath: [], frameId: "f", structuredPayload: null, validation: { valid: true, validatorIds: [], messages: [] }, warnings: [], timing: { totalMs: 1 } };
  return { ok: true, results: [result], primary: result, frameId: "f", scenarioId: "fast", attemptCount: 1, timing: { totalMs: 1 } };
}

describe("bounded camera escalation", () => {
  it("escalates after a bounded miss threshold and returns to fast after a result", () => {
    const strategy = new CameraEscalationController({ fastMissThreshold: 2, maximumEscalationAttempts: 2 });
    strategy.observe(miss()); strategy.observe(miss());
    expect(strategy.escalated).toBe(true);
    expect(strategy.nextScenario().id).toBe("fast.camera-escalated");
    strategy.observe(hit(), 100);
    expect(strategy.escalated).toBe(false);
  });

  it("preserves caller semantics while strengthening only processing limits", () => {
    const base = strategyScenario("fast");
    base.id = "custom-camera";
    base.decoders.order = ["custom-primary", "custom-fallback"];
    base.validation = [{ id: "custom-validator", required: true }];
    base.semanticParsers = ["email"];
    const strategy = new CameraEscalationController({ fastMissThreshold: 1 });
    strategy.observe(miss());
    const escalated = strategy.nextScenario(base);
    expect(escalated.id).toBe("custom-camera.camera-escalated");
    expect(escalated.decoders).toEqual(base.decoders);
    expect(escalated.validation).toEqual(base.validation);
    expect(escalated.semanticParsers).toEqual(base.semanticParsers);
    expect(escalated.budgets.maxAttempts).toBeGreaterThanOrEqual(base.budgets.maxAttempts);
  });

  it("uses previous upright geometry as an expanded relative ROI and clears it on reset", () => {
    const strategy = new CameraEscalationController({ roiExpansion: 0.5 });
    strategy.observe(hit(), 100);
    const scenario = strategy.nextScenario(undefined, { width: 100, height: 50 }, 200);
    expect(scenario.input.roi).toEqual({ mode: "relative", x: 0.1, y: 0, width: 0.4, height: 0.8 });
    expect(strategy.activeTrack?.consecutiveFrames).toBe(1);
    strategy.reset();
    expect(strategy.activeTrack).toBeNull();
  });
});
