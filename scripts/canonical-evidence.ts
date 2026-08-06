import fs from "node:fs";
import path from "node:path";
import type { BenchmarkRunSummary, ComparisonReport } from "@scanly/benchmark";
import { sha256, sha256Text, stableJson } from "./benchmark-provenance.js";
import { validateBenchmarkCsv } from "./benchmark-csv.js";
import {
  allSymbologyGatesPassed,
  evaluateSymbologyGates,
  type SymbologyGateResult,
  type SymbologyGateReport,
} from "./symbology-gates.js";

export const PROFILE_KEYS = ["fast", "balanced", "robust"] as const;
export type ProfileKey = typeof PROFILE_KEYS[number];
export type LegacyEvidenceReportKey =
  | "fastJson"
  | "fastCsv"
  | "balancedJson"
  | "balancedCsv"
  | "robustJson"
  | "robustCsv"
  | "comparisonJson";
export type EvidenceReportKey = LegacyEvidenceReportKey | "symbologiesJson";
/** Historical Alpha.3/Alpha.4 report set (schema 2.0). */
export const LEGACY_EVIDENCE_REPORT_KEYS: readonly LegacyEvidenceReportKey[] = [
  "fastJson", "fastCsv", "balancedJson", "balancedCsv", "robustJson", "robustCsv", "comparisonJson",
];
/** Alpha.5+ report set (schema 2.1) includes the dedicated symbology report. */
export const EVIDENCE_REPORT_KEYS: readonly EvidenceReportKey[] = [
  ...LEGACY_EVIDENCE_REPORT_KEYS, "symbologiesJson",
];

export const PROFILE_REPORT_KEYS: Record<ProfileKey, { json: LegacyEvidenceReportKey; csv: LegacyEvidenceReportKey }> = {
  fast: { json: "fastJson", csv: "fastCsv" },
  balanced: { json: "balancedJson", csv: "balancedCsv" },
  robust: { json: "robustJson", csv: "robustCsv" },
};

export const EXPECTED_REMAINING_FAILURES: Record<ProfileKey, readonly string[]> = {
  fast: ["14-damaged", "16-multiple-codes", "36-multiple-gen", "39-high-res", "40-moire", "50-multiple-three", "64-multiple-five", "65-multiple-eight", "66-multiple-twelve", "67-multiple-same-two", "68-multiple-same-three", "69-multiple-mixed-size"],
  balanced: ["14-damaged"],
  robust: ["14-damaged"],
};

export interface ProfileCorrectnessPolicy {
  minimumPassed: number;
  minimumPositivePasses: number;
  minimumRecall: number;
  maximumFalsePositives: number;
  maximumTimeouts: number;
  allowedFailures: readonly string[];
}

export const PROFILE_CORRECTNESS_POLICIES: Record<ProfileKey, ProfileCorrectnessPolicy> = {
  fast: {
    minimumPassed: 62,
    minimumPositivePasses: 51,
    minimumRecall: 51 / 63,
    maximumFalsePositives: 0,
    maximumTimeouts: 0,
    allowedFailures: EXPECTED_REMAINING_FAILURES.fast,
  },
  balanced: {
    minimumPassed: 73,
    minimumPositivePasses: 62,
    minimumRecall: 62 / 63,
    maximumFalsePositives: 0,
    maximumTimeouts: 0,
    allowedFailures: EXPECTED_REMAINING_FAILURES.balanced,
  },
  robust: {
    minimumPassed: 73,
    minimumPositivePasses: 62,
    minimumRecall: 62 / 63,
    maximumFalsePositives: 0,
    maximumTimeouts: 0,
    allowedFailures: EXPECTED_REMAINING_FAILURES.robust,
  },
};

