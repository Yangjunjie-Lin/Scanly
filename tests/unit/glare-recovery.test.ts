import { describe, expect, it } from "vitest";
import { GlareRecoveryRoute } from "@scanly/core";
import { recoveryContext, releaseCandidates, syntheticFrame } from "./industrial-test-helpers.js";

describe("GlareRecoveryRoute", () => {
  it("returns insufficient evidence when clipped highlights dominate", async () => {
    const frame = syntheticFrame(40, 40, (x) => (x < 24 ? 255 : 30));
    const context = recoveryContext(frame, { glare: "high" });
    expect(await new GlareRecoveryRoute().run(frame, context)).toEqual([]);
  });

  it("uses a saturated-region mask for local glare", async () => {
    const frame = syntheticFrame(40, 40, (x, y) => (x > 16 && x < 23 && y > 16 && y < 23 ? 255 : (x % 8 < 4 ? 30 : 220)));
    const context = recoveryContext(frame, { glare: "medium" });
    const candidates = await new GlareRecoveryRoute().run(frame, context);
    expect(candidates[0].diagnostics).toContain("saturated-region-mask");
    releaseCandidates(candidates);
  });
});
