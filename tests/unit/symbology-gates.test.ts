import { describe, expect, it } from "vitest";
import { PUBLIC_BARCODE_FORMATS, type BarcodeFormat } from "@scanly/core";
import {
  ALPHA5_SDK_VERSION,
  allSymbologyGatesPassed,
  evaluateSymbologyGates,
  FORMAT_FAMILIES,
  formatGateFailureTable,
  isValidBaselineId,
  type CohortSummary,
  type FormatFamily,
  type PerFormatRecall,
  type SymbologyGateReport,
} from "../../scripts/symbology-gates.js";

function perfectRecall(total = 10): PerFormatRecall {
  return { total, decoded: total, recall: total ? 1 : null };
}

function allPublicRecalls(total = 10): Record<BarcodeFormat, PerFormatRecall> {
  return Object.fromEntries(
    PUBLIC_BARCODE_FORMATS.map((format) => [format, perfectRecall(total)]),
  ) as Record<BarcodeFormat, PerFormatRecall>;
}

function perfectCohort(perFormatRecall = allPublicRecalls(10)): CohortSummary {
  const resultTotal = Object.values(perFormatRecall).reduce((sum, metrics) => sum + metrics.total, 0);
  return {
    fixtureTotal: resultTotal,
    fixturePassed: resultTotal,
    resultTotal,
    exactResults: resultTotal,
    perFormatRecall,
  };
}

function realPhotoRecalls(): Record<BarcodeFormat, PerFormatRecall> {
  const recalls = Object.fromEntries(
    PUBLIC_BARCODE_FORMATS.map((format) => [format, { total: 0, decoded: 0, recall: null }]),
  ) as Record<BarcodeFormat, PerFormatRecall>;
  recalls.data_matrix = perfectRecall(3);
  recalls.pdf417 = perfectRecall(3);
  recalls.code_128 = perfectRecall(3);
  recalls.ean_13 = perfectRecall(3);
  return recalls;
}

/** Complete Alpha.5 report where every required gate passes. */
function passingReport(): SymbologyGateReport {
  const realRecalls = realPhotoRecalls();
  const resultTotal = Object.values(realRecalls).reduce((sum, metrics) => sum + metrics.total, 0);
  return {
    sdkVersion: ALPHA5_SDK_VERSION,
    sourceIdentity: {
      commitSha: "a".repeat(40),
      treeSha: "b".repeat(40),
      repositoryDirty: false,
    },
    corpus: { projectOwnedRealPhotos: 12 },
    cohorts: {
      generatedClean: perfectCohort(),
      generatedDifficult: perfectCohort(),
      generatedMixed: perfectCohort(),
      projectOwnedRealPhotos: {
        fixtureTotal: 12,
        fixturePassed: 12,
        resultTotal,
        exactResults: resultTotal,
        perFormatRecall: realRecalls,
      },
    },
    acceptedFormatMisclassificationCount: 0,
    formatSelectionAccuracy: 1,
    checksumRejectionCount: 4,
    gs1RecognitionAccuracy: { total: 4, recognized: 4, accuracy: 1 },
    mixedFormatCompleteness: { total: 4, complete: 4, rate: 1 },
    falsePositiveCount: 0,
    invalidChecksumAcceptanceCount: 0,
    realPhotoFamilyCounts: {
      data_matrix: 3,
      pdf417: 3,
      code_128: 3,
      retail: 3,
    },
  };
}

describe("symbology release gates", () => {
  it("passes every required gate for a complete report", () => {
    const gates = evaluateSymbologyGates(passingReport(), { canonicalCandidate: true });
    expect(allSymbologyGatesPassed(gates)).toBe(true);
    expect(gates.every((gate) => gate.passed)).toBe(true);
    expect(Object.keys(FORMAT_FAMILIES)).toEqual(["data_matrix", "pdf417", "code_128", "retail"]);
  });

  it.each([
    ["missing project photos", "real-photo-corpus-count", (report: SymbologyGateReport) => {
      report.corpus.projectOwnedRealPhotos = 5;
    }],
    ["incomplete family coverage", "real-photo-family-data_matrix-coverage", (report: SymbologyGateReport) => {
      report.realPhotoFamilyCounts = { ...(report.realPhotoFamilyCounts as Record<FormatFamily, number>), data_matrix: 1 };
    }],
    ["false positives", "zero-false-positives", (report: SymbologyGateReport) => {
      report.falsePositiveCount = 1;
    }],
    ["format confusion", "zero-format-misclassifications", (report: SymbologyGateReport) => {
      report.acceptedFormatMisclassificationCount = 1;
    }],
    ["invalid checksum acceptance", "zero-invalid-checksum-acceptance", (report: SymbologyGateReport) => {
      report.invalidChecksumAcceptanceCount = 1;
    }],
    ["clean recall failure", "generated-clean-data_matrix-recall", (report: SymbologyGateReport) => {
      report.cohorts.generatedClean.perFormatRecall.data_matrix = { total: 10, decoded: 5, recall: 0.5 };
    }],
    ["difficult recall failure", "generated-difficult-pdf417-recall", (report: SymbologyGateReport) => {
      report.cohorts.generatedDifficult.perFormatRecall.pdf417 = { total: 10, decoded: 7, recall: 0.7 };
    }],
    ["mixed completeness failure", "mixed-format-completeness", (report: SymbologyGateReport) => {
      report.mixedFormatCompleteness = { total: 4, complete: 3, rate: 0.75 };
    }],
    ["GS1 failure", "gs1-recognition-accuracy", (report: SymbologyGateReport) => {
      report.gs1RecognitionAccuracy = { total: 4, recognized: 3, accuracy: 0.75 };
    }],
    ["format selection failure", "format-selection-accuracy", (report: SymbologyGateReport) => {
      report.formatSelectionAccuracy = 0.9;
    }],
  ] as const)("%s fails the specific gate", (_label, gateId, mutate) => {
    const report = passingReport();
    mutate(report);
    const gates = evaluateSymbologyGates(report);
    expect(allSymbologyGatesPassed(gates)).toBe(false);
    const failed = gates.find((gate) => gate.id === gateId);
    expect(failed?.passed).toBe(false);
  });

  it("fails repository-clean in canonicalCandidate mode when the repo is dirty", () => {
    const report = passingReport();
    report.sourceIdentity.repositoryDirty = true;
    const gates = evaluateSymbologyGates(report, { canonicalCandidate: true });
    expect(allSymbologyGatesPassed(gates)).toBe(false);
    expect(gates.find((gate) => gate.id === "repository-clean")?.passed).toBe(false);
  });

  it("formats failed gates with FAILED and actual/required lines", () => {
    const report = passingReport();
    report.falsePositiveCount = 2;
    const table = formatGateFailureTable(evaluateSymbologyGates(report));
    expect(table).toContain("FAILED zero-false-positives");
    expect(table).toContain("actual: 2");
    expect(table).toContain("required: 0");
  });
});

describe("baseline ID validation", () => {
  it.each([
    "v2-alpha5-r1",
    "v2-beta1-r1",
    "v2-rc1-r1",
    "v2-r1",
    "v2-alpha4-r4",
  ])("accepts %s", (baselineId) => {
    expect(isValidBaselineId(baselineId)).toBe(true);
  });

  it.each([
    "garbage",
    "v2-alpha5",
    "alpha5-r1",
    "v2-alpha5-r",
    "",
  ])("rejects %s", (baselineId) => {
    expect(isValidBaselineId(baselineId)).toBe(false);
  });
});
