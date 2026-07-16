import fs from "node:fs";
import path from "node:path";
import type { BenchmarkFixture, BenchmarkRunSummary } from "@scanly/benchmark";
import { computeDatasetHash, sha256, verifyEvidenceCommitPolicy } from "./benchmark-provenance.js";
import { loadBaselineRegistry, validateBaselineForActivation } from "./baseline-registry.js";
import { PROFILE_KEYS, readCanonicalEvidence, validateComparisonReport, validateProfileReport } from "./canonical-evidence.js";

const ROOT = path.resolve(__dirname, "..");
const value = (name: string) => process.argv.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3);
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
const lockHash = sha256(fs.readFileSync(path.join(ROOT, "package-lock.json")));
if (pkg.version !== bundle.manifest.sdkVersion) failures.push("SDK version does not match canonical manifest");
if (fixtureManifest.fixtures.length !== bundle.manifest.fixtureCount) failures.push("fixture count does not match canonical manifest");
if (datasetHash !== bundle.manifest.sourceIdentity.datasetHash) failures.push("dataset hash does not match canonical manifest");
if (lockHash !== bundle.manifest.sourceIdentity.packageLockHash) failures.push("package-lock hash does not match canonical manifest");

if (mode === "release") {
  for (const [profile, alias] of [["fast", "latest-fast.json"], ["balanced", "latest.json"], ["robust", "latest-robust.json"]] as const) {
    const aliasPath = path.join(ROOT, "benchmark-results", alias);
    if (!fs.existsSync(aliasPath) || sha256(fs.readFileSync(aliasPath)) !== bundle.manifest.reportHashes[profile]) failures.push(`canonical ${profile} alias hash is stale`);
  }
  const comparisonAlias = path.join(ROOT, "benchmark-results", "comparison.json");
  if (!fs.existsSync(comparisonAlias) || sha256(fs.readFileSync(comparisonAlias)) !== bundle.manifest.reportHashes.comparison) failures.push("canonical comparison alias hash is stale");
  failures.push(...verifyEvidenceCommitPolicy(ROOT, bundle.manifest.sourceIdentity.sourceCommitSha, bundle.manifest.sourceIdentity.sourceTreeSha, bundle.manifest.sourceIdentity.evidenceCommitSha ?? "HEAD"));

  const registryPath = path.join(ROOT, "benchmark-results", "baselines", "registry.json");
  const registry = await loadBaselineRegistry(registryPath);
  const family = "node24-win32-x64";
  const evidence = registry.activeEvidence?.[family];
  if (registry.schemaVersion !== "2.0" || !evidence || evidence.evidenceId !== bundle.manifest.evidenceId || evidence.canonicalManifestHash !== bundle.manifest.manifestHash) failures.push("active baseline evidence registry is stale");
  for (const profile of PROFILE_KEYS) {
    const file = registry.activeBaselines[family]?.[profile];
    if (!file?.startsWith("v2-alpha3-r")) { failures.push(`active ${profile} baseline is not Alpha.3`); continue; }
    const baselinePath = path.join(path.dirname(registryPath), file);
    if (!fs.existsSync(baselinePath)) { failures.push(`active ${profile} baseline is missing`); continue; }
    const raw = fs.readFileSync(baselinePath);
    if (evidence?.baselineHashes[profile] !== sha256(raw)) failures.push(`active ${profile} baseline hash mismatch`);
    const baseline = JSON.parse(raw.toString("utf8")) as Partial<BenchmarkRunSummary> & { evidenceId?: string; canonicalManifestHash?: string; reportHash?: string };
    failures.push(...validateBaselineForActivation(baseline, { sdkVersion: pkg.version, fixtureCount: 74, datasetHash, profile, runtimeFamily: family }).map((failure) => `${profile} baseline: ${failure}`));
    if (baseline.evidenceId !== bundle.manifest.evidenceId || baseline.canonicalManifestHash !== bundle.manifest.manifestHash || baseline.reportHash !== bundle.manifest.reportHashes[profile]) failures.push(`${profile} baseline belongs to a different evidence set`);
  }
  const readme = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");
  const balanced = bundle.reports.balanced;
  const remainingFailures = balanced.remainingFailures.length ? balanced.remainingFailures.map((id) => `\`${id}\``).join(", ") : "None";
  const parallelStatus = bundle.reports.comparison.parallelExecution.status;
  for (const expected of [`${balanced.passed}/${balanced.total} (${(balanced.successRate * 100).toFixed(1)}%)`, `${balanced.results.filter((result) => result.expectedOutcome === "decode" && result.pass).length}/${balanced.positiveCases}`, `${balanced.falsePositiveCount}/${balanced.negativeCases}`, remainingFailures, `Parallel execution | **${parallelStatus}**`]) if (!readme.includes(expected)) failures.push(`README benchmark summary is stale: ${expected}`);
  const docs = fs.readFileSync(path.join(ROOT, "docs", "benchmark.md"), "utf8");
  if (!docs.includes(bundle.manifest.evidenceId) || !docs.includes(bundle.manifest.sourceIdentity.sourceCommitSha)) failures.push("benchmark documentation is not synchronized to canonical evidence");
}
if (failures.length) throw new Error(`Benchmark evidence verification failed (${mode}):\n- ${failures.join("\n- ")}`);
console.log(`Benchmark evidence verified (${mode}): ${bundle.manifest.evidenceId}.`);
}

main().catch((error) => { console.error(error); process.exit(1); });
