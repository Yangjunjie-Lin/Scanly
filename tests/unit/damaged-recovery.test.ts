import { describe, expect, it } from "vitest";
import { DamagedRecoveryRoute } from "@scanly/core";
import { recoveryContext, releaseCandidates, syntheticFrame } from "./industrial-test-helpers.js";

describe("DamagedRecoveryRoute", () => {
  it("uses generic print repair while leaving payload recovery to decoder ECC", async () => {
    const frame = syntheticFrame(40, 40, (x, y) => ((x + y) % 9 === 0 ? 255 : 20));
    const context = recoveryContext(frame, { printingDamage: "high" });
    const candidates = await new DamagedRecoveryRoute().run(frame, context);
    expect(candidates).toHaveLength(2);
    expect(candidates[0].diagnostics).toContain("light-erosion-repair");
    expect(candidates[1].diagnostics).toContain("dark-contamination-repair");
    expect(candidates[0].diagnostics).toContain("decoder-ecc-left-as-authority");
    expect(candidates[0].diagnostics.join(" ")).not.toContain("14-damaged");
    releaseCandidates(candidates);
  });
});
