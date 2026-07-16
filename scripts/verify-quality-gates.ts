import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { BenchmarkRunSummary, ComparisonReport } from "@scanly/benchmark";
import { validateScenario } from "@scanly/scenario-schema";
import { validateBaselineForActivation } from "./baseline-registry.js";

const ROOT = path.resolve(__dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), "utf8");
const fail = (message: string): never => { throw new Error(message); };

const pkg = JSON.parse(read("package.json")) as {
  license?: string;
  name?: string;
  version?: string;
  engines?: { node?: string; npm?: string };
};
if (pkg.license !== "MIT") fail("package.json license must be MIT");
if (pkg.name !== "scanly" || pkg.version !== "2.0.0-alpha.3") fail("package metadata must identify the Scanly SDK v2 alpha.3 validation platform");
if (pkg.engines?.node !== ">=20 <25" || pkg.engines?.npm !== ">=10") {
  fail("package engines must pin the verified Node/npm maintenance range");
}

const license = read("LICENSE").replace(/\r\n/g, "\n");
if (!license.startsWith("MIT License\n") || !license.includes("Copyright (c) 2026 Yangjunjie Lin")) {
  fail("LICENSE is missing the canonical MIT heading or copyright line");
}
if (!license.includes("Permission is hereby granted, free of charge")) {
  fail("LICENSE does not contain the standard MIT grant");
}

const manifest = JSON.parse(read("fixtures/manifest.json")) as {
  fixtures: Array<{
    id: string;
    category: string;
    requiredPayloads?: string[];
    requiredInstances?: Array<{ payload: string; count: number }>;
    expectedResultCount?: number;
    sourceType: "generated" | "project-photo";
    file: string;
    license: string;
    generatedSeed?: number;
    transformMetadata?: string;
  }>;
};
for (const fixture of manifest.fixtures) {
  if (!fs.existsSync(path.join(ROOT, fixture.file))) fail(`Missing canonical fixture: ${fixture.file}`);
  if (fixture.sourceType === "project-photo" && fixture.license !== "project-owned") {
    fail(`${fixture.id} project photo must be marked project-owned`);
  }
  if (fixture.sourceType === "generated" && (!fixture.generatedSeed || !fixture.transformMetadata)) {
    fail(`${fixture.id} is missing generated seed/transform provenance`);
  }
}
if (!manifest.fixtures.some((fixture) => fixture.id === "14-damaged")) fail("Retained hard fixture 14-damaged is missing");
if (manifest.fixtures.filter((fixture) => fixture.category === "negative" || fixture.category === "adversarial").length < 10) fail("Negative/adversarial suite must contain at least 10 deterministic fixtures");
for (const fixture of manifest.fixtures.filter((item) => item.category === "multiple")) {
  const requiredCount = fixture.requiredInstances?.reduce((sum, entry) => sum + entry.count, 0) ?? fixture.requiredPayloads?.length ?? 0;
  if (!requiredCount) fail(`${fixture.id} has no required multi-instance contract`);
  if (fixture.expectedResultCount !== requiredCount) {
    fail(`${fixture.id} expectedResultCount must equal required instance count`);
  }
}