const ALLOWED_FAILURE_DETAILS: Record<string, { category: string; reasons: readonly string[] }> = {
  "14-damaged": { category: "damaged", reasons: ["no_symbol_found"] },
  "16-multiple-codes": { category: "multiple", reasons: ["incomplete_multiple"] },
  "36-multiple-gen": { category: "multiple", reasons: ["incomplete_multiple"] },
  "39-high-res": { category: "high_resolution", reasons: ["resource_limit_exceeded"] },
  "40-moire": { category: "screen_capture", reasons: ["no_symbol_found"] },
  "50-multiple-three": { category: "multiple", reasons: ["incomplete_multiple"] },
  "64-multiple-five": { category: "multiple", reasons: ["no_symbol_found"] },
  "65-multiple-eight": { category: "multiple", reasons: ["no_symbol_found"] },
  "66-multiple-twelve": { category: "multiple", reasons: ["incomplete_multiple"] },
  "67-multiple-same-two": { category: "multiple", reasons: ["no_symbol_found", "incomplete_multiple"] },
  "68-multiple-same-three": { category: "multiple", reasons: ["no_symbol_found"] },
  "69-multiple-mixed-size": { category: "multiple", reasons: ["incomplete_multiple"] },
};

const FLOAT_TOLERANCE = 1e-12;

function approximatelyEqual(left: number | undefined, right: number): boolean {
  return typeof left === "number" && Number.isFinite(left) && Math.abs(left - right) <= FLOAT_TOLERANCE;
}

export function validateProfileCorrectness(report: Partial<BenchmarkRunSummary>, profile: ProfileKey): string[] {
  const failures: string[] = [];
  const policy = PROFILE_CORRECTNESS_POLICIES[profile];
  const results = report.results ?? [];
  const actualPassed = results.filter((result) => result.pass).length;
  const positiveResults = results.filter((result) => result.expectedOutcome === "decode");
  const positivePassed = positiveResults.filter((result) => result.pass).length;
  const derivedRecall = positiveResults.length ? positivePassed / positiveResults.length : 0;
  const actualFailures = results.filter((result) => !result.pass);
  const actualFailureIds = actualFailures.map((result) => result.id);
  const reportedFailureIds = report.remainingFailures ?? [];

  if (report.total !== 74 || results.length !== 74) failures.push("fixture result set is not 74 entries");
  if ((report.passed ?? -1) < policy.minimumPassed) failures.push(`passed fixtures are below the ${policy.minimumPassed}/74 minimum`);
  if (report.passed !== actualPassed || report.failed !== 74 - actualPassed) failures.push("passed/failed totals do not match fixture results");
  if (!approximatelyEqual(report.successRate, actualPassed / 74)) failures.push("success rate does not match integer fixture results");
  if (report.positiveCases !== 63 || positiveResults.length !== 63) failures.push("positive fixture result set is not 63 entries");
  if (positivePassed < policy.minimumPositivePasses || derivedRecall + FLOAT_TOLERANCE < policy.minimumRecall) failures.push(`positive passes are below the ${policy.minimumPositivePasses}/63 minimum`);
  if (!approximatelyEqual(report.decodeRecall, derivedRecall) || !approximatelyEqual(report.exactPayloadAccuracy, derivedRecall)) failures.push("positive recall/exact accuracy does not match integer pass counts");
  if (report.negativeCases !== 11 || (report.falsePositiveCount ?? Number.POSITIVE_INFINITY) > policy.maximumFalsePositives) failures.push("negative/false-positive contract failed");
  if ((report.timeoutCount ?? Number.POSITIVE_INFINITY) > policy.maximumTimeouts) failures.push("report contains timeouts");
  if (new Set(reportedFailureIds).size !== reportedFailureIds.length || JSON.stringify(reportedFailureIds) !== JSON.stringify(actualFailureIds)) failures.push("remaining failures do not match failed fixture results");

  const allowed = new Set(policy.allowedFailures);
  for (const result of actualFailures) {
    if (!allowed.has(result.id)) {
      failures.push(`unexpected remaining failure: ${result.id}`);
      continue;
    }
    const expected = ALLOWED_FAILURE_DETAILS[result.id];
    if (!expected || result.category !== expected.category) failures.push(`retained failure '${result.id}' has an unexpected fixture category`);
    if (!expected?.reasons.includes(result.failureReason ?? "")) failures.push(`retained failure '${result.id}' has an unexpected failure category`);
    if (["timeout", "engine_initialization_failure", "engine_execution_failure", "internal_invariant_failure", "worker_initialization_failure"].includes(result.failureReason ?? "")) {
      failures.push(`retained failure '${result.id}' is an internal, engine, or timeout failure`);
    }
  }
  return failures;
}

