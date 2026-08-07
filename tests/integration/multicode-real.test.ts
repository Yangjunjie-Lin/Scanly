import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { createNodeCaptureRouter, loadNormalizedFrameFromPath } from "@scanly/node";
import { getBuiltinScenario } from "@scanly/scenario-schema";
import type { BenchmarkFixture } from "@scanly/benchmark";

const fixtures = (JSON.parse(fs.readFileSync("fixtures/manifest.json", "utf8")) as { fixtures: BenchmarkFixture[] }).fixtures;

describe("real multi-code Router evidence", () => {
  it.each([
    ["64-multiple-five", 5, "balanced"],
    ["65-multiple-eight", 8, "balanced"],
    ["66-multiple-twelve", 12, "robust"],
    ["67-multiple-same-two", 2, "balanced"],
    ["68-multiple-same-three", 3, "balanced"],
  ] as const)("returns complete ordered physical instances for %s", async (id, count, profile) => {
    const fixture = fixtures.find((entry) => entry.id === id)!;
    const scenario = getBuiltinScenario(profile);
    // V8 instrumentation makes the five-code result aggregation exceed the
    // production 12 s wall-clock budget on Windows. This suite is a
    // correctness/instance-order contract; normal benchmarks retain and gate
    // the unmodified production deadline.
    if (process.env.npm_lifecycle_event === "test:coverage") scenario.budgets.maxExecutionMs = Math.max(20_000, scenario.budgets.maxExecutionMs);
    const router = createNodeCaptureRouter({ scenario });
    try {
      const outcome = await router.scan(await loadNormalizedFrameFromPath(fixture.file, id));
      expect(outcome.ok, outcome.ok ? undefined : `${outcome.error.code}: ${outcome.error.message}`).toBe(true);
      if (!outcome.ok) return;
      expect(outcome.results).toHaveLength(count);
      expect(outcome.results.map((result) => result.rawText)).toEqual(fixture.requiredInstances?.flatMap((entry) => Array.from({ length: entry.count }, () => entry.payload)) ?? fixture.requiredPayloads);
      const centers = outcome.results.map((result) => {
        const points = result.cornerPoints ?? [];
        return { x: points.reduce((sum, point) => sum + point.x, 0) / points.length, y: points.reduce((sum, point) => sum + point.y, 0) / points.length };
      });
      expect(centers.every((center, index) => index === 0 || center.y >= centers[index - 1].y - 5 || center.x >= centers[index - 1].x)).toBe(true);
    } finally { await router.dispose(); }
  }, 30_000);
});
