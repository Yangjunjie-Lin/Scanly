import { describe, expect, it } from "vitest";
import { BoundedFrameArtifactStore, FrameMemoryBudget } from "@scanly/core";

describe("frame memory budget", () => {
  it("shares accounting, releases on disposal, and ignores double release", () => {
    const budget = new FrameMemoryBudget(100);
    const direct = budget.reserve(30, "direct");
    const store = new BoundedFrameArtifactStore(4, 100, budget);
    store.set("candidate", new Uint8Array(50), 50);
    expect(budget.retainedBytes).toBe(80);
    expect(() => budget.reserve(21, "overflow")).toThrow(/budget exceeded/);
    store.dispose();
    expect(budget.retainedBytes).toBe(30);
    direct.release(); direct.release();
    expect(budget.retainedBytes).toBe(0);
    expect(budget.observation.peakControlledBytes).toBe(80);
    expect(budget.observation.currentControlledBytes).toBe(0);
  });

  it("accounts scratch/cache/artifact categories and resizes replacement by delta", () => {
    const budget = new FrameMemoryBudget(100);
    const scratch = budget.reserveScratch(40, "orientation-output");
    expect(budget.observation.transientScratchBytes).toBe(40);
    scratch.reclassify("artifact", "upright-frame");
    budget.resize(scratch, 60);
    expect(budget.observation).toMatchObject({ currentControlledBytes: 60, peakControlledBytes: 60, retainedArtifactBytes: 60, transientScratchBytes: 0 });
    const cache = budget.reserve(20, "preprocess", "cache");
    expect(budget.observation.retainedCacheBytes).toBe(20);
    expect(() => budget.resize(scratch, 81)).toThrow(/budget exceeded/);
    budget.releaseAll();
    scratch.release(); cache.release();
    expect(budget.observation.currentControlledBytes).toBe(0);
  });
});
