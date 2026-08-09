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
  type ExternalOpenLicenseCohortSummary,
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

function perfectExternalCohort(): ExternalOpenLicenseCohortSummary {
  const perFormatRecall = allPublicRecalls(0);
  perFormatRecall.data_matrix = perfectRecall(3);
  perFormatRecall.pdf417 = perfectRecall(3);
  perFormatRecall.code_128 = perfectRecall(3);
  perFormatRecall.ean_13 = perfectRecall(3);
  return {
    fixtureTotal: 12,
    fixturePassed: 12,
    resultTotal: 12,
    exactResults: 12,
    perFormatRecall,
    falsePositiveCount: 0,
    formatMisclassificationCount: 0,
    gs1MisclassificationCount: 0,
    familyPhotoCounts: { data_matrix: 3, pdf417: 3, code_128: 3, retail: 3 },
    provenanceCompleteness: { complete: 12, total: 12, rate: 1 },
    redistributableLicenseCompliance: { complete: 12, total: 12, rate: 1 },
    cameraPhotographVerification: { complete: 12, total: 12, rate: 1 },
    rightsReviewCompleteness: { complete: 12, total: 12, rate: 1 },
    sensitiveDataReviewCompleteness: { complete: 12, total: 12, rate: 1 },
    publicRepositorySafety: { safe: 12, total: 12, rate: 1 },
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
  return {
    sdkVersion: ALPHA5_SDK_VERSION,
    sourceIdentity: {
      commitSha: "a".repeat(40),
      treeSha: "b".repeat(40),
      repositoryDirty: false,
    },
    corpus: { projectOwnedRealPhotos: 0, externalOpenLicenseCorpusCount: 12 },
    cohorts: {
      generatedClean: perfectCohort(),
      generatedDifficult: perfectCohort(),
      generatedMixed: perfectCohort(),
      projectOwnedRealPhotos: perfectCohort(allPublicRecalls(0)),
      externalOpenLicenseRealWorld: perfectExternalCohort(),
    },
    acceptedFormatMisclassificationCount: 0,
    formatSelectionAccuracy: 1,
    checksumRejectionCount: 4,
    checksumEvaluationErrorCount: 0,
    gs1RecognitionAccuracy: { total: 4, recognized: 4, accuracy: 1 },
    mixedFormatCompleteness: { total: 4, complete: 4, rate: 1 },
    falsePositiveCount: 0,
    invalidChecksumAcceptanceCount: 0,
    realPhotoFamilyCounts: {
      data_matrix: 0,
      pdf417: 0,
      code_128: 0,
      retail: 0,
    },
    physicalDeviceEvidence: "passed",
  };
}

describe("symbology release gates", () => {
  it("uses the curated open-license camera-photo corpus as blocking release-photo evidence", () => {
    const report = passingReport();
    report.corpus.externalOpenLicenseCorpusCount = 0;
    const gates = evaluateSymbologyGates(report);
    const external = gates.find((gate) => gate.id === "curated-open-license-real-photo-corpus-count");
    expect(external).toMatchObject({ passed: false, actual: 0, required: 12 });
    expect(allSymbologyGatesPassed(gates)).toBe(false);

    report.corpus.externalOpenLicenseCorpusCount = 12;
    const passing = evaluateSymbologyGates(report);
    expect(passing.find((gate) => gate.id === "curated-open-license-real-photo-corpus-count")?.passed).toBe(true);
    expect(passing.find((gate) => gate.id === "curated-open-license-ground-truth-present")?.passed).toBe(true);
    expect(allSymbologyGatesPassed(passing)).toBe(true);
  });

  it.each([
    ["false positives", "curated-open-license-zero-false-positives", (cohort: ExternalOpenLicenseCohortSummary) => { cohort.falsePositiveCount = 1; }],
    ["format classification", "curated-open-license-zero-format-misclassifications", (cohort: ExternalOpenLicenseCohortSummary) => { cohort.formatMisclassificationCount = 1; }],
    ["GS1 classification", "curated-open-license-zero-gs1-misclassifications", (cohort: ExternalOpenLicenseCohortSummary) => { cohort.gs1MisclassificationCount = 1; }],
    ["provenance", "curated-open-license-provenance-complete", (cohort: ExternalOpenLicenseCohortSummary) => { cohort.provenanceCompleteness.complete -= 1; }],
    ["license", "curated-open-license-license-compliant", (cohort: ExternalOpenLicenseCohortSummary) => { cohort.redistributableLicenseCompliance.complete -= 1; }],
    ["camera-photo verification", "curated-open-license-camera-photographs-verified", (cohort: ExternalOpenLicenseCohortSummary) => { cohort.cameraPhotographVerification.complete -= 1; }],
    ["rights review", "curated-open-license-rights-review-complete", (cohort: ExternalOpenLicenseCohortSummary) => { cohort.rightsReviewCompleteness.complete -= 1; }],
    ["sensitive-data review", "curated-open-license-sensitive-data-review-complete", (cohort: ExternalOpenLicenseCohortSummary) => { cohort.sensitiveDataReviewCompleteness.complete -= 1; }],
    ["public repository safety", "curated-open-license-public-repository-safe", (cohort: ExternalOpenLicenseCohortSummary) => { cohort.publicRepositorySafety.safe -= 1; }],
  ] as const)("fails the external %s regression gate", (_label, gateId, mutate) => {
    const report = passingReport();
    const cohort = report.cohorts.externalOpenLicenseRealWorld as ExternalOpenLicenseCohortSummary;
    mutate(cohort);
    const gates = evaluateSymbologyGates(report, { gateMode: "integration" });
    expect(gates.find((gate) => gate.id === gateId)?.passed).toBe(false);
    expect(allSymbologyGatesPassed(gates)).toBe(false);
  });

  it("passes every required gate for a complete report", () => {
    const gates = evaluateSymbologyGates(passingReport(), { canonicalCandidate: true });
    expect(allSymbologyGatesPassed(gates)).toBe(true);
    expect(gates.every((gate) => gate.passed)).toBe(true);
    expect(gates.find((gate) => gate.id === "zero-invalid-checksum-acceptance"))
      .toMatchObject({ passed: true, actual: 0, required: 0, details: "4/4 maintained checksum_invalid fixtures rejected" });
    expect(Object.keys(FORMAT_FAMILIES)).toEqual(["data_matrix", "pdf417", "code_128", "retail"]);
  });

  it.each([
    ["missing", undefined],
    ["NaN", Number.NaN],
    ["infinite", Number.POSITIVE_INFINITY],
    ["negative", -1],
    ["fractional", 0.5],
    ["string", "0"],
    ["null", null],
  ] as const)("fails closed when invalidChecksumAcceptanceCount is %s", (_label, value) => {
    const report = passingReport();
    const runtimeReport = report as unknown as { invalidChecksumAcceptanceCount?: unknown };
    if (value === undefined) delete runtimeReport.invalidChecksumAcceptanceCount;
    else runtimeReport.invalidChecksumAcceptanceCount = value;

    const gates = evaluateSymbologyGates(report);
    expect(gates.find((gate) => gate.id === "zero-invalid-checksum-acceptance"))
      .toMatchObject({ passed: false, actual: -1, required: 0 });
    expect(allSymbologyGatesPassed(gates)).toBe(false);
  });

  it.each([
    ["missing", undefined],
    ["zero", 0],
    ["NaN", Number.NaN],
    ["infinite", Number.POSITIVE_INFINITY],
    ["negative", -1],
    ["fractional", 3.5],
    ["string", "4"],
  ] as const)("fails closed when checksumRejectionCount is %s", (_label, value) => {
    const report = passingReport();
    const runtimeReport = report as unknown as { checksumRejectionCount?: unknown };
    if (value === undefined) delete runtimeReport.checksumRejectionCount;
    else runtimeReport.checksumRejectionCount = value;

    const gates = evaluateSymbologyGates(report);
    expect(gates.find((gate) => gate.id === "zero-invalid-checksum-acceptance"))
      .toMatchObject({ passed: false, actual: 0, required: 0 });
    expect(allSymbologyGatesPassed(gates)).toBe(false);
  });

  it.each([
    ["missing", undefined],
    ["NaN", Number.NaN],
    ["infinite", Number.POSITIVE_INFINITY],
    ["negative", -1],
    ["fractional", 0.5],
    ["string", "0"],
  ] as const)("fails closed when checksumEvaluationErrorCount is %s", (_label, value) => {
    const report = passingReport();
    const runtimeReport = report as unknown as { checksumEvaluationErrorCount?: unknown };
    if (value === undefined) delete runtimeReport.checksumEvaluationErrorCount;
    else runtimeReport.checksumEvaluationErrorCount = value;

    const gates = evaluateSymbologyGates(report);
    expect(gates.find((gate) => gate.id === "zero-checksum-evaluation-errors"))
      .toMatchObject({ passed: false, actual: -1, required: 0 });
    expect(allSymbologyGatesPassed(gates)).toBe(false);
  });

  it("blocks engine/input errors instead of counting them as checksum rejection", () => {
    const report = passingReport();
    report.checksumRejectionCount = 3;
    report.checksumEvaluationErrorCount = 1;
    const gates = evaluateSymbologyGates(report);
    expect(gates.find((gate) => gate.id === "zero-invalid-checksum-acceptance"))
      .toMatchObject({ passed: true, details: "3/4 maintained checksum_invalid fixtures rejected" });
    expect(gates.find((gate) => gate.id === "zero-checksum-evaluation-errors"))
      .toMatchObject({ passed: false, actual: 1, required: 0 });
    expect(allSymbologyGatesPassed(gates)).toBe(false);
  });

  it("keeps project-owned photographs informational and independent from the curated photo gate", () => {
    const report = passingReport();
    report.corpus.projectOwnedRealPhotos = 0;
    report.cohorts.projectOwnedRealPhotos = {
      fixtureTotal: 0,
      fixturePassed: 0,
      resultTotal: 0,
      exactResults: 0,
      perFormatRecall: realPhotoRecalls(),
    };
    report.realPhotoFamilyCounts = { data_matrix: 0, pdf417: 0, code_128: 0, retail: 0 };

    const release = evaluateSymbologyGates(report, { gateMode: "release" });
    expect(allSymbologyGatesPassed(release)).toBe(true);
    expect(release.find((gate) => gate.id === "project-owned-real-photo-count-informational"))
      .toMatchObject({ passed: true, actual: 0, releaseRequired: false });
  });

  it("allows runtime integration without physical-device evidence but keeps release NO-GO", () => {
    const report = passingReport();
    report.physicalDeviceEvidence = "unavailable";
    const integration = evaluateSymbologyGates(report, { gateMode: "integration" });
    expect(allSymbologyGatesPassed(integration)).toBe(true);
    expect(integration.find((gate) => gate.id === "physical-camera-device-evidence"))
      .toMatchObject({ passed: false, releaseRequired: false });

    const release = evaluateSymbologyGates(report, { gateMode: "release" });
    expect(allSymbologyGatesPassed(release)).toBe(false);
    expect(release.find((gate) => gate.id === "physical-camera-device-evidence"))
      .toMatchObject({ passed: false, releaseRequired: true });
  });

  it("allows bounded missed detections at 80% overall and 2/3 per family", () => {
    const report = passingReport();
    const cohort = report.cohorts.externalOpenLicenseRealWorld as ExternalOpenLicenseCohortSummary;
    cohort.perFormatRecall.data_matrix = { total: 3, decoded: 2, recall: 2 / 3 };
    cohort.perFormatRecall.pdf417 = { total: 3, decoded: 2, recall: 2 / 3 };
    cohort.exactResults = 10;
    cohort.fixturePassed = 10;
    const gates = evaluateSymbologyGates(report, { gateMode: "release" });
    expect(gates.find((gate) => gate.id === "curated-real-photo-overall-recall")?.passed).toBe(true);
    expect(gates.find((gate) => gate.id === "curated-real-photo-family-data_matrix-recall")?.passed).toBe(true);
    expect(allSymbologyGatesPassed(gates)).toBe(true);
  });

  it.each([
    ["missing curated photos", "curated-open-license-real-photo-corpus-count", (report: SymbologyGateReport) => {
      report.corpus.externalOpenLicenseCorpusCount = 5;
    }],
    ["incomplete family coverage", "curated-real-photo-family-data_matrix-coverage", (report: SymbologyGateReport) => {
      const cohort = report.cohorts.externalOpenLicenseRealWorld as ExternalOpenLicenseCohortSummary;
      cohort.familyPhotoCounts = { ...cohort.familyPhotoCounts, data_matrix: 1 };
    }],
    ["overall photo recall", "curated-real-photo-overall-recall", (report: SymbologyGateReport) => {
      const cohort = report.cohorts.externalOpenLicenseRealWorld as ExternalOpenLicenseCohortSummary;
      cohort.exactResults = 9;
    }],
    ["family photo recall", "curated-real-photo-family-pdf417-recall", (report: SymbologyGateReport) => {
      const cohort = report.cohorts.externalOpenLicenseRealWorld as ExternalOpenLicenseCohortSummary;
      cohort.perFormatRecall.pdf417 = { total: 3, decoded: 1, recall: 1 / 3 };
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
