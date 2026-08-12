import { describe, expect, it } from "vitest";
import { QuietZoneRecoveryRoute } from "@scanly/core";
import { recoveryContext, releaseCandidates, syntheticFrame } from "./industrial-test-helpers.js";

describe("QuietZoneRecoveryRoute", () => {
  it("pads only outside the observed data region", async () => {
    const frame = syntheticFrame(32, 24, (x) => (x % 4 < 2 ? 0 : 255));
    const context = recoveryContext(frame, { evidence: { busyBorderRatio: 0.9 } });
    const [candidate] = await new QuietZoneRecoveryRoute().run(frame, context);
    expect(candidate.frame.width).toBeGreaterThan(frame.width);
    expect(candidate.transform.forward(candidate.transform.inverse({ x: 4, y: 5 }))).toEqual({ x: 4, y: 5 });
    expect(candidate.diagnostics).toContain("data-region-unchanged");
    releaseCandidates([candidate]);
  });
});
