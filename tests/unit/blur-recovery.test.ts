import { describe, expect, it } from "vitest";
import { BlurRecoveryRoute } from "@scanly/core";
import { recoveryContext, releaseCandidates, syntheticFrame } from "./industrial-test-helpers.js";

describe("BlurRecoveryRoute", () => {
  it("runs only after blur diagnosis and selects directional enhancement", async () => {
    const frame = syntheticFrame(40, 40, (x) => (x < 20 ? 80 : 170));
    const route = new BlurRecoveryRoute();
    expect(route.supports(recoveryContext(frame))).toBe(false);
    const context = recoveryContext(frame, { motionBlur: "high", evidence: { anisotropy: 0.8 } });
    const candidates = await route.run(frame, context);
    expect(candidates[0].diagnostics).toContain("direction-aware-horizontal-unsharp-mask");
    releaseCandidates(candidates);
  });
});
