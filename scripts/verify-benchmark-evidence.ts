import fs from "node:fs";
import path from "node:path";
import type { BenchmarkFixture, BenchmarkRunSummary } from "@scanly/benchmark";
import { computeDatasetHash, sha256Text, verifyEvidenceCommitPolicy } from "./benchmark-provenance.js";
import { loadBaselineRegistry, validateBaselineForActivation } from "./baseline-registry.js";
import {
  PROFILE_KEYS,
  PROFILE_REPORT_KEYS,
  readCanonicalEvidence,
  validateComparisonReport,
  validateProfileReport,
  validateSymbologyReport,
  legacyReportHash,
  type CanonicalEvidenceManifestV21,
} from "./canonical-evidence.js";

const ROOT = path.resolve(__dirname, "..");
const value = (name: string) => process.argv.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3);

function baselineIdFromActiveFile(file: string, profile: string): string | undefined {
  const suffix = `-${profile}-node24-windows-x64.json`;
  if (!file.endsWith(suffix)) return undefined;
  return file.slice(0, -suffix.length) || undefined;
}

async function main(): Promise<void> {
  const mode = value("mode") ?? "release";
  if (!(["release", "baseline-bootstrap"] as const).includes(mode as "release")) throw new Error("Evidence verification mode must be release or baseline-bootstrap.");
  const supplied = value("canonical-manifest");
  const manifestPath = supplied ? path.resolve(supplied) : path.join(ROOT, "benchmark-results", "canonical", "canonical-evidence-manifest.json");
  if (mode === "baseline-bootstrap" && !supplied) throw new Error("Bootstrap evidence verification requires --canonical-manifest=<external path>.");
  if (!fs.existsSync(manifestPath)) throw new Error(`Canonical evidence manifest is missing: ${manifestPath}. Generate it from a clean committed source tree before running release gates.`);
  const bundle = readCanonicalEvidence(manifestPath);
  const failures: string[] = [];
  for (const profile of PROFILE_KEYS) failures.push(...validateProfileReport(bundle.reports[profile], profile).map((failure) => `${profile}: ${failure}`));
  failures.push(...validateComparisonReport(bundle.reports.comparison).map((failure) => `comparison: ${failure}`));

  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")) as { version: string };
  const fixtureManifestPath = path.join(ROOT, "fixtures", "manifest.json");
  const fixtureManifest = JSON.parse(fs.readFileSync(fixtureManifestPath, "utf8")) as { fixtures: BenchmarkFixture[] };
  const datasetHash = await computeDatasetHash(fixtureManifestPath, fixtureManifest.fixtures.map((fixture) => fixture.file), ROOT);
  const lockHash = sha256Text(fs.readFileSync(path.join(ROOT, "package-lock.json")));
  if (pkg.version !== bundle.manifest.sdkVersion) failures.push("SDK version does not match canonical manifest");
  if (fixtureManifest.fixtures.length !== bundle.manifest.fixtureCount) failures.push("legacy QR fixture count does not match canonical manifest");
  if (datasetHash !== bundle.manifest.sourceIdentity.datasetHash) failures.push("legacy QR dataset hash does not match canonical manifest");
  if (lockHash !== bundle.manifest.sourceIdentity.packageLockHash) failures.push("package-lock hash does not match canonical manifest");

  if (bundle.manifest.schemaVersion === "2.1") {
    const manifest = bundle.manifest as CanonicalEvidenceManifestV21;
    if (!bundle.reports.symbologies || !bundle.reportPaths.symbologiesJson) failures.push("Alpha.5 symbology report is missing from canonical evidence");
    else {
      failures.push(...validateSymbologyReport(bundle.reports.symbologies).map((failure) => `symbologies: ${failure}`));
      if (bundle.reports.symbologies.sourceIdentity?.symbologyManifestHash !== manifest.sourceIdentity.symbologyManifestHash) {
        failures.push("symbology manifest hash does not match canonical identity");
      }
      if (bundle.reports.symbologies.sourceIdentity?.datasetHash !== manifest.sourceIdentity.symbologyDatasetHash) {
        failures.push("symbology dataset hash does not match canonical identity");
      }
      if (sha256Text(fs.readFileSync(bundle.reportPaths.symbologiesJson)) !== manifest.reportHashes.symbologiesJson) {
        failures.push("symbology report hash does not match canonical manifest");
      }
    }
    if (manifest.fixtureCounts.legacyQr !== 74) failures.push("legacy QR fixture count must remain 74");
    if (manifest.fixtureCounts.symbologyProjectPhotos < 12) failures.push("canonical fixtureCounts require at least 12 project photos");
    if (manifest.fixtureCounts.symbologyTotal < 146) failures.push("canonical fixtureCounts require at least 146 symbology fixtures");
  }

  if (mode === "release") {
    for (const [profile, jsonAlias, csvAlias] of [
      ["fast", "latest-fast.json", "latest-fast.csv"],
      ["balanced", "latest.json", "latest.csv"],
      ["robust", "latest-robust.json", "latest-robust.csv"],
    ] as const) {
      const keys = PROFILE_REPORT_KEYS[profile];
      const jsonAliasPath = path.join(ROOT, "benchmark-results", jsonAlias);
      const csvAliasPath = path.join(ROOT, "benchmark-results", csvAlias);
      if (!fs.existsSync(jsonAliasPath) || sha256Text(fs.readFileSync(jsonAliasPath)) !== legacyReportHash(bundle.manifest, keys.json)) failures.push(`canonical ${profile} JSON alias hash is stale`);
      if (!fs.existsSync(csvAliasPath) || sha256Text(fs.readFileSync(csvAliasPath)) !== legacyReportHash(bundle.manifest, keys.csv)) failures.push(`canonical ${profile} CSV alias hash is stale`);
    }
    const comparisonAlias = path.join(ROOT, "benchmark-results", "comparison.json");
    if (!fs.existsSync(comparisonAlias) || sha256Text(fs.readFileSync(comparisonAlias)) !== legacyReportHash(bundle.manifest, "comparisonJson")) failures.push("canonical comparison alias hash is stale");
    if (bundle.manifest.schemaVersion === "2.1") {
      const symbologiesAlias = path.join(ROOT, "benchmark-results", "symbologies.json");
      const expectedHash = (bundle.manifest as CanonicalEvidenceManifestV21).reportHashes.symbologiesJson;
      if (!fs.existsSync(symbologiesAlias) || sha256Text(fs.readFileSync(symbologiesAlias)) !== expectedHash) failures.push("canonical symbologies alias hash is stale");
    }
    failures.push(...verifyEvidenceCommitPolicy(ROOT, bundle.manifest.sourceIdentity.sourceCommitSha, bundle.manifest.sourceIdentity.sourceTreeSha, bundle.manifest.sourceIdentity.evidenceCommitSha ?? "HEAD"));

    const registryPath = path.join(ROOT, "benchmark-results", "baselines", "registry.json");
    const registry = await loadBaselineRegistry(registryPath);
    const family = "node24-win32-x64";
    const evidence = registry.activeEvidence?.[family];
    const active = registry.activeBaselines[family];
    if (!active || !evidence) {
      failures.push("active baseline evidence registry is missing");
    } else {
      const derivedIds = PROFILE_KEYS.map((profile) => baselineIdFromActiveFile(active[profile], profile));
      if (derivedIds.some((id) => !id) || new Set(derivedIds).size !== 1) {
        failures.push("active baseline filenames do not derive a single baselineId");
      } else {
        const baselineId = derivedIds[0]!;
        if (evidence.baselineId !== baselineId) failures.push("active evidence baselineId does not match baseline filenames");
        if (evidence.evidenceId !== bundle.manifest.evidenceId
          || evidence.canonicalManifestHash !== bundle.manifest.manifestHash
          || evidence.sourceCommit !== bundle.manifest.sourceIdentity.sourceCommitSha
          || evidence.engineCompositionHash !== bundle.manifest.sourceIdentity.engineCompositionHash
          || evidence.wasmBuildHash !== bundle.manifest.sourceIdentity.wasmBuildHash) {
          failures.push("active baseline evidence registry is stale");
        }
        if (bundle.manifest.schemaVersion === "2.1") {
          const manifest = bundle.manifest as CanonicalEvidenceManifestV21;
          if (evidence.datasetHash !== manifest.sourceIdentity.datasetHash) failures.push("active evidence datasetHash is stale");
          if (evidence.symbologyManifestHash !== manifest.sourceIdentity.symbologyManifestHash) failures.push("active evidence symbologyManifestHash is stale");
          if (evidence.symbologyDatasetHash !== manifest.sourceIdentity.symbologyDatasetHash) failures.push("active evidence symbologyDatasetHash is stale");
          if (evidence.symbologyReportHash !== manifest.reportHashes.symbologiesJson) failures.push("active evidence symbologyReportHash is stale");
        }
        for (const profile of PROFILE_KEYS) {
          const file = active[profile];
          const baselinePath = path.join(path.dirname(registryPath), file);
          if (!fs.existsSync(baselinePath)) { failures.push(`active ${profile} baseline is missing`); continue; }
          const raw = fs.readFileSync(baselinePath);
          if (evidence.baselineHashes[profile] !== sha256Text(raw)) failures.push(`active ${profile} baseline hash mismatch`);
          const baseline = JSON.parse(raw.toString("utf8")) as Partial<BenchmarkRunSummary> & { evidenceId?: string; canonicalManifestHash?: string; reportHash?: string };
          failures.push(...validateBaselineForActivation(baseline, {
            sdkVersion: pkg.version,
            fixtureCount: bundle.manifest.fixtureCount,
            datasetHash,
            profile,
            runtimeFamily: family,
          }).map((failure) => `${profile} baseline: ${failure}`));
          if (baseline.evidenceId !== bundle.manifest.evidenceId || baseline.canonicalManifestHash !== bundle.manifest.manifestHash || baseline.reportHash !== legacyReportHash(bundle.manifest, PROFILE_REPORT_KEYS[profile].json)) {
            failures.push(`${profile} baseline belongs to a different evidence set`);
          }
        }
      }
    }
    const readme = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");
    const balanced = bundle.reports.balanced;
    const remainingFailures = balanced.remainingFailures.length ? balanced.remainingFailures.map((id) => `\`${id}\``).join(", ") : "None";
    const parallelStatus = bundle.reports.comparison.parallelExecution.status;
    for (const expected of [`${balanced.passed}/${balanced.total} (${(balanced.successRate * 100).toFixed(1)}%)`, `${balanced.results.filter((result) => result.expectedOutcome === "decode" && result.pass).length}/${balanced.positiveCases}`, `${balanced.falsePositiveCount}/${balanced.negativeCases}`, remainingFailures, `Parallel execution | **${parallelStatus}**`]) {
      if (!readme.includes(expected)) failures.push(`README benchmark summary is stale: ${expected}`);
    }
    const docs = fs.readFileSync(path.join(ROOT, "docs", "benchmark.md"), "utf8");
    if (!docs.includes(bundle.manifest.evidenceId) || !docs.includes(bundle.manifest.sourceIdentity.sourceCommitSha)) failures.push("benchmark documentation is not synchronized to canonical evidence");
  }
  if (failures.length) throw new Error(`Benchmark evidence verification failed (${mode}):\n- ${failures.join("\n- ")}`);
  console.log(`Benchmark evidence verified (${mode}): ${bundle.manifest.evidenceId}.`);
}

main().catch((error) => { console.error(error); process.exit(1); });
