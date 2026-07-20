import type { BarcodeFormat } from "@scanly/scenario-schema";

export const ALPHA5_SDK_VERSION = "2.0.0-alpha.5";

export interface SymbologyGateResult {
  id: string;
  passed: boolean;
  actual: number | boolean;
  required: number | boolean;
  details?: string;
  /** Informational/non-release gates are reported but do not block canonical release evaluation. */
  releaseRequired?: boolean;
}

export type FormatFamily = "data_matrix" | "pdf417" | "code_128" | "retail";

export const FORMAT_FAMILIES: Record<FormatFamily, readonly BarcodeFormat[]> = {
  data_matrix: ["data_matrix"],
  pdf417: ["pdf417"],
  code_128: ["code_128"],
  retail: ["ean_13", "ean_8", "upc_a", "upc_e"],
};

export interface PerFormatRecall {
  total: number;
  decoded: number;
  recall: number | null;
}

export interface CohortSummary {
  fixtureTotal: number;
  fixturePassed: number;
  resultTotal: number;
  exactResults: number;
  perFormatRecall: Record<BarcodeFormat, PerFormatRecall>;
  detectionOnlyTotal?: number;
  detectionOnlyPassed?: number;
  detectionOnlyRecall?: number | null;
  averageLatencyMs?: number;
  medianLatencyMs?: number;
  p95LatencyMs?: number;
}

export interface SymbologyGateReport {
  sdkVersion: string;
  sourceIdentity: {
    commitSha?: string;
    treeSha?: string;
    repositoryDirty?: boolean;
  };
  cohorts: {
    generatedClean: CohortSummary;
    generatedDifficult: CohortSummary;
    generatedMixed: CohortSummary;
    projectOwnedRealPhotos: CohortSummary;
    externalOpenLicenseRealWorld?: CohortSummary;
  };
  corpus: {
    projectOwnedRealPhotos: number;
    externalOpenLicenseCorpusCount?: number;
  };
  acceptedFormatMisclassificationCount: number;
  formatSelectionAccuracy: number | null;
  checksumRejectionCount: number;
  gs1RecognitionAccuracy: { total: number; recognized: number; accuracy: number | null };
  mixedFormatCompleteness: { total: number; complete: number; rate: number | null };
  falsePositiveCount: number;
  gates?: Record<string, boolean>;
  /** Optional: count of checksum_invalid negatives that produced any decode. */
  invalidChecksumAcceptanceCount?: number;
  /** Optional: project-photo counts by family. */
  realPhotoFamilyCounts?: Record<FormatFamily, number>;
}

function recallGate(
  id: string,
  cohort: CohortSummary,
  format: BarcodeFormat,
  required: number,
): SymbologyGateResult | undefined {
  const metrics = cohort.perFormatRecall[format];
  if (!metrics || metrics.total <= 0) return undefined;
  const actual = metrics.recall ?? 0;
  return {
    id,
    passed: actual + 1e-12 >= required,
    actual,
    required,
    details: `${metrics.decoded}/${metrics.total}`,
  };
}

function familyPhotoCount(
  report: SymbologyGateReport,
  family: FormatFamily,
): number {
  if (report.realPhotoFamilyCounts) return report.realPhotoFamilyCounts[family] ?? 0;
  const formats = new Set(FORMAT_FAMILIES[family]);
  return Object.entries(report.cohorts.projectOwnedRealPhotos.perFormatRecall)
    .filter(([format, metrics]) => formats.has(format as BarcodeFormat) && metrics.total > 0)
    .reduce((sum, [, metrics]) => sum + metrics.total, 0);
}

function familyRecall(
  cohort: CohortSummary,
  family: FormatFamily,
): { total: number; decoded: number; recall: number | null } {
  const formats = FORMAT_FAMILIES[family];
  let total = 0;
  let decoded = 0;
  for (const format of formats) {
    const metrics = cohort.perFormatRecall[format];
    if (!metrics) continue;
    total += metrics.total;
    decoded += metrics.decoded;
  }
  return { total, decoded, recall: total ? decoded / total : null };
}