export interface EvidenceCommitIdentity {
  sourceCommitSha: string;
  sourceTreeSha: string;
  evidenceCommitSha?: string;
}

export interface CanonicalFixtureCounts {
  /** Legacy QR fixture count; equals historical `fixtureCount` for compatibility. */
  legacyQr: number;
  symbologyTotal: number;
  symbologyPositive: number;
  symbologyNegative: number;
  symbologyGenerated: number;
  symbologyProjectPhotos: number;
}

export interface CanonicalEvidenceManifestV20 {
  schemaVersion: "2.0";
  evidenceId: string;
  sdkVersion: string;
  sourceIdentity: EvidenceCommitIdentity & {
    repositoryDirty: false;
    packageLockHash: string;
    datasetHash: string;
    engineCompositionHash: string;
    wasmBuildHash: string;
    nativeAdapterHash: string;
    loaderHash: string;
  };
  /** Legacy QR fixture count (74). Retained for Alpha.3/Alpha.4 readability. */
  fixtureCount: number;
  reports: Record<LegacyEvidenceReportKey, string>;
  reportHashes: Record<LegacyEvidenceReportKey, string>;
  generatedAt: string;
  manifestHash: string;
}

export interface CanonicalEvidenceManifestV21 {
  schemaVersion: "2.1";
  evidenceId: string;
  sdkVersion: string;
  sourceIdentity: EvidenceCommitIdentity & {
    repositoryDirty: false;
    packageLockHash: string;
    datasetHash: string;
    engineCompositionHash: string;
    wasmBuildHash: string;
    nativeAdapterHash: string;
    loaderHash: string;
    symbologyManifestHash: string;
    symbologyDatasetHash: string;
  };
  /** Legacy QR fixture count (74). Prefer `fixtureCounts.legacyQr` for new consumers. */
  fixtureCount: number;
  fixtureCounts: CanonicalFixtureCounts;
  reports: Record<EvidenceReportKey, string>;
  reportHashes: Record<EvidenceReportKey, string>;
  generatedAt: string;
  manifestHash: string;
}

export type CanonicalEvidenceManifest = CanonicalEvidenceManifestV20 | CanonicalEvidenceManifestV21;

export interface SymbologyEvidenceReport extends SymbologyGateReport {
  schemaVersion: string;
  sourceIdentity: SymbologyGateReport["sourceIdentity"] & {
    symbologyManifestHash?: string;
    datasetHash?: string;
  };
  corpus: SymbologyGateReport["corpus"] & {
    total?: number;
    positive?: number;
    negative?: number;
    generated?: number;
    realPhotoGateComplete?: boolean;
  };
  gateResults?: SymbologyGateResult[];
}

export interface CanonicalEvidenceBundle {
  manifestPath: string;
  manifest: CanonicalEvidenceManifest;
  reports: Record<ProfileKey, BenchmarkRunSummary> & {
    comparison: ComparisonReport;
    symbologies?: SymbologyEvidenceReport;
  };
  reportPaths: Partial<Record<EvidenceReportKey, string>> & Record<LegacyEvidenceReportKey, string>;
}

const STRATEGIES = [
  "raw-jsqr", "raw-zxing-js", "raw-zxing-cpp-wasm",
  "scanly-fast", "scanly-balanced", "scanly-robust",
  "scanly-jsqr-only", "scanly-zxing-js-only", "scanly-zxing-cpp-only",
  "scanly-js-wasm-sequential", "scanly-js-wasm-parallel-experimental",
] as const;

