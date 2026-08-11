import { describe, expect, it } from "vitest";
import { CandidateRegionDetector } from "@scanly/core";
import { syntheticFrame } from "./industrial-test-helpers.js";

describe("CandidateRegionDetector", () => {
  it("returns bounded likely regions around line structure", () => {
    const frame = syntheticFrame(144, 96, (x, y) => x > 36 && x < 108 && y > 20 && y < 76 ? (Math.floor(x / 3) % 2 ? 245 : 10) : 128);
    const regions = new CandidateRegionDetector({ maximumRegions: 4, minimumScore: 0.08 }).detect(frame);
    expect(regions.length).toBeGreaterThan(0);
    expect(regions.length).toBeLessThanOrEqual(4);
    expect(regions[0].boundingBox.width).toBeGreaterThan(0);
  });

  it("does not fabricate a region for a blank frame", () => {
    const frame = syntheticFrame(96, 96, () => 180);
    expect(new CandidateRegionDetector().detect(frame)).toEqual([]);
  });
});
