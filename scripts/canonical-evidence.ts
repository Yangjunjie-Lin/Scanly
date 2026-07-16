import fs from "node:fs";
import path from "node:path";
import type { BenchmarkRunSummary, ComparisonReport } from "@scanly/benchmark";
import { sha256, stableJson } from "./benchmark-provenance.js";

export const PROFILE_KEYS = ["fast", "balanced", "robust"] as const;
export type ProfileKey = typeof PROFILE_KEYS[number];
export type EvidenceReportKey = ProfileKey | "comparison";

export const EXPECTED_REMAINING_FAILURES: Record<ProfileKey, string[]> = {
  fast: ["14-damaged", "16-multiple-codes", "36-multiple-gen", "39-high-res", "40-moire", "50-multiple-three", "64-multiple-five", "65-multiple-eight", "66-multiple-twelve", "67-multiple-same-two", "68-multiple-same-three", "69-multiple-mixed-size"],
  balanced: ["14-damaged"],
  robust: ["14-damaged"],
};

export interface EvidenceCommitIdentity {
  sourceCommitSha: string;
  sourceTreeSha: string;
  evidenceCommitSha?: string;
}

export interface CanonicalEvidenceManifest {
  schemaVersion: "1.0";
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
  if (report.environment?.fixtureCount !== 74 || report.total !== 74) failures.push("fixture count is not 74");
  const expectedPassed = profile === "fast" ? 62 : 73;
  const expectedPositivePasses = profile === "fast" ? 51 : 62;
  if (report.passed !== expectedPassed || report.failed !== 74 - expectedPassed) failures.push(`expected correctness result is not ${expectedPassed}/74`);
  if (report.positiveCases !== 63 || report.decodeRecall !== expectedPositivePasses / 63 || report.exactPayloadAccuracy !== expectedPositivePasses / 63) failures.push(`positive recall/exact accuracy is not ${expectedPositivePasses}/63`);
  if (report.negativeCases !== 11 || report.falsePositiveCount !== 0) failures.push("negative/false-positive contract failed");
  if (report.timeoutCount !== 0) failures.push("report contains timeouts");
  if ((report.engineInitializationFailures ?? -1) !== 0 || (report.engineExecutionFailures ?? -1) !== 0) failures.push("report contains engine failures");
  if (report.cancellationCorrectness?.passed !== report.cancellationCorrectness?.total) failures.push("cancellation correctness failed");
  if (report.phaseTimingAvailability?.passed !== report.phaseTimingAvailability?.total) failures.push("phase timing is incomplete");
  if (profile !== "fast" && report.multipleCompleteness?.complete !== report.multipleCompleteness?.total) failures.push("multi-code completeness failed");
  if (report.finalControlledMemoryBytes !== 0) failures.push("final controlled memory is nonzero");
  if (JSON.stringify(report.remainingFailures) !== JSON.stringify(EXPECTED_REMAINING_FAILURES[profile])) failures.push("remaining failures do not match the profile policy");
  if (!report.results?.every((result) => (result.iterationPassCount ?? 0) + (result.iterationFailureCount ?? 0) >= 3 && (result.runTimingsMs?.length ?? 0) >= 3)) failures.push("per-fixture iteration evidence is incomplete");
  return failures;
}

export function validateComparisonReport(report: Partial<ComparisonReport>): string[] {
  const failures: string[] = [];
  if (report.schemaVersion !== "2.0") failures.push("schema version is not 2.0");
  if (!report.sourceIdentity || report.sourceIdentity.repositoryDirty !== false) failures.push("source repository is dirty or provenance is missing");
  if (!report.executionPolicy?.canonical) failures.push("execution policy is not canonical-compatible");
  if ((report.executionPolicy?.warmupIterations ?? 0) < 1) failures.push("warmup is below one iteration");
  if ((report.executionPolicy?.measuredIterations ?? 0) < 3) failures.push("measured iterations are below three");
  if (report.sdkVersion !== "2.0.0-alpha.3") failures.push("SDK version is not 2.0.0-alpha.3");
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
  if (!report.perFixture?.every((result) => (result.iterationPassCount ?? 0) + (result.iterationFailureCount ?? 0) >= 3 && (result.runTimingsMs?.length ?? 0) >= 3 && result.finalControlledMemoryBytes === 0)) failures.push("comparison iteration or memory evidence is incomplete");
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
    fast: readJson<BenchmarkRunSummary>(inputs.fast),
    balanced: readJson<BenchmarkRunSummary>(inputs.balanced),
    robust: readJson<BenchmarkRunSummary>(inputs.robust),
    comparison: readJson<ComparisonReport>(inputs.comparison),
  };
  const failures = PROFILE_KEYS.flatMap((profile) => validateProfileReport(reports[profile], profile).map((failure) => `${profile}: ${failure}`));
  failures.push(...validateComparisonReport(reports.comparison).map((failure) => `comparison: ${failure}`));
  failures.push(...validateCompatibleSources([reports.fast, reports.balanced, reports.robust, reports.comparison]));
  if (failures.length) throw new Error(`Canonical evidence assembly failed:\n- ${failures.join("\n- ")}`);

  const reportHashes = Object.fromEntries(Object.entries(inputs).map(([key, file]) => [key, sha256(fs.readFileSync(file))])) as Record<EvidenceReportKey, string>;
  const identity = sourceFields(reports.fast);
  const evidenceId = `alpha3-${sha256(stableJson({ reportHashes, identity })).slice(0, 16)}`;
  const reportNames: Record<EvidenceReportKey, string> = { fast: "latest-fast.json", balanced: "latest.json", robust: "latest-robust.json", comparison: "comparison.json" };
  fs.mkdirSync(outputDirectory, { recursive: true });
  for (const key of Object.keys(reportNames) as EvidenceReportKey[]) fs.copyFileSync(inputs[key], path.join(outputDirectory, reportNames[key]));
  const withoutHash: Omit<CanonicalEvidenceManifest, "manifestHash"> = {
    schemaVersion: "1.0",
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
  if (manifest.schemaVersion !== "1.0" || computeCanonicalManifestHash(manifest) !== manifest.manifestHash) throw new Error("Canonical evidence manifest hash or schema is invalid.");
  const base = path.dirname(resolvedManifest);
  const reportPaths = Object.fromEntries(Object.entries(manifest.reports).map(([key, file]) => [key, path.resolve(base, file)])) as Record<EvidenceReportKey, string>;
  for (const key of Object.keys(reportPaths) as EvidenceReportKey[]) {
    if (!fs.existsSync(reportPaths[key])) throw new Error(`Canonical evidence report '${key}' is missing.`);
    if (sha256(fs.readFileSync(reportPaths[key])) !== manifest.reportHashes[key]) throw new Error(`Canonical evidence report hash mismatch: ${key}.`);
  }
  return {
    manifestPath: resolvedManifest,
    manifest,
    reportPaths,
    reports: {
      fast: readJson(reportPaths.fast), balanced: readJson(reportPaths.balanced), robust: readJson(reportPaths.robust), comparison: readJson(reportPaths.comparison),
    },
  };
}