function manifestPayload(manifest: Omit<CanonicalEvidenceManifest, "manifestHash"> | CanonicalEvidenceManifest): string {
  const { manifestHash: _ignored, ...payload } = manifest as CanonicalEvidenceManifest;
  return stableJson(payload);
}

export function computeCanonicalManifestHash(manifest: Omit<CanonicalEvidenceManifest, "manifestHash"> | CanonicalEvidenceManifest): string {
  return sha256(manifestPayload(manifest));
}

/** Profile/comparison report hashes exist on both schema 2.0 and 2.1 manifests. */
export function legacyReportHash(manifest: CanonicalEvidenceManifest, key: LegacyEvidenceReportKey): string {
  return (manifest.reportHashes as Record<LegacyEvidenceReportKey, string>)[key];
}

function sourceFields(report: BenchmarkRunSummary | ComparisonReport) {
  return {
    sourceCommitSha: report.sourceIdentity?.commitSha,
    sourceTreeSha: report.sourceIdentity?.treeSha,
    repositoryDirty: report.sourceIdentity?.repositoryDirty,
    packageLockHash: report.sourceIdentity?.packageLockHash,
    datasetHash: report.sourceIdentity?.datasetHash,
    engineCompositionHash: report.sourceIdentity?.engineCompositionHash,
    wasmBuildHash: report.sourceIdentity?.wasmBuildHash,
    nativeAdapterHash: report.sourceIdentity?.nativeAdapterHash,
    loaderHash: report.sourceIdentity?.loaderHash,
  };
}

export function validateProfileReport(report: Partial<BenchmarkRunSummary>, profile: ProfileKey): string[] {
  const failures: string[] = [];
  if (report.schemaVersion !== "2.0") failures.push("schema version is not 2.0");
  if (!report.sourceIdentity || report.sourceIdentity.repositoryDirty !== false) failures.push("source repository is dirty or provenance is missing");
  if (!report.executionPolicy?.canonical) failures.push("execution policy is not canonical-compatible");
  if ((report.executionPolicy?.warmupIterations ?? 0) < 1) failures.push("warmup is below one iteration");
  if ((report.executionPolicy?.measuredIterations ?? 0) < 3) failures.push("measured iterations are below three");
  if (report.environment?.scenario !== profile) failures.push("profile metadata is incompatible");
  if (report.environment?.sdkVersion !== "2.0.0-alpha.5") failures.push("SDK version is not 2.0.0-alpha.5");
  if (report.runtime?.kind !== "node" || !/^v?24\./.test(report.runtime?.nodeVersion ?? "") || report.runtime?.platform !== "win32" || report.runtime?.arch !== "x64") failures.push("runtime is not Node 24 Windows x64");
  if (report.environment?.fixtureCount !== 74 || report.total !== 74) failures.push("fixture count is not 74");
  for (const field of ["wasmBuildHash", "nativeAdapterHash", "loaderHash"] as const) {
    if (!/^[a-f0-9]{64}$/.test(report.sourceIdentity?.[field] ?? "")) failures.push(`${field} is missing or invalid`);
  }
  if (!["standard", "simd"].includes(report.environment?.selectedWasmVariant ?? "")) failures.push("selected WASM variant is missing");
  if (!Number.isFinite(report.environment?.warmInitializationMs) || (report.environment?.warmInitializationMs ?? -1) < 0) failures.push("warm initialization timing is missing");
  if ((report.environment?.wasmLinearMemoryPeakBytes ?? 0) <= 0) failures.push("WASM linear-memory peak is missing");
  failures.push(...validateProfileCorrectness(report, profile));
  if ((report.engineInitializationFailures ?? -1) !== 0 || (report.engineExecutionFailures ?? -1) !== 0) failures.push("report contains engine failures");
  if (report.cancellationCorrectness?.passed !== report.cancellationCorrectness?.total) failures.push("cancellation correctness failed");
  if (report.phaseTimingAvailability?.passed !== report.phaseTimingAvailability?.total) failures.push("phase timing is incomplete");
  if (profile !== "fast" && report.multipleCompleteness?.complete !== report.multipleCompleteness?.total) failures.push("multi-code completeness failed");
  if (report.finalControlledMemoryBytes !== 0) failures.push("final controlled memory is nonzero");
  for (const field of ["wasmBuildHash", "nativeAdapterHash", "loaderHash"] as const) {
    if (!/^[a-f0-9]{64}$/.test(report.sourceIdentity?.[field] ?? "")) failures.push(`${field} is missing or invalid`);
  }
  const measuredIterations = report.executionPolicy?.measuredIterations ?? 3;
  if (!report.results?.every((result) =>
    (result.iterationPassCount ?? 0) + (result.iterationFailureCount ?? 0) >= measuredIterations
    && (result.runTimingsMs?.length ?? 0) >= measuredIterations
    && (!result.pass || ((result.iterationPassCount ?? 0) >= measuredIterations && result.iterationFailureCount === 0))
    && result.unstablePayload === false
    && result.finalControlledMemoryBytes === 0
  )) failures.push("per-fixture iteration, payload stability, or final-memory evidence is incomplete");
  if (profile === "robust" && !report.results?.find((result) => result.id === "66-multiple-twelve")?.pass) failures.push("Robust 12-code completeness failed");
  return failures;
}

