import { describe, expect, it } from "vitest";
import { SmallModuleRecoveryRoute } from "@scanly/core";
import { recoveryContext, releaseCandidates, syntheticFrame } from "./industrial-test-helpers.js";

describe("SmallModuleRecoveryRoute", () => {
  it("uses bounded resize alternatives and maps geometry back", async () => {
    const frame = syntheticFrame(32, 32, (x, y) => ((x + y) % 2 ? 0 : 255));
    const context = recoveryContext(frame, { smallModule: "high", evidence: { estimatedPixelsPerModule: 1.1 } });
    const candidates = await new SmallModuleRecoveryRoute().run(frame, context);
    expect(candidates[0].frame.width).toBeGreaterThan(frame.width);
    expect(candidates.length).toBeLessThanOrEqual(2);
    const original = candidates[0].transform.forward({ x: 10, y: 10 });
    expect(original.x).toBeLessThan(10);
    releaseCandidates(candidates);
  });
});
