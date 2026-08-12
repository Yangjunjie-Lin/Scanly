import { describe, expect, it } from "vitest";
import { LowContrastRecoveryRoute } from "@scanly/core";
import { recoveryContext, releaseCandidates, syntheticFrame } from "./industrial-test-helpers.js";

describe("LowContrastRecoveryRoute", () => {
  it("produces bounded local normalization and adaptive threshold candidates", async () => {
    const frame = syntheticFrame(48, 48, (x, y) => 120 + ((x >> 3) + (y >> 3)) % 2 * 6);
    const context = recoveryContext(frame, { lowContrast: "high" });
    const candidates = await new LowContrastRecoveryRoute().run(frame, context);
    expect(candidates.map((candidate) => candidate.diagnostics[0])).toEqual([
      "local-contrast-normalization", "clahe-like-clipped-local-contrast", "adaptive-threshold",
    ]);
    expect(candidates.length).toBeLessThanOrEqual(context.budget.maximumCandidates!);
    releaseCandidates(candidates);
    expect(context.memory.observation.currentBytes).toBe(0);
  });
});
