import type { BenchmarkRunSummary } from "./types.js";

export interface BenchmarkBaseline {
  total: number;
  passed: number;
  successRate?: number;
  averageMs: number;
  medianMs: number;
  p95Ms: number;
  averageAttempts: number;
  p95Attempts: number;
  decodeRecall: number;
  exactPayloadAccuracy: number;
  falsePositiveCount: number;
  falsePositiveRate: number;
  timeoutCount: number;
  multipleCompleteness: { total: number; complete: number };
  runtime?: BenchmarkRunSummary["runtime"];
  environment?: BenchmarkRunSummary["environment"];
}

const HARD_ATTEMPT_LIMITS: Record<"fast" | "balanced" | "robust", Record<string, number>> = {
  fast: { "14-damaged": 18, "16-multiple-codes": 18, "50-multiple-three": 18 },
  balanced: { "14-damaged": 110, "16-multiple-codes": 30, "50-multiple-three": 70 },
  robust: { "14-damaged": 160, "16-multiple-codes": 40, "50-multiple-three": 90 },
};
const PROFILE_LIMITS = {
  fast: { p95Attempts: 24, timingRelative: 1.75, averageMs: 250, medianMs: 180, p95Ms: 600 },
  balanced: { p95Attempts: 100, timingRelative: 1.6, averageMs: 1_500, medianMs: 1_000, p95Ms: 4_000 },
  robust: { p95Attempts: 160, timingRelative: 1.75, averageMs: 2_000, medianMs: 1_200, p95Ms: 7_000 },
} as const;

export function evaluateBenchmarkGates(summary: BenchmarkRunSummary, baseline: BenchmarkBaseline, options: { fullSuite: boolean }): string[] {
  const failures: string[] = [];
  if (summary.regressionCount > 0) failures.push(`${summary.regressionCount} previously-passing fixture(s) regressed`);
  if (summary.environment.scenario !== "fast" && summary.multipleCompleteness.complete !== summary.multipleCompleteness.total) failures.push(`multiple completeness is ${summary.multipleCompleteness.complete}/${summary.multipleCompleteness.total}`);
  if (summary.falsePositiveCount > 0) failures.push(`${summary.falsePositiveCount} false positive(s) detected`);
  if (summary.timeoutCount > 0) failures.push(`${summary.timeoutCount} benchmark timeout(s) detected`);
  if (summary.engineInitializationFailures > 0) failures.push(`${summary.engineInitializationFailures} engine initialization failure(s)`);
  if (summary.engineExecutionFailures > 0) failures.push(`${summary.engineExecutionFailures} engine execution failure(s)`);
  if (summary.cancellationCorrectness.passed !== summary.cancellationCorrectness.total) failures.push(`cancellation correctness is ${summary.cancellationCorrectness.passed}/${summary.cancellationCorrectness.total}`);
  if (summary.phaseTimingAvailability.passed !== summary.phaseTimingAvailability.total) failures.push(`phase timing availability is ${summary.phaseTimingAvailability.passed}/${summary.phaseTimingAvailability.total}`);

  if (options.fullSuite) {
    if (!baseline.environment || !baseline.runtime) failures.push("baseline lacks required environment metadata");
    else {
      const compatible = baseline.environment.scenario === summary.environment.scenario
        && baseline.environment.datasetManifestHash === summary.environment.datasetManifestHash
        && baseline.runtime.kind === summary.runtime.kind
        && baseline.runtime.platform === summary.runtime.platform
        && baseline.runtime.arch === summary.runtime.arch
        && baseline.runtime.nodeVersion?.split(".")[0] === summary.runtime.nodeVersion?.split(".")[0];
      if (!compatible) failures.push("benchmark environment is incompatible with the selected immutable baseline");
    }
    if (summary.passed < baseline.passed) failures.push(`passed ${summary.passed}; baseline is ${baseline.passed}`);
    if (summary.decodeRecall + Number.EPSILON < baseline.decodeRecall) failures.push(`decode recall ${(summary.decodeRecall * 100).toFixed(2)}% is below baseline ${(baseline.decodeRecall * 100).toFixed(2)}%`);
    if (summary.exactPayloadAccuracy + Number.EPSILON < baseline.exactPayloadAccuracy) failures.push(`exact payload accuracy ${(summary.exactPayloadAccuracy * 100).toFixed(2)}% is below baseline`);
    if (summary.falsePositiveRate > baseline.falsePositiveRate || summary.falsePositiveCount > baseline.falsePositiveCount) failures.push("false-positive rate/count exceed baseline");
    if (summary.multipleCompleteness.complete < baseline.multipleCompleteness.complete) failures.push("multiple-code completeness is below baseline");
    if (summary.averageAttempts > baseline.averageAttempts * 1.15) failures.push(`average attempts ${summary.averageAttempts.toFixed(1)} exceed baseline tolerance`);
    const limits = PROFILE_LIMITS[summary.environment.scenario];
    if (summary.p95Attempts > Math.min(limits.p95Attempts, Math.ceil(baseline.p95Attempts * 1.15))) failures.push(`P95 attempts ${summary.p95Attempts.toFixed(1)} exceed profile limit`);
    if (summary.averageMs > baseline.averageMs * limits.timingRelative || summary.averageMs > limits.averageMs) failures.push(`average latency exceeds ${limits.timingRelative}x baseline or ${limits.averageMs}ms absolute limit`);
    if (summary.medianMs > baseline.medianMs * limits.timingRelative || summary.medianMs > limits.medianMs) failures.push(`median latency exceeds ${limits.timingRelative}x baseline or ${limits.medianMs}ms absolute limit`);
    if (summary.p95Ms > baseline.p95Ms * limits.timingRelative || summary.p95Ms > limits.p95Ms) failures.push(`P95 latency exceeds ${limits.timingRelative}x baseline or ${limits.p95Ms}ms absolute limit`);
  }

  for (const result of summary.results) {
    const limit = HARD_ATTEMPT_LIMITS[summary.environment.scenario][result.id];
    if (limit !== undefined && result.attemptCount > limit) failures.push(`${result.id} used ${result.attemptCount} attempts; limit is ${limit}`);
  }
  return failures;
}
