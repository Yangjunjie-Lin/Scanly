import { describe, expect, it } from "vitest";
import { BarcodeDifficultyAnalyzer } from "@scanly/core";
import { syntheticFrame } from "./industrial-test-helpers.js";

describe("BarcodeDifficultyAnalyzer", () => {
  it("routes low-contrast evidence without presenting it as Ground Truth", () => {
    const frame = syntheticFrame(96, 96, (x, y) => 122 + (((x >> 3) + (y >> 3)) % 2) * 5);
    const diagnosis = new BarcodeDifficultyAnalyzer().analyze(frame);
    expect(["medium", "high"]).toContain(diagnosis.lowContrast);
    expect(diagnosis.recommendedRoutes).toContain("low-contrast");
    expect(diagnosis.evidence.contrast).toBeLessThan(0.2);
    expect("groundTruth" in diagnosis).toBe(false);
  });

  it("separates motion evidence from a generic blur signal", () => {
    const frame = syntheticFrame(128, 64, (x) => (Math.floor(x / 8) % 2 ? 230 : 20));
    const diagnosis = new BarcodeDifficultyAnalyzer().analyze(frame, { blurScore: 0.04, motionEstimate: 0.55 });
    expect(diagnosis.blur).toBe("high");
    expect(diagnosis.motionBlur).toBe("high");
    expect(diagnosis.recommendedRoutes).toContain("blur");
  });

  it("reports bounded DPM likelihood rather than production support", () => {
    const frame = syntheticFrame(80, 80, (x, y) => ((x + y) % 7 === 0 ? 245 : 105));
    const diagnosis = new BarcodeDifficultyAnalyzer().analyze(frame);
    expect(diagnosis.dpmLikelihood).toBeGreaterThanOrEqual(0);
    expect(diagnosis.dpmLikelihood).toBeLessThanOrEqual(1);
  });
});
