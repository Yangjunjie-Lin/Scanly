import { describe, expect, it } from "vitest";
import { evaluateBenchmarkGates, type BenchmarkRunSummary } from "@scanly/benchmark";

const baseline = {
  total: 52,
  passed: 51,
  successRate: 51 / 52,
  averageMs: 1_000,
  medianMs: 500,
  p95Ms: 4_000,
  averageAttempts: 24,
  p95Attempts: 96,
  decodeRecall: 49 / 50,
  exactPayloadAccuracy: 49 / 50,
  falsePositiveCount: 0,
  falsePositiveRate: 0,
  timeoutCount: 0,
  multipleCompleteness: { total: 3, complete: 3 },
  runtime: { kind: "node" as const, nodeVersion: "v24.0.0", platform: "win32", arch: "x64" },
  environment: { gitCommit: "abc", sdkVersion: "2", scenario: "balanced" as const, datasetManifestHash: "hash", fixtureCount: 52, date: "2026-01-01", warmupPolicy: "one", iterationCount: 1 },
};

function summary(overrides: Partial<BenchmarkRunSummary> = {}): BenchmarkRunSummary {
  return {
    schemaVersion: "2.0",
    runtime: { kind: "node", nodeVersion: "v24.0.0", platform: "win32", arch: "x64" },
    environment: { gitCommit: "def", sdkVersion: "2", scenario: "balanced", datasetManifestHash: "hash", fixtureCount: 52, date: "2026-01-01", warmupPolicy: "one", iterationCount: 1 },
    generatedAt: "2026-01-01T00:00:00.000Z",
    total: 52,
    passed: 51,
    failed: 1,
    successRate: 51 / 52,
    averageMs: 250,
    medianMs: 100,
    p95Ms: 700,
    p99Ms: null,
    positiveCases: 49,
    decodeRecall: 49 / 50,
    exactPayloadAccuracy: 49 / 50,
    negativeCases: 3,
    falsePositiveCount: 0,
    falsePositiveRate: 0,
    timeoutCount: 0,
    cancellationCorrectness: { passed: 1, total: 1 },
    engineInitializationFailures: 0,
    timeToFirstResult: { average: 1, median: 1, p95: 1 },
    averageAttempts: 12,
    medianAttempts: 10,
    p95Attempts: 43,
    decoderDistribution: {},
    preprocessingDistribution: {},
    candidateDistribution: {},
    perFormatRecall: {},
    memoryObservations: [],
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
  } as BenchmarkRunSummary;
}

describe("benchmark quality gates", () => {
  it("accepts the current success, completeness, and performance contract", () => {
    expect(evaluateBenchmarkGates(summary(), baseline, { fullSuite: true })).toEqual([]);
  });

  it("rejects a fixture-expanded run that loses recall", () => {
    const errors = evaluateBenchmarkGates(
      summary({ total: 60, passed: 51, failed: 9, successRate: 51 / 60, decodeRecall: 0.85 }),
      baseline,
      { fullSuite: true }
    );
    expect(errors.join(" ")).toContain("decode recall");
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
