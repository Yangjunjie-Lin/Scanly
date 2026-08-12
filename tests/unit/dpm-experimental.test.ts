import { describe, expect, it } from "vitest";
import { DpmExperimentalRecoveryRoute } from "@scanly/core";
import { recoveryContext, releaseCandidates, syntheticFrame } from "./industrial-test-helpers.js";

describe("DpmExperimentalRecoveryRoute", () => {
  it("is disabled by default and explicitly experimental when enabled", async () => {
    const frame = syntheticFrame(40, 40, (x, y) => ((x + y) % 5 === 0 ? 210 : 100));
    const route = new DpmExperimentalRecoveryRoute();
    expect(route.supports(recoveryContext(frame, { dpmLikelihood: 0.9 }))).toBe(false);
    const context = recoveryContext(frame, { dpmLikelihood: 0.9 }, { profile: "dpm-experimental", dpmExperimentalEnabled: true });
    expect(route.supports(context)).toBe(true);
    const candidates = await route.run(frame, context);
    expect(candidates[0].diagnostics).toContain("experimental-dpm");
    releaseCandidates(candidates);
  });
});