export function validateComparisonReport(report: Partial<ComparisonReport>): string[] {
  const failures: string[] = [];
  const runtime = (report as Partial<ComparisonReport> & { runtime?: { kind?: string; nodeVersion?: string; platform?: string; arch?: string } }).runtime;
  if (report.schemaVersion !== "2.0") failures.push("schema version is not 2.0");
  if (!report.sourceIdentity || report.sourceIdentity.repositoryDirty !== false) failures.push("source repository is dirty or provenance is missing");
  if (!report.executionPolicy?.canonical) failures.push("execution policy is not canonical-compatible");
  if ((report.executionPolicy?.warmupIterations ?? 0) < 1) failures.push("warmup is below one iteration");
  if ((report.executionPolicy?.measuredIterations ?? 0) < 3) failures.push("measured iterations are below three");
  if (report.sdkVersion !== "2.0.0-alpha.5") failures.push("SDK version is not 2.0.0-alpha.5");
  if (runtime?.kind !== "node" || !/^v?24\./.test(runtime?.nodeVersion ?? "") || runtime?.platform !== "win32" || runtime?.arch !== "x64") failures.push("runtime is not Node 24 Windows x64");
  if (report.fixtureCount !== 74 || report.positiveCases !== 63 || report.negativeCases !== 11) failures.push("fixture contract is incompatible");
  if (report.finalControlledMemoryBytes !== 0) failures.push("final controlled memory is nonzero");
  for (const id of STRATEGIES) {
    const strategy = report.strategies?.find((entry) => entry.strategyId === id);
    if (!strategy || strategy.fixtureCount !== 74) failures.push(`strategy '${id}' is missing or incomplete`);
  }
  const wasm = report.strategies?.find((entry) => entry.strategyId === "raw-zxing-cpp-wasm");
  if (!wasm || wasm.initializationFailures !== 0 || wasm.executionFailures !== 0 || !wasm.wasmVariant || (wasm.wasmLinearMemoryPeakBytes ?? 0) <= 0 || wasm.uniqueWins.length < 1) {
    failures.push("raw ZXing-C++ WASM lifecycle evidence is incomplete");
  }
  const sequential = report.strategies?.find((entry) => entry.strategyId === "scanly-js-wasm-sequential");
  const parallel = report.strategies?.find((entry) => entry.strategyId === "scanly-js-wasm-parallel-experimental");
  if (sequential && parallel) {
    const parity = parallel.positiveRecall >= sequential.positiveRecall - 0.01
      && parallel.exactPayloadAccuracy >= sequential.exactPayloadAccuracy - 0.01
      && parallel.falsePositiveCount <= sequential.falsePositiveCount
      && parallel.timeoutCount === 0
      && parallel.initializationFailures === 0
      && parallel.executionFailures === 0
      && parallel.multiCodeCompleteness.complete >= sequential.multiCodeCompleteness.complete;
    if (!parity && (report.parallelExecution?.status !== "experimental" || report.parallelExecution?.builtInScenarioUsage)) failures.push("parallel correctness parity failed without experimental isolation");
  } else failures.push("sequential/parallel strategies are missing");
  const measuredIterations = report.executionPolicy?.measuredIterations ?? 3;
  if (!report.perFixture?.every((result) =>
    (result.iterationPassCount ?? 0) + (result.iterationFailureCount ?? 0) >= measuredIterations
    && (result.runTimingsMs?.length ?? 0) >= measuredIterations
    && (!result.pass || ((result.iterationPassCount ?? 0) >= measuredIterations && result.iterationFailureCount === 0))
    && result.unstablePayload === false
    && result.finalControlledMemoryBytes === 0
  )) failures.push("comparison iteration, payload stability, or memory evidence is incomplete");
  return failures;
}

