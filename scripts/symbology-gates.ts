import type { BarcodeFormat } from "@scanly/scenario-schema";

/** Current development SDK version; retained alias keeps Alpha.5 gate imports source-compatible. */
export const CURRENT_SDK_VERSION = "2.0.1";
export const ALPHA5_SDK_VERSION = CURRENT_SDK_VERSION;

export interface SymbologyGateResult {
  id: string;
  passed: boolean;
  actual: number | boolean;
  required: number | boolean;
  details?: string;
  /** Informational/non-release gates are reported but do not block canonical release evaluation. */
  releaseRequired?: boolean;
}

export type SymbologyGateMode = "integration" | "release";

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

export interface ExternalOpenLicenseCohortSummary extends CohortSummary {
  falsePositiveCount: number;
  formatMisclassificationCount: number;
  gs1MisclassificationCount: number;
  familyPhotoCounts: Record<FormatFamily, number>;
  provenanceCompleteness: { complete: number; total: number; rate: number | null };
  redistributableLicenseCompliance: { complete: number; total: number; rate: number | null };
  cameraPhotographVerification: { complete: number; total: number; rate: number | null };
  rightsReviewCompleteness: { complete: number; total: number; rate: number | null };
  sensitiveDataReviewCompleteness: { complete: number; total: number; rate: number | null };
  publicRepositorySafety: { safe: number; total: number; rate: number | null };
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
    externalOpenLicenseRealWorld?: ExternalOpenLicenseCohortSummary;
  };
  corpus: {
    projectOwnedRealPhotos: number;
    externalOpenLicenseCorpusCount?: number;
  };
  acceptedFormatMisclassificationCount: number;
  formatSelectionAccuracy: number | null;
  checksumRejectionCount: number;
  /** checksum_invalid fixtures that could not be evaluated due to a non-not-found engine/input failure. */
  checksumEvaluationErrorCount: number;
  gs1RecognitionAccuracy: { total: number; recognized: number; accuracy: number | null };
  mixedFormatCompleteness: { total: number; complete: number; rate: number | null };
  falsePositiveCount: number;
  gates?: Record<string, boolean>;
  /** Count of checksum_invalid negatives that produced any decode. */
  invalidChecksumAcceptanceCount: number;
  /** Historical project-owned counts, retained only as informational evidence. */
  realPhotoFamilyCounts?: Record<FormatFamily, number>;
  /** Independent physical-camera/device evidence; photo fixtures cannot satisfy it. */
  physicalDeviceEvidence?: "passed" | "unavailable";
  gateMode?: SymbologyGateMode;
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
  return report.cohorts.externalOpenLicenseRealWorld?.familyPhotoCounts[family] ?? 0;
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
  options: { canonicalCandidate?: boolean; gateMode?: SymbologyGateMode } = {},
): SymbologyGateResult[] {
  const gates: SymbologyGateResult[] = [];
  const releaseMode = (options.gateMode ?? "release") === "release";
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

  const invalidChecksumAcceptanceCount = report.invalidChecksumAcceptanceCount;
  const checksumRejectionCount = report.checksumRejectionCount;
  const checksumEvaluationErrorCount = report.checksumEvaluationErrorCount;
  const acceptanceCountValid = Number.isSafeInteger(invalidChecksumAcceptanceCount)
    && invalidChecksumAcceptanceCount >= 0;
  const rejectionCountValid = Number.isSafeInteger(checksumRejectionCount)
    && checksumRejectionCount >= 0;
  const evaluationErrorCountValid = Number.isSafeInteger(checksumEvaluationErrorCount)
    && checksumEvaluationErrorCount >= 0;
  // Accepted, explicitly not-found, and evaluation-error outcomes form the exhaustive
  // partition. Engine/input failures are never allowed to masquerade as checksum rejection.
  const checksumInvalidTotal = acceptanceCountValid && rejectionCountValid && evaluationErrorCountValid
    ? invalidChecksumAcceptanceCount + checksumRejectionCount + checksumEvaluationErrorCount
    : 0;
  push({
    id: "zero-invalid-checksum-acceptance",
    passed: acceptanceCountValid
      && rejectionCountValid
      && checksumInvalidTotal > 0
      && invalidChecksumAcceptanceCount === 0,
    actual: acceptanceCountValid ? invalidChecksumAcceptanceCount : -1,
    required: 0,
    details: !acceptanceCountValid
      ? "invalidChecksumAcceptanceCount is missing or is not a non-negative safe integer"
      : !rejectionCountValid || !evaluationErrorCountValid || checksumInvalidTotal <= 0
        ? "checksum outcome counts must establish a positive exhaustive checksum_invalid corpus denominator"
        : `${checksumRejectionCount}/${checksumInvalidTotal} maintained checksum_invalid fixtures rejected`,
  });
  push({
    id: "zero-checksum-evaluation-errors",
    passed: evaluationErrorCountValid && checksumEvaluationErrorCount === 0,
    actual: evaluationErrorCountValid ? checksumEvaluationErrorCount : -1,
    required: 0,
    details: evaluationErrorCountValid
      ? `${checksumEvaluationErrorCount}/${checksumInvalidTotal} checksum_invalid fixtures ended in engine/input errors`
      : "checksumEvaluationErrorCount is missing or is not a non-negative safe integer",
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

  const projectOwnedCount = report.corpus.projectOwnedRealPhotos;
  push({
    id: "project-owned-real-photo-count-informational",
    passed: projectOwnedCount >= 0,
    actual: projectOwnedCount,
    required: 0,
    releaseRequired: false,
    details: "optional supplemental evidence; Internet photographs remain classified as external open-license",
  });

  const curatedCount = report.corpus.externalOpenLicenseCorpusCount ?? 0;
  const curated = report.cohorts.externalOpenLicenseRealWorld;
  push({
    id: "curated-open-license-real-photo-corpus-count",
    passed: curatedCount >= 12 && curated?.fixtureTotal === curatedCount,
    actual: curatedCount,
    required: 12,
    details: curated ? `${curated.fixtureTotal} independently sourced camera photographs` : "curated cohort summary missing",
  });

  const curatedPerFormat = curated ? Object.values(curated.perFormatRecall) : [];
  const reportedResultTotal = curatedPerFormat.reduce((sum, metric) => sum + metric.total, 0);
  const reportedMatchedTotal = curatedPerFormat.reduce((sum, metric) => sum + metric.decoded, 0);
  const reportedPhotoTotal = curated
    ? Object.values(curated.familyPhotoCounts).reduce((sum, count) => sum + count, 0)
    : 0;
  const perFormatMetricsConsistent = curatedPerFormat.every((metric) => (
    metric.total >= 0
    && metric.decoded >= 0
    && metric.decoded <= metric.total
    && (metric.total === 0
      ? metric.recall === null
      : metric.recall !== null && Math.abs(metric.recall - metric.decoded / metric.total) <= 1e-12)
  ));
  const groundTruthPresent = curated !== undefined
    && curated.fixtureTotal === curatedCount
    && reportedPhotoTotal === curatedCount
    && curated.resultTotal > 0
    && reportedResultTotal === curated.resultTotal
    && curated.exactResults >= 0
    && curated.exactResults <= curated.resultTotal
    && reportedMatchedTotal === curated.exactResults
    && perFormatMetricsConsistent;
  push({
    id: "curated-open-license-ground-truth-present",
    passed: groundTruthPresent,
    actual: groundTruthPresent,
    required: true,
    details: curated
      ? `${curated.exactResults}/${curated.resultTotal} expected semantic results observed`
      : "curated cohort summary missing",
  });

  push({
    id: "curated-open-license-zero-false-positives",
    passed: curated?.falsePositiveCount === 0,
    actual: curated?.falsePositiveCount ?? -1,
    required: 0,
  });
  push({
    id: "curated-open-license-zero-format-misclassifications",
    passed: curated?.formatMisclassificationCount === 0,
    actual: curated?.formatMisclassificationCount ?? -1,
    required: 0,
  });
  push({
    id: "curated-open-license-zero-gs1-misclassifications",
    passed: curated?.gs1MisclassificationCount === 0,
    actual: curated?.gs1MisclassificationCount ?? -1,
    required: 0,
  });

  const pushCompleteCohortGate = (
    id: string,
    metric: { complete: number; total: number } | undefined,
  ) => {
    const complete = metric !== undefined
      && metric.total === curatedCount
      && metric.complete === metric.total;
    push({
      id,
      passed: complete,
      actual: complete,
      required: true,
      details: metric ? `${metric.complete}/${metric.total}` : "curated cohort summary missing",
    });
  };
  pushCompleteCohortGate("curated-open-license-provenance-complete", curated?.provenanceCompleteness);
  pushCompleteCohortGate("curated-open-license-license-compliant", curated?.redistributableLicenseCompliance);
  pushCompleteCohortGate("curated-open-license-camera-photographs-verified", curated?.cameraPhotographVerification);
  pushCompleteCohortGate("curated-open-license-rights-review-complete", curated?.rightsReviewCompleteness);
  pushCompleteCohortGate("curated-open-license-sensitive-data-review-complete", curated?.sensitiveDataReviewCompleteness);

  const publicRepositorySafe = curated !== undefined
    && curated.publicRepositorySafety.total === curatedCount
    && curated.publicRepositorySafety.safe === curated.publicRepositorySafety.total;
  push({
    id: "curated-open-license-public-repository-safe",
    passed: publicRepositorySafe,
    actual: publicRepositorySafe,
    required: true,
    details: curated
      ? `${curated.publicRepositorySafety.safe}/${curated.publicRepositorySafety.total}`
      : "curated cohort summary missing",
  });

  for (const family of Object.keys(FORMAT_FAMILIES) as FormatFamily[]) {
    const count = familyPhotoCount(report, family);
    push({
      id: `curated-real-photo-family-${family}-coverage`,
      passed: count >= 3,
      actual: count,
      required: 3,
    });
  }

  const overallRecall = curated?.resultTotal
    ? curated.exactResults / curated.resultTotal
    : null;
  push({
    id: "curated-real-photo-overall-recall",
    passed: curatedCount >= 12 && overallRecall !== null && overallRecall + 1e-12 >= 0.8,
    actual: overallRecall ?? 0,
    required: 0.8,
    details: curated?.resultTotal
      ? `${curated.exactResults}/${curated.resultTotal}`
      : "curated result denominator missing",
  });

  for (const family of Object.keys(FORMAT_FAMILIES) as FormatFamily[]) {
    const metrics = curated ? familyRecall(curated, family) : { total: 0, decoded: 0, recall: null };
    push({
      id: `curated-real-photo-family-${family}-recall`,
      passed: metrics.total > 0 && (metrics.recall ?? 0) + 1e-12 >= 2 / 3,
      actual: metrics.recall ?? 0,
      required: 2 / 3,
      details: metrics.total
        ? `${metrics.decoded}/${metrics.total}`
        : "family denominator missing",
    });
  }

  push({
    id: "physical-camera-device-evidence",
    passed: report.physicalDeviceEvidence === "passed",
    actual: report.physicalDeviceEvidence === "passed",
    required: true,
    releaseRequired: releaseMode ? true : false,
    details: report.physicalDeviceEvidence === "passed"
      ? "independent physical-camera/device evidence is available"
      : "unavailable; curated photographs do not exercise a physical camera device",
  });

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
