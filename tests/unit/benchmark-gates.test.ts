import { describe, expect, it } from "vitest";
import { evaluateBenchmarkGates } from "../../lib/benchmark/quality-gates";
import type { BenchmarkRunSummary } from "../../lib/qr/benchmark-types";

const baseline = {
  total: 52,
  passed: 51,
  successRate: 51 / 52,
  averageMs: 1_000,
  p95Ms: 4_000,
  averageAttempts: 24,
};

function summary(overrides: Partial<BenchmarkRunSummary> = {}): BenchmarkRunSummary {
  return {
    generatedAt: "2026-01-01T00:00:00.000Z",
    total: 52,
    passed: 51,
    failed: 1,
    successRate: 51 / 52,
    averageMs: 250,
    medianMs: 100,
    p95Ms: 700,
    averageAttempts: 12,
    medianAttempts: 10,
    p95Attempts: 43,
    decoderDistribution: {},
    preprocessingDistribution: {},
    phaseTiming: {} as BenchmarkRunSummary["phaseTiming"],
    perCategory: {},
    multipleCompleteness: { total: 3, complete: 3, incomplete: [] },
    worstFixtures: [],
    regressionCount: 0,
    remainingFailures: ["14-damaged"],
    results: [
      { id: "14-damaged", attemptCount: 96 } as BenchmarkRunSummary["results"][number],
      { id: "16-multiple-codes", attemptCount: 10 } as BenchmarkRunSummary["results"][number],
      { id: "50-multiple-three", attemptCount: 43 } as BenchmarkRunSummary["results"][number],
    ],
    ...overrides,
  };
}

describe("benchmark quality gates", () => {
  it("accepts the current success, completeness, and performance contract", () => {
    expect(evaluateBenchmarkGates(summary(), baseline, { fullSuite: true })).toEqual([]);
  });

  it("rejects a fixture-expanded run that keeps 51 passes but loses rate", () => {
    const errors = evaluateBenchmarkGates(
      summary({ total: 60, passed: 51, failed: 9, successRate: 51 / 60 }),
      baseline,
      { fullSuite: true }
    );
    expect(errors.join(" ")).toContain("success rate");
  });

  it("rejects regressions, incomplete multiple sets, and hard-attempt regressions", () => {
    const bad = summary({
      regressionCount: 1,
      multipleCompleteness: { total: 3, complete: 2, incomplete: ["50-multiple-three"] },
      results: [{ id: "14-damaged", attemptCount: 111 } as BenchmarkRunSummary["results"][number]],
    });
    const errors = evaluateBenchmarkGates(bad, baseline, { fullSuite: true }).join(" ");
    expect(errors).toContain("regressed");
    expect(errors).toContain("multiple completeness");
    expect(errors).toContain("14-damaged");
  });
});