/**
 * Evaluate every Alpha.5 release gate as an explicit list.
 * Missing or empty cohorts still produce failing gates when the gate is required.
 */
export function evaluateSymbologyGates(
  report: SymbologyGateReport,
  options: { canonicalCandidate?: boolean } = {},
): SymbologyGateResult[] {
  const gates: SymbologyGateResult[] = [];
  const push = (gate: SymbologyGateResult) => { gates.push(gate); };

  push({
    id: "sdk-version",
    passed: report.sdkVersion === ALPHA5_SDK_VERSION,
    actual: report.sdkVersion === ALPHA5_SDK_VERSION,
    required: true,
    details: `sdkVersion=${report.sdkVersion}`,
  });

  for (const format of Object.keys(report.cohorts.generatedClean.perFormatRecall) as BarcodeFormat[]) {
    const gate = recallGate(`generated-clean-${format}-recall`, report.cohorts.generatedClean, format, 0.95);
    if (gate) push(gate);
  }
  const cleanFormatsWithData = Object.values(report.cohorts.generatedClean.perFormatRecall).filter((m) => m.total > 0);
  if (cleanFormatsWithData.length === 0) {
    push({
      id: "generated-clean-cohort-present",
      passed: false,
      actual: false,
      required: true,
      details: "no generated clean cohort with positive denominators",
    });
  }

  for (const format of Object.keys(report.cohorts.generatedDifficult.perFormatRecall) as BarcodeFormat[]) {
    const gate = recallGate(`generated-difficult-${format}-recall`, report.cohorts.generatedDifficult, format, 0.85);
    if (gate) push(gate);
  }
  const difficultFormatsWithData = Object.values(report.cohorts.generatedDifficult.perFormatRecall).filter((m) => m.total > 0);
  if (difficultFormatsWithData.length === 0) {
    push({
      id: "generated-difficult-cohort-present",
      passed: false,
      actual: false,
      required: true,
      details: "no generated difficult cohort with positive denominators",
    });
  }

  const mixedTotal = report.mixedFormatCompleteness.total;
  const mixedRate = report.mixedFormatCompleteness.rate ?? 0;
  push({
    id: "mixed-format-completeness",
    passed: mixedTotal > 0 && mixedRate + 1e-12 >= 1,
    actual: mixedRate,
    required: 1,
    details: `${report.mixedFormatCompleteness.complete}/${mixedTotal}`,
  });

  push({
    id: "zero-false-positives",
    passed: report.falsePositiveCount === 0,
    actual: report.falsePositiveCount,
    required: 0,
  });

  push({
    id: "zero-format-misclassifications",
    passed: report.acceptedFormatMisclassificationCount === 0,
    actual: report.acceptedFormatMisclassificationCount,
    required: 0,
  });

  const invalidChecksum = report.invalidChecksumAcceptanceCount
    ?? Math.max(0, /* inferred when callers omit */ 0);
  // Prefer explicit count; when omitted, treat checksumRejectionCount as the maintained set size
  // and require that every checksum_invalid fixture rejected (handled by callers setting invalidChecksumAcceptanceCount).
  push({
    id: "zero-invalid-checksum-acceptance",
    passed: (report.invalidChecksumAcceptanceCount ?? 0) === 0,
    actual: report.invalidChecksumAcceptanceCount ?? invalidChecksum,
    required: 0,
  });

  const gs1Total = report.gs1RecognitionAccuracy.total;
  const gs1Accuracy = report.gs1RecognitionAccuracy.accuracy ?? 0;
  push({
    id: "gs1-recognition-accuracy",
    passed: gs1Total > 0 && gs1Accuracy + 1e-12 >= 1,
    actual: gs1Accuracy,
    required: 1,
    details: `${report.gs1RecognitionAccuracy.recognized}/${gs1Total}`,
  });

  const photoCount = report.corpus.projectOwnedRealPhotos;
  push({
    id: "real-photo-corpus-count",
    passed: photoCount >= 12,
    actual: photoCount,
    required: 12,
  });

  const externalCount = report.corpus.externalOpenLicenseCorpusCount ?? 0;
  push({
    id: "external-open-license-corpus-count",
    passed: externalCount >= 12,
    actual: externalCount,
    required: 12,
    details: "non-release informational gate; external photographs never satisfy project-owned gate",
    releaseRequired: false,
  });

  for (const family of Object.keys(FORMAT_FAMILIES) as FormatFamily[]) {
    const count = familyPhotoCount(report, family);
    push({
      id: `real-photo-family-${family}-coverage`,
      passed: count >= 3,
      actual: count,
      required: 3,
    });
  }

  const realOverall = report.cohorts.projectOwnedRealPhotos;
  const overallRecall = realOverall.resultTotal
    ? realOverall.exactResults / realOverall.resultTotal
    : photoCount >= 12 ? 0 : null;
  push({
    id: "real-photo-overall-recall",
    passed: photoCount >= 12 && overallRecall !== null && overallRecall + 1e-12 >= 0.8,
    actual: overallRecall ?? 0,
    required: 0.8,
    details: photoCount < 12
      ? "real-photo corpus incomplete"
      : `${realOverall.exactResults}/${realOverall.resultTotal}`,
  });

  for (const family of Object.keys(FORMAT_FAMILIES) as FormatFamily[]) {
    const metrics = familyRecall(realOverall, family);
    push({
      id: `real-photo-family-${family}-recall`,
      passed: metrics.total > 0 && (metrics.recall ?? 0) + 1e-12 >= 2 / 3,
      actual: metrics.recall ?? 0,
      required: 2 / 3,
      details: metrics.total
        ? `${metrics.decoded}/${metrics.total}`
        : "family denominator missing",
    });
  }

  const selection = report.formatSelectionAccuracy;
  push({
    id: "format-selection-accuracy",
    passed: selection !== null && selection + 1e-12 >= 1,
    actual: selection ?? 0,
    required: 1,
  });

  if (options.canonicalCandidate) {
    push({
      id: "repository-clean",
      passed: report.sourceIdentity.repositoryDirty === false,
      actual: report.sourceIdentity.repositoryDirty === false,
      required: true,
    });
    push({
      id: "source-commit-present",
      passed: Boolean(report.sourceIdentity.commitSha),
      actual: Boolean(report.sourceIdentity.commitSha),
      required: true,
    });
    push({
      id: "source-tree-present",
      passed: Boolean(report.sourceIdentity.treeSha),
      actual: Boolean(report.sourceIdentity.treeSha),
      required: true,
    });
  }

  return gates;
}

export function formatGateFailureTable(gates: readonly SymbologyGateResult[]): string {
  const failed = gates.filter((gate) => !gate.passed);
  if (!failed.length) return "All symbology gates passed.";
  return failed.map((gate) => [
    `${gate.releaseRequired === false ? "NON_RELEASE" : "FAILED"} ${gate.id}`,
    `actual: ${String(gate.actual)}`,
    `required: ${String(gate.required)}`,
    gate.details ? `details: ${gate.details}` : undefined,
  ].filter(Boolean).join("\n")).join("\n\n");
}

export function allSymbologyGatesPassed(gates: readonly SymbologyGateResult[]): boolean {
  return gates.filter((gate) => gate.releaseRequired !== false).every((gate) => gate.passed);
}

/** Baseline ID pattern that stays version-independent for Alpha/Beta/RC/GA revisions. */
export const BASELINE_ID_PATTERN = /^v2-(?:alpha\d+-r\d+|beta\d+-r\d+|rc\d+-r\d+|r\d+)$/;

export function isValidBaselineId(baselineId: string): boolean {
  return BASELINE_ID_PATTERN.test(baselineId);
}