const canonical = JSON.parse(read("benchmark-results/latest.json")) as BenchmarkRunSummary;
const canonicalProfiles = (["fast", "balanced", "robust"] as const).map((profile) => ({
  profile,
  report: JSON.parse(read(profile === "balanced" ? "benchmark-results/latest.json" : `benchmark-results/latest-${profile}.json`)) as BenchmarkRunSummary,
}));
for (const { profile, report } of canonicalProfiles) {
  if (report.sourceIdentity?.repositoryDirty) fail(`Canonical ${profile} benchmark was generated from a dirty repository.`);
  if (!report.executionPolicy?.canonical || report.executionPolicy.mode !== "canonical") fail(`Canonical ${profile} artifact was produced from development mode.`);
  if ((report.executionPolicy?.warmupIterations ?? 0) < 1) fail(`Canonical ${profile} benchmark warmup is below one iteration.`);
  if ((report.executionPolicy?.measuredIterations ?? 0) < 3) fail(`Canonical ${profile} benchmark measured iterations are below three.`);
  if (report.environment.sdkVersion !== pkg.version) fail(`Canonical ${profile} SDK version is stale.`);
  if (report.environment.fixtureCount !== manifest.fixtures.length || report.total !== manifest.fixtures.length) fail(`Canonical ${profile} fixture count is stale.`);
  if (report.finalControlledMemoryBytes !== 0) fail(`Canonical ${profile} benchmark does not prove zero final controlled bytes.`);
}
for (const field of ["commitSha", "treeSha", "datasetHash", "packageLockHash", "engineCompositionHash"] as const) {
  if (new Set(canonicalProfiles.map(({ report }) => report.sourceIdentity[field])).size !== 1) fail(`Canonical profile source identity mismatch: ${field}.`);
}
if (canonical.environment.scenario !== "balanced" || canonical.environment.fixtureCount !== manifest.fixtures.length) fail("Canonical benchmark metadata must describe the balanced Router-path fixture run");
const readme = read("README.md");
const rate = `${(canonical.successRate * 100).toFixed(1)}%`;
const generatedCount = manifest.fixtures.filter((fixture) => fixture.sourceType === "generated").length;
const photoCount = manifest.fixtures.filter((fixture) => fixture.sourceType === "project-photo").length;
for (const expected of [
  `${canonical.passed}/${canonical.total} (${rate})`,
  `Benchmark date | ${canonical.generatedAt.slice(0, 10)}`,
  `Generated fixtures | ${generatedCount}`,
  `Project-owned photos | ${photoCount}`,
]) {
  if (!readme.includes(expected)) fail(`README benchmark summary is stale: missing '${expected}'`);
}
if (canonical.multipleCompleteness.complete !== canonical.multipleCompleteness.total) {
  fail(`Multiple completeness is ${canonical.multipleCompleteness.complete}/${canonical.multipleCompleteness.total}`);
}
if (!canonical.sourceIdentity || canonical.sourceIdentity.datasetHash !== canonical.environment.datasetManifestHash) fail("Canonical benchmark source identity is missing or inconsistent");
const comparison = JSON.parse(read("benchmark-results/comparison.json")) as ComparisonReport;
if (comparison.schemaVersion !== "2.0") fail("Comparison report schema must be 2.0");
if (comparison.sourceIdentity?.repositoryDirty) fail("Comparison report was generated from a dirty repository.");
if (!comparison.executionPolicy?.canonical || comparison.executionPolicy.mode !== "canonical") fail("Comparison report was produced from development mode.");
for (const [label, actual, expected] of [
  ["datasetHash", comparison.sourceIdentity.datasetHash, canonical.sourceIdentity.datasetHash],
  ["fixtureCount", comparison.fixtureCount, canonical.environment.fixtureCount],
  ["commitSha", comparison.sourceIdentity.commitSha, canonical.sourceIdentity.commitSha],
  ["treeSha", comparison.sourceIdentity.treeSha, canonical.sourceIdentity.treeSha],
  ["sdkVersion", comparison.sdkVersion, canonical.environment.sdkVersion],
] as const) if (actual !== expected) fail(`Comparison report is stale: ${label} does not match canonical benchmark`);
for (const strategy of ["raw-jsqr", "raw-zxing-js", "scanly-fast", "scanly-balanced", "scanly-robust", "scanly-jsqr-only", "scanly-zxing-only", "scanly-multi-sequential", "scanly-multi-parallel"]) {
  const summary = comparison.strategies.find((entry) => entry.strategyId === strategy);
  if (!summary || summary.fixtureCount !== comparison.fixtureCount) fail(`Comparison strategy '${strategy}' is missing or incomplete`);
}
for (const engineStrategy of ["raw-jsqr", "raw-zxing-js"]) {
  const contribution = comparison.strategies.find((entry) => entry.strategyId === engineStrategy)?.uniqueWins.length ?? 0;
  if (contribution < 1) fail(`Production engine strategy '${engineStrategy}' has no unique contribution fixture`);
}

const registry = JSON.parse(read("benchmark-results/baselines/registry.json")) as { activeBaselines?: Record<string, Record<string, string>> };
const activeFamily = registry.activeBaselines?.["node24-win32-x64"];
if (!activeFamily) fail("The Node 24 Windows x64 baseline registry is missing.");
for (const profile of ["fast", "balanced", "robust"] as const) {
  const baselineFile = activeFamily?.[profile];
  if (!baselineFile?.startsWith("v2-alpha3-r")) fail(`Active ${profile} baseline is not Alpha.3.`);
  const baselinePath = `benchmark-results/baselines/${baselineFile}`;
  if (!fs.existsSync(path.join(ROOT, baselinePath))) fail(`Active ${profile} baseline file is missing.`);
  const baseline = JSON.parse(read(baselinePath));
  const failures = validateBaselineForActivation(baseline, {
    sdkVersion: pkg.version ?? "",
    fixtureCount: manifest.fixtures.length,
    datasetHash: canonical.sourceIdentity.datasetHash,
    profile,
    runtimeFamily: "node24-win32-x64",
  });
  if (failures.length) fail(`Active ${profile} baseline is incompatible: ${failures.join("; ")}`);
}