export function validateCompatibleSources(reports: Array<BenchmarkRunSummary | ComparisonReport>): string[] {
  const failures: string[] = [];
  const identities = reports.map(sourceFields);
  for (const key of ["sourceCommitSha", "sourceTreeSha", "packageLockHash", "datasetHash", "engineCompositionHash", "wasmBuildHash", "nativeAdapterHash", "loaderHash"] as const) {
    if (new Set(identities.map((identity) => identity[key])).size !== 1 || !identities[0][key]) failures.push(`source identity mismatch: ${key}`);
  }
  if (identities.some((identity) => identity.repositoryDirty !== false)) failures.push("one or more reports have dirty source identity");
  return failures;
}

export function validateSymbologyReport(report: Partial<SymbologyEvidenceReport>): string[] {
  const failures: string[] = [];
  if (!report || typeof report !== "object") return ["symbology report is missing"];
  if (report.schemaVersion !== "alpha5-symbology-evidence-1") failures.push("symbology schema version is incompatible");
  if (report.sdkVersion !== "2.0.0-alpha.5") failures.push("symbology SDK version is not 2.0.0-alpha.5");
  if (!report.sourceIdentity || report.sourceIdentity.repositoryDirty !== false) failures.push("symbology source repository is dirty or provenance is missing");
  if (!report.sourceIdentity?.commitSha || !report.sourceIdentity?.treeSha) failures.push("symbology source commit/tree is missing");
  if (!/^[a-f0-9]{64}$/.test(report.sourceIdentity?.symbologyManifestHash ?? "")) failures.push("symbology manifest hash is missing or invalid");
  if (!/^[a-f0-9]{64}$/.test(report.sourceIdentity?.datasetHash ?? "")) failures.push("symbology dataset hash is missing or invalid");
  if ((report.corpus?.projectOwnedRealPhotos ?? 0) < 12) failures.push("symbology project-photo corpus is incomplete");
  if (report.corpus?.realPhotoGateComplete !== true) failures.push("symbology real-photo gate is incomplete");
  if ((report.falsePositiveCount ?? -1) !== 0) failures.push("symbology report contains false positives");
  if ((report.acceptedFormatMisclassificationCount ?? -1) !== 0) failures.push("symbology report contains format misclassifications");
  const gateResults = report.gateResults ?? evaluateSymbologyGates(report as SymbologyGateReport, { canonicalCandidate: true });
  if (!allSymbologyGatesPassed(gateResults)) {
    const failed = gateResults.filter((gate) => !gate.passed).map((gate) => gate.id);
    failures.push(`symbology release gates failed: ${failed.join(", ")}`);
  }
  return failures;
}

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

