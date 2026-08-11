import { describe, expect, it } from "vitest";
import { CurvedRecoveryRoute, CurvatureEstimator } from "@scanly/core";
import { recoveryContext, releaseCandidates, syntheticFrame } from "./industrial-test-helpers.js";

describe("CurvedRecoveryRoute", () => {
  it("applies only a bounded mild cylindrical warp", async () => {
    const frame = syntheticFrame(64, 48, (x) => (x % 10 < 5 ? 20 : 230));
    const context = recoveryContext(frame, { curvature: "medium", evidence: { curvatureScore: 0.7 } });
    const estimate = new CurvatureEstimator().estimate(context);
    expect(estimate.strength).toBeLessThanOrEqual(0.28);
    const [candidate] = await new CurvedRecoveryRoute().run(frame, context);
    const point = { x: 18, y: 20 }; const roundTrip = candidate.transform.inverse(candidate.transform.forward(point));
    expect(roundTrip.x).toBeCloseTo(point.x, 2); expect(candidate.diagnostics[0]).toBe("mild-cylindrical-strip-warp");
    releaseCandidates([candidate]);
  });
});