if (!readme.includes("SDK-2.0.0--alpha.3")) fail("README SDK badge does not match 2.0.0-alpha.3.");
const apiSnapshot = JSON.parse(read("api-snapshots/public-api.json")) as { packages?: Array<{ packageName?: string }> };
const snapshotNames = new Set(apiSnapshot.packages?.map((entry) => entry.packageName));
for (const packageName of ["@scanly/core", "@scanly/browser", "@scanly/node", "@scanly/react", "@scanly/scenario-schema", "@scanly/parsers", "@scanly/benchmark", "@scanly/engine-jsqr", "@scanly/engine-zxing-js"]) {
  if (!snapshotNames.has(packageName)) fail(`Public API snapshot is missing publishable package ${packageName}.`);
}

for (const id of ["fast", "balanced", "robust"]) {
  const scenario = JSON.parse(read(`scenarios/generic/${id}.json`));
  const validated = validateScenario(scenario);
  if (!validated.ok) fail(`Invalid built-in scenario ${id}: ${validated.message}`);
}

const tracked = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: ROOT })
  .toString("utf8")
  .split("\0")
  .filter((file) => Boolean(file) && fs.existsSync(path.join(ROOT, file)));
const forbiddenPaths = tracked.filter((file) =>
  /(^|\/)\.vercel(\/|$)|(^|\/)\.env(\.|$)|fixtures\/(?:_tmp-|_e2e-)|benchmark-results\/smoke-[^/]+\.(?:json|csv)$/.test(file)
);
if (forbiddenPaths.length) fail(`Forbidden tracked paths: ${forbiddenPaths.join(", ")}`);

const textExtensions = new Set([".ts", ".tsx", ".js", ".json", ".md", ".yml", ".yaml", ".txt"]);
for (const file of tracked) {
  if (!textExtensions.has(path.extname(file).toLowerCase())) continue;
  const content = read(file);
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(content)) {
    fail(`Possible private key found in tracked file: ${file}`);
  }
  if (/^(?:VERCEL_TOKEN|OPENAI_API_KEY|AWS_SECRET_ACCESS_KEY|GITHUB_TOKEN)\s*=\s*\S+/m.test(content)) {
    fail(`Possible secret assignment found in tracked file: ${file}`);
  }
  if (content.includes("dangerously" + "SetInnerHTML")) {
    fail(`QR payloads must never be rendered as HTML: ${file}`);
  }
}

const coreManifest = JSON.parse(read("packages/core/package.json")) as { dependencies?: Record<string, string> };
for (const forbidden of ["jsqr", "@zxing/library", "@zxing/browser", "sharp"]) {
  if (coreManifest.dependencies?.[forbidden]) fail(`@scanly/core must not depend on concrete/runtime-specific package ${forbidden}`);
}
const coreSources = tracked.filter((file) => file.startsWith("packages/core/src/") && file.endsWith(".ts"));
for (const file of coreSources) {
  const content = read(file);
  if (/from\s+["'](?:jsqr|@zxing\/library|@zxing\/browser|sharp)["']/.test(content)) fail(`Concrete decoder/Node dependency leaked into core: ${file}`);
}
for (const file of ["packages/browser/src/browser-session.ts", "packages/browser/src/worker/decode-worker.ts"]) {
  if (read(file).includes("decodePixelBuffer")) fail(`${file} bypasses CaptureRouter through the legacy pipeline`);
}
if (!read("packages/browser/src/worker/decode-worker.ts").includes("router.scan")) fail("Browser Worker does not execute CaptureRouter");
if (read("scripts/run-benchmark.ts").includes("baseline-pre-polish.json")) fail("Canonical benchmark still references the permissive historical baseline");

for (const required of [
  "README.md",
  "LICENSE",
  "SECURITY.md",
  "CONTRIBUTING.md",
  "CHANGELOG.md",
  "docs/maintenance.md",
  ".github/dependabot.yml",
  ".github/pull_request_template.md",
  ".github/ISSUE_TEMPLATE/bug_report.yml",
  ".github/ISSUE_TEMPLATE/browser_compatibility.yml",
  ".github/ISSUE_TEMPLATE/decoding_failure.yml",
]) {
  if (!fs.existsSync(path.join(ROOT, required))) fail(`Missing repository maintenance file: ${required}`);
}

console.log("Quality gates passed: metadata, license, fixtures, benchmark sync, repository files, payload safety, tracked files, secret scan.");
