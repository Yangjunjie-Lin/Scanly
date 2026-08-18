import { describe, expect, it } from "vitest";
import { summarizeBenchmarkVariance, summarizeIterationCorrectness } from "@scanly/benchmark";

describe("benchmark repeated measurement", () => {
  it("separates same-fixture run variance from cross-fixture latency spread", () => {
    const variance = summarizeBenchmarkVariance([
      { elapsedMs: 10, runTimingsMs: [9, 10, 11] },
      { elapsedMs: 100, runTimingsMs: [99, 100, 101] },
    ]);
    expect(variance.perFixtureRunStdDevMs.average).toBeCloseTo(0.816, 2);
    expect(variance.fixtureLatencySpreadMs.standardDeviation).toBe(45);
    expect(variance.suiteDurationMs).toBe(330);
  });

  it("fails a fixture on one failed iteration and records unstable payloads", () => {
    const summary = summarizeIterationCorrectness([
      { pass: true, allPayloads: ["A"], elapsedMs: 10 },
      { pass: false, allPayloads: ["B"], elapsedMs: 11 },
      { pass: true, allPayloads: ["A"], elapsedMs: 9 },
    ]);
    expect(summary).toMatchObject({ pass: false, iterationPassCount: 2, iterationFailureCount: 1, unstablePayload: true, runTimingsMs: [10, 11, 9] });
  });
});
