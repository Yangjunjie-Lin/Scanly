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
  });
});
