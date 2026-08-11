import { describe, expect, it } from "vitest";
import { PerspectiveRecoveryRoute } from "@scanly/core";
import { recoveryContext, releaseCandidates, syntheticFrame } from "./industrial-test-helpers.js";

describe("PerspectiveRecoveryRoute", () => {
  it("rectifies one bounded quadrilateral and preserves inverse coordinates", async () => {
    const frame = syntheticFrame(80, 60, (x, y) => ((x + y) % 12 < 6 ? 20 : 235));
    const context = recoveryContext(frame, { perspectiveDistortion: "high", evidence: { perspectiveScore: 0.7 } });
    const [candidate] = await new PerspectiveRecoveryRoute().run(frame, context);
    expect(candidate.frame.width * candidate.frame.height).toBeLessThanOrEqual(context.budget.maximumRectifiedArea!);
    const point = { x: candidate.frame.width / 2, y: candidate.frame.height / 2 };
    const roundTrip = candidate.transform.inverse(candidate.transform.forward(point));
    expect(roundTrip.x).toBeCloseTo(point.x, 3); expect(roundTrip.y).toBeCloseTo(point.y, 3);
    releaseCandidates([candidate]);
  });
});
