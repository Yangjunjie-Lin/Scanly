import { describe, expect, it } from "vitest";
import { IlluminationRecoveryRoute } from "@scanly/core";
import { recoveryContext, releaseCandidates, syntheticFrame } from "./industrial-test-helpers.js";

describe("IlluminationRecoveryRoute", () => {
  it("uses a local background estimate for a dark-edge bright-center frame", async () => {
    const frame = syntheticFrame(60, 40, (x) => 40 + Math.round(170 * (1 - Math.abs(x - 30) / 30)));
    const context = recoveryContext(frame, { underexposure: "medium", evidence: { illuminationVariation: 0.5 } });
    const [candidate] = await new IlluminationRecoveryRoute().run(frame, context);
    expect(candidate.diagnostics).toContain("local-background-illumination-estimate");
    expect(candidate.frame.width).toBe(frame.width);
    releaseCandidates([candidate]);
  });
});