export function assembleCanonicalEvidence(inputs: Record<EvidenceReportKey, string>, outputDirectory: string): CanonicalEvidenceBundle {
  if (!inputs.symbologiesJson) throw new Error("Canonical evidence assembly requires --symbologies=<path>; the symbology report is mandatory for schema 2.1.");
  const reports = {
    fast: readJson<BenchmarkRunSummary>(inputs.fastJson),
    balanced: readJson<BenchmarkRunSummary>(inputs.balancedJson),
    robust: readJson<BenchmarkRunSummary>(inputs.robustJson),
    comparison: readJson<ComparisonReport>(inputs.comparisonJson),
    symbologies: readJson<SymbologyEvidenceReport>(inputs.symbologiesJson),
  };
  const failures = PROFILE_KEYS.flatMap((profile) => validateProfileReport(reports[profile], profile).map((failure) => `${profile}: ${failure}`));
  for (const profile of PROFILE_KEYS) {
    const csv = fs.readFileSync(inputs[PROFILE_REPORT_KEYS[profile].csv], "utf8");
    failures.push(...validateBenchmarkCsv(csv, reports[profile]).map((failure) => `${profile} CSV: ${failure}`));
  }
  failures.push(...validateComparisonReport(reports.comparison).map((failure) => `comparison: ${failure}`));
  failures.push(...validateCompatibleSources([reports.fast, reports.balanced, reports.robust, reports.comparison]));
  failures.push(...validateSymbologyReport(reports.symbologies).map((failure) => `symbologies: ${failure}`));
  if (reports.symbologies.sourceIdentity?.commitSha !== reports.fast.sourceIdentity?.commitSha
    || reports.symbologies.sourceIdentity?.treeSha !== reports.fast.sourceIdentity?.treeSha) {
    failures.push("symbologies: source identity does not match profile reports");
  }
  if (failures.length) throw new Error(`Canonical evidence assembly failed:\n- ${failures.join("\n- ")}`);

  const reportHashes = Object.fromEntries(Object.entries(inputs).map(([key, file]) => [key, sha256Text(fs.readFileSync(file))])) as Record<EvidenceReportKey, string>;
  const identity = sourceFields(reports.fast);
  const evidenceId = `alpha5-${sha256(stableJson({ reportHashes, identity })).slice(0, 16)}`;
  const reportNames: Record<EvidenceReportKey, string> = {
    fastJson: "latest-fast.json",
    fastCsv: "latest-fast.csv",
    balancedJson: "latest.json",
    balancedCsv: "latest.csv",
    robustJson: "latest-robust.json",
    robustCsv: "latest-robust.csv",
    comparisonJson: "comparison.json",
    symbologiesJson: "symbologies.json",
  };
  fs.mkdirSync(outputDirectory, { recursive: true });
  for (const key of Object.keys(reportNames) as EvidenceReportKey[]) fs.copyFileSync(inputs[key], path.join(outputDirectory, reportNames[key]));
  const withoutHash: Omit<CanonicalEvidenceManifestV21, "manifestHash"> = {
    schemaVersion: "2.1",
    evidenceId,
    sdkVersion: reports.fast.environment.sdkVersion,
    sourceIdentity: {
      sourceCommitSha: identity.sourceCommitSha!, sourceTreeSha: identity.sourceTreeSha!, repositoryDirty: false,
      packageLockHash: identity.packageLockHash!, datasetHash: identity.datasetHash!, engineCompositionHash: identity.engineCompositionHash!,
      wasmBuildHash: identity.wasmBuildHash!, nativeAdapterHash: identity.nativeAdapterHash!, loaderHash: identity.loaderHash!,
      symbologyManifestHash: reports.symbologies.sourceIdentity.symbologyManifestHash!,
      symbologyDatasetHash: reports.symbologies.sourceIdentity.datasetHash!,
    },
    fixtureCount: reports.fast.total,
    fixtureCounts: {
      legacyQr: reports.fast.total,
      symbologyTotal: reports.symbologies.corpus.total ?? 0,
      symbologyPositive: reports.symbologies.corpus.positive ?? 0,
      symbologyNegative: reports.symbologies.corpus.negative ?? 0,
      symbologyGenerated: reports.symbologies.corpus.generated ?? 0,
      symbologyProjectPhotos: reports.symbologies.corpus.projectOwnedRealPhotos,
    },
    reports: reportNames,
    reportHashes,
    generatedAt: [reports.fast.generatedAt, reports.balanced.generatedAt, reports.robust.generatedAt, reports.comparison.generatedAt, (reports.symbologies as { generatedAt?: string }).generatedAt ?? ""].filter(Boolean).sort().at(-1)!,
  };
  const manifest: CanonicalEvidenceManifestV21 = { ...withoutHash, manifestHash: computeCanonicalManifestHash(withoutHash) };
  const manifestPath = path.join(outputDirectory, "canonical-evidence-manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" });
  return readCanonicalEvidence(manifestPath);
}

