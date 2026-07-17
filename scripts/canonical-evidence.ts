import fs from "node:fs";
import path from "node:path";
import type { BenchmarkRunSummary, ComparisonReport } from "@scanly/benchmark";
import { sha256, sha256Text, stableJson } from "./benchmark-provenance.js";
import { validateBenchmarkCsv } from "./benchmark-csv.js";

export const PROFILE_KEYS = ["fast", "balanced", "robust"] as const;
export type ProfileKey = typeof PROFILE_KEYS[number];
export type EvidenceReportKey =
  | "fastJson"
  | "fastCsv"
  | "balancedJson"
  | "balancedCsv"
  | "robustJson"
  | "robustCsv"
  | "comparisonJson";
export const EVIDENCE_REPORT_KEYS: readonly EvidenceReportKey[] = [
  "fastJson", "fastCsv", "balancedJson", "balancedCsv", "robustJson", "robustCsv", "comparisonJson",
];

export const PROFILE_REPORT_KEYS: Record<ProfileKey, { json: EvidenceReportKey; csv: EvidenceReportKey }> = {
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
  "67-multiple-same-two": { category: "multiple", reasons: ["no_symbol_found"] },
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

export interface CanonicalEvidenceManifest {
  schemaVersion: "2.0";
  evidenceId: string;
  sdkVersion: string;
  sourceIdentity: EvidenceCommitIdentity & {
    repositoryDirty: false;
    packageLockHash: string;
    datasetHash: string;
    engineCompositionHash: string;
  };
  fixtureCount: number;
  reports: Record<EvidenceReportKey, string>;
  reportHashes: Record<EvidenceReportKey, string>;
  generatedAt: string;
  manifestHash: string;
}

export interface CanonicalEvidenceBundle {
  manifestPath: string;
  manifest: CanonicalEvidenceManifest;
  reports: Record<ProfileKey, BenchmarkRunSummary> & { comparison: ComparisonReport };
  reportPaths: Record<EvidenceReportKey, string>;
}

const STRATEGIES = [
  "raw-jsqr", "raw-zxing-js", "scanly-fast", "scanly-balanced", "scanly-robust",
  "scanly-jsqr-only", "scanly-zxing-only", "scanly-multi-sequential", "scanly-multi-parallel",
] as const;

function manifestPayload(manifest: Omit<CanonicalEvidenceManifest, "manifestHash"> | CanonicalEvidenceManifest): string {
  const { manifestHash: _ignored, ...payload } = manifest as CanonicalEvidenceManifest;
  return stableJson(payload);
}

export function computeCanonicalManifestHash(manifest: Omit<CanonicalEvidenceManifest, "manifestHash"> | CanonicalEvidenceManifest): string {
  return sha256(manifestPayload(manifest));
}

function sourceFields(report: BenchmarkRunSummary | ComparisonReport) {
  return {
    sourceCommitSha: report.sourceIdentity?.commitSha,
    sourceTreeSha: report.sourceIdentity?.treeSha,
    repositoryDirty: report.sourceIdentity?.repositoryDirty,
    packageLockHash: report.sourceIdentity?.packageLockHash,
    datasetHash: report.sourceIdentity?.datasetHash,
    engineCompositionHash: report.sourceIdentity?.engineCompositionHash,
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
  if (report.environment?.sdkVersion !== "2.0.0-alpha.3") failures.push("SDK version is not 2.0.0-alpha.3");
  if (report.runtime?.kind !== "node" || !/^v?24\./.test(report.runtime?.nodeVersion ?? "") || report.runtime?.platform !== "win32" || report.runtime?.arch !== "x64") failures.push("runtime is not Node 24 Windows x64");
  if (report.environment?.fixtureCount !== 74 || report.total !== 74) failures.push("fixture count is not 74");
  failures.push(...validateProfileCorrectness(report, profile));
  if ((report.engineInitializationFailures ?? -1) !== 0 || (report.engineExecutionFailures ?? -1) !== 0) failures.push("report contains engine failures");
  if (report.cancellationCorrectness?.passed !== report.cancellationCorrectness?.total) failures.push("cancellation correctness failed");
  if (report.phaseTimingAvailability?.passed !== report.phaseTimingAvailability?.total) failures.push("phase timing is incomplete");
  if (profile !== "fast" && report.multipleCompleteness?.complete !== report.multipleCompleteness?.total) failures.push("multi-code completeness failed");
  if (report.finalControlledMemoryBytes !== 0) failures.push("final controlled memory is nonzero");
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
  if (report.sdkVersion !== "2.0.0-alpha.3") failures.push("SDK version is not 2.0.0-alpha.3");
  if (runtime?.kind !== "node" || !/^v?24\./.test(runtime?.nodeVersion ?? "") || runtime?.platform !== "win32" || runtime?.arch !== "x64") failures.push("runtime is not Node 24 Windows x64");
  if (report.fixtureCount !== 74 || report.positiveCases !== 63 || report.negativeCases !== 11) failures.push("fixture contract is incompatible");
  if (report.finalControlledMemoryBytes !== 0) failures.push("final controlled memory is nonzero");
  for (const id of STRATEGIES) {
    const strategy = report.strategies?.find((entry) => entry.strategyId === id);
    if (!strategy || strategy.fixtureCount !== 74) failures.push(`strategy '${id}' is missing or incomplete`);
  }
  const sequential = report.strategies?.find((entry) => entry.strategyId === "scanly-multi-sequential");
  const parallel = report.strategies?.find((entry) => entry.strategyId === "scanly-multi-parallel");
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
  for (const key of ["sourceCommitSha", "sourceTreeSha", "packageLockHash", "datasetHash", "engineCompositionHash"] as const) {
    if (new Set(identities.map((identity) => identity[key])).size !== 1 || !identities[0][key]) failures.push(`source identity mismatch: ${key}`);
  }
  if (identities.some((identity) => identity.repositoryDirty !== false)) failures.push("one or more reports have dirty source identity");
  return failures;
}

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

export function assembleCanonicalEvidence(inputs: Record<EvidenceReportKey, string>, outputDirectory: string): CanonicalEvidenceBundle {
  const reports = {
    fast: readJson<BenchmarkRunSummary>(inputs.fastJson),
    balanced: readJson<BenchmarkRunSummary>(inputs.balancedJson),
    robust: readJson<BenchmarkRunSummary>(inputs.robustJson),
    comparison: readJson<ComparisonReport>(inputs.comparisonJson),
  };
  const failures = PROFILE_KEYS.flatMap((profile) => validateProfileReport(reports[profile], profile).map((failure) => `${profile}: ${failure}`));
  for (const profile of PROFILE_KEYS) {
    const csv = fs.readFileSync(inputs[PROFILE_REPORT_KEYS[profile].csv], "utf8");
    failures.push(...validateBenchmarkCsv(csv, reports[profile]).map((failure) => `${profile} CSV: ${failure}`));
  }
  failures.push(...validateComparisonReport(reports.comparison).map((failure) => `comparison: ${failure}`));
  failures.push(...validateCompatibleSources([reports.fast, reports.balanced, reports.robust, reports.comparison]));
  if (failures.length) throw new Error(`Canonical evidence assembly failed:\n- ${failures.join("\n- ")}`);

  const reportHashes = Object.fromEntries(Object.entries(inputs).map(([key, file]) => [key, sha256Text(fs.readFileSync(file))])) as Record<EvidenceReportKey, string>;
  const identity = sourceFields(reports.fast);
  const evidenceId = `alpha3-${sha256(stableJson({ reportHashes, identity })).slice(0, 16)}`;
  const reportNames: Record<EvidenceReportKey, string> = {
    fastJson: "latest-fast.json",
    fastCsv: "latest-fast.csv",
    balancedJson: "latest.json",
    balancedCsv: "latest.csv",
    robustJson: "latest-robust.json",
    robustCsv: "latest-robust.csv",
    comparisonJson: "comparison.json",
  };
  fs.mkdirSync(outputDirectory, { recursive: true });
  for (const key of Object.keys(reportNames) as EvidenceReportKey[]) fs.copyFileSync(inputs[key], path.join(outputDirectory, reportNames[key]));
  const withoutHash: Omit<CanonicalEvidenceManifest, "manifestHash"> = {
    schemaVersion: "2.0",
    evidenceId,
    sdkVersion: reports.fast.environment.sdkVersion,
    sourceIdentity: {
      sourceCommitSha: identity.sourceCommitSha!, sourceTreeSha: identity.sourceTreeSha!, repositoryDirty: false,
      packageLockHash: identity.packageLockHash!, datasetHash: identity.datasetHash!, engineCompositionHash: identity.engineCompositionHash!,
    },
    fixtureCount: reports.fast.total,
    reports: reportNames,
    reportHashes,
    generatedAt: [reports.fast.generatedAt, reports.balanced.generatedAt, reports.robust.generatedAt, reports.comparison.generatedAt].sort().at(-1)!,
  };
  const manifest: CanonicalEvidenceManifest = { ...withoutHash, manifestHash: computeCanonicalManifestHash(withoutHash) };
  const manifestPath = path.join(outputDirectory, "canonical-evidence-manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" });
  return readCanonicalEvidence(manifestPath);
}

export function readCanonicalEvidence(manifestPath: string): CanonicalEvidenceBundle {
  const resolvedManifest = path.resolve(manifestPath);
  const manifest = readJson<CanonicalEvidenceManifest>(resolvedManifest);
  if (manifest.schemaVersion !== "2.0" || computeCanonicalManifestHash(manifest) !== manifest.manifestHash) throw new Error("Canonical evidence manifest hash or schema is invalid.");
  if (JSON.stringify(Object.keys(manifest.reports).sort()) !== JSON.stringify([...EVIDENCE_REPORT_KEYS].sort())
    || JSON.stringify(Object.keys(manifest.reportHashes).sort()) !== JSON.stringify([...EVIDENCE_REPORT_KEYS].sort())) {
    throw new Error("Canonical evidence manifest report set is incomplete or contains unexpected entries.");
  }
  const base = path.dirname(resolvedManifest);
  const reportPaths = Object.fromEntries(Object.entries(manifest.reports).map(([key, file]) => [key, path.resolve(base, file)])) as Record<EvidenceReportKey, string>;
  for (const key of Object.keys(reportPaths) as EvidenceReportKey[]) {
    if (!fs.existsSync(reportPaths[key])) throw new Error(`Canonical evidence report '${key}' is missing.`);
    if (sha256Text(fs.readFileSync(reportPaths[key])) !== manifest.reportHashes[key]) throw new Error(`Canonical evidence report hash mismatch: ${key}.`);
  }
  return {
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
}
