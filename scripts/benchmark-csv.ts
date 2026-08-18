import type { BenchmarkFixtureResult, BenchmarkRunSummary } from "@scanly/benchmark";
import { toCsvRow } from "@scanly/benchmark";

export const BENCHMARK_CSV_COLUMNS = [
  "id",
  "category",
  "expectedPayload",
  "actualPayload",
  "allPayloads",
  "pass",
  "elapsedMs",
  "successfulDecoder",
  "preprocessingPath",
  "candidateIndex",
  "attemptCount",
  "failureReason",
  "missingPayloads",
  "unexpectedPayloads",
  "requiredPayloadCount",
  "decodedPayloadCount",
  "candidateGenerationMs",
  "engineMs",
  "preprocessMs",
  "rotationMs",
  "timeToFirstResultMs",
  "controlledMemoryPeakBytes",
] as const;

export function benchmarkResultsToCsv(results: readonly BenchmarkFixtureResult[]): string {
  const rows = results.map((result) =>
    toCsvRow([
      result.id,
      result.category,
      Array.isArray(result.expectedPayload) ? result.expectedPayload.join("|") : result.expectedPayload,
      result.actualPayload ?? "",
      result.allPayloads.join("|"),
      result.pass ? "pass" : "fail",
      result.elapsedMs.toFixed(1),
      result.successfulDecoder ?? "",
      result.preprocessingPath ?? "",
      result.candidateIndex ?? "",
      result.attemptCount,
      result.failureReason ?? "",
      (result.missingPayloads ?? []).join("|"),
      (result.unexpectedPayloads ?? []).join("|"),
      result.requiredPayloadCount ?? "",
      result.decodedPayloadCount ?? "",
      result.phaseTiming?.candidateGenerationMs ?? "",
      result.phaseTiming?.engineMs ? JSON.stringify(result.phaseTiming.engineMs) : "",
      result.phaseTiming?.preprocessMs ?? "",
      result.phaseTiming?.rotationMs ?? "",
      result.timeToFirstResultMs ?? "",
      result.controlledMemoryPeakBytes ?? "",
    ])
  );
  return [BENCHMARK_CSV_COLUMNS.join(","), ...rows].join("\n");
}

export function validateBenchmarkCsv(csv: string, report: BenchmarkRunSummary): string[] {
  const failures: string[] = [];
  const normalized = csv.replace(/\r\n/g, "\n").replace(/\n$/, "");
  const expected = benchmarkResultsToCsv(report.results);
  const lines = normalized.split("\n");
  const ids = lines.slice(1).map((line) => line.split(",", 1)[0]);

  if (lines[0] !== BENCHMARK_CSV_COLUMNS.join(",")) failures.push("CSV header is incompatible");
  if (lines.length - 1 !== report.results.length) failures.push("CSV row count does not match JSON results");
  if (JSON.stringify(ids) !== JSON.stringify(report.results.map((result) => result.id))) failures.push("CSV fixture IDs do not match JSON results");
  if (normalized !== expected) failures.push("CSV fixture metadata does not match JSON results");
  return failures;
}