export function readCanonicalEvidence(manifestPath: string): CanonicalEvidenceBundle {
  const resolvedManifest = path.resolve(manifestPath);
  const manifest = readJson<CanonicalEvidenceManifest>(resolvedManifest);
  if (!(["2.0", "2.1"] as const).includes(manifest.schemaVersion as "2.0") || computeCanonicalManifestHash(manifest) !== manifest.manifestHash) {
    throw new Error("Canonical evidence manifest hash or schema is invalid.");
  }
  const expectedKeys = manifest.schemaVersion === "2.1" ? EVIDENCE_REPORT_KEYS : LEGACY_EVIDENCE_REPORT_KEYS;
  if (JSON.stringify(Object.keys(manifest.reports).sort()) !== JSON.stringify([...expectedKeys].sort())
    || JSON.stringify(Object.keys(manifest.reportHashes).sort()) !== JSON.stringify([...expectedKeys].sort())) {
    throw new Error("Canonical evidence manifest report set is incomplete or contains unexpected entries.");
  }
  if (manifest.schemaVersion === "2.1") {
    if (!manifest.fixtureCounts || manifest.fixtureCounts.legacyQr !== manifest.fixtureCount) {
      throw new Error("Canonical evidence fixtureCounts.legacyQr must equal fixtureCount.");
    }
    if (!manifest.sourceIdentity.symbologyManifestHash || !manifest.sourceIdentity.symbologyDatasetHash) {
      throw new Error("Canonical evidence schema 2.1 requires symbology identity hashes.");
    }
  }
  const base = path.dirname(resolvedManifest);
  const reportPaths = Object.fromEntries(Object.entries(manifest.reports).map(([key, file]) => [key, path.resolve(base, file)])) as CanonicalEvidenceBundle["reportPaths"];
  for (const key of Object.keys(reportPaths) as EvidenceReportKey[]) {
    const file = reportPaths[key];
    if (!file || !fs.existsSync(file)) throw new Error(`Canonical evidence report '${key}' is missing.`);
    if (sha256Text(fs.readFileSync(file)) !== manifest.reportHashes[key as keyof typeof manifest.reportHashes]) throw new Error(`Canonical evidence report hash mismatch: ${key}.`);
  }
  const bundle: CanonicalEvidenceBundle = {
    manifestPath: resolvedManifest,
    manifest,
    reportPaths,
    reports: {
      fast: readJson(reportPaths.fastJson),
      balanced: readJson(reportPaths.balancedJson),
      robust: readJson(reportPaths.robustJson),
      comparison: readJson(reportPaths.comparisonJson),
    },
  };
  if (manifest.schemaVersion === "2.1" && reportPaths.symbologiesJson) {
    bundle.reports.symbologies = readJson(reportPaths.symbologiesJson);
  }
  return bundle;
}
