import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import type { BenchmarkFixture } from "@scanly/benchmark";
import { assertCleanRepository } from "./benchmark-provenance.js";
import { PROFILE_KEYS, readCanonicalEvidence, validateComparisonReport, validateProfileReport } from "./canonical-evidence.js";

const ROOT = path.resolve(__dirname, "..");
const value = (name: string) => process.argv.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3);
const manifestPath = value("manifest");
if (!process.argv.includes("--approve-canonical-update") || !manifestPath) throw new Error("Canonical update requires --manifest=<path> and --approve-canonical-update.");
assertCleanRepository(ROOT);
const bundle = readCanonicalEvidence(manifestPath);
const git = (args: string[]) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
if (git(["rev-parse", "HEAD"]) !== bundle.manifest.sourceIdentity.sourceCommitSha || git(["rev-parse", "HEAD^{tree}"]) !== bundle.manifest.sourceIdentity.sourceTreeSha) {
  throw new Error("Canonical manifest source commit/tree does not match the checked-out clean source. Use the documented evidence-commit policy only after the canonical update is committed.");
}
for (const profile of PROFILE_KEYS) {
  const failures = validateProfileReport(bundle.reports[profile], profile);
  if (failures.length) throw new Error(`Canonical ${profile} validation failed: ${failures.join("; ")}`);
}
const comparisonFailures = validateComparisonReport(bundle.reports.comparison);
if (comparisonFailures.length) throw new Error(`Canonical comparison validation failed: ${comparisonFailures.join("; ")}`);

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "fixtures", "manifest.json"), "utf8")) as { fixtures: BenchmarkFixture[] };
const balanced = bundle.reports.balanced;
const positivePassed = balanced.results.filter((result) => result.expectedOutcome === "decode" && result.pass).length;
const remainingFailures = balanced.remainingFailures.length ? balanced.remainingFailures.map((id) => `\`${id}\``).join(", ") : "None";
const generated = manifest.fixtures.filter((fixture) => fixture.sourceType === "generated").length;
const photos = manifest.fixtures.filter((fixture) => fixture.sourceType === "project-photo").length;
const readmePath = path.join(ROOT, "README.md");
const readme = fs.readFileSync(readmePath, "utf8");
const block = [
  "<!-- BENCHMARK_SUMMARY_START -->", "| Metric | Value |", "| --- | ---: |",
  `| Internal fixtures | ${balanced.total} |`, `| Generated fixtures | ${generated} |`, `| Project-owned photos | ${photos} |`,
  `| Success on fixture suite | **${balanced.passed}/${balanced.total} (${(balanced.successRate * 100).toFixed(1)}%)** on the current ${balanced.total}-case project fixture suite |`,
  `| Positive decode recall | **${positivePassed}/${balanced.positiveCases} (${(balanced.decodeRecall * 100).toFixed(1)}%)** |`,
  `| Negative false positives | **${balanced.falsePositiveCount}/${balanced.negativeCases} (${(balanced.falsePositiveRate * 100).toFixed(1)}%)** |`,
  `| Remaining failure | ${remainingFailures} |`,
  `| Parallel execution | **${bundle.reports.comparison.parallelExecution.status}** (measured against sequential parity policy) |`,
  `| Benchmark date | ${balanced.generatedAt.slice(0, 10)} |`,
  "| Manifest | [fixtures/manifest.json](fixtures/manifest.json) |", "| Canonical JSON | [benchmark-results/latest.json](benchmark-results/latest.json) |",
  "<!-- BENCHMARK_SUMMARY_END -->",
].join("\n");
if (!readme.includes("<!-- BENCHMARK_SUMMARY_START -->") || !readme.includes("<!-- BENCHMARK_SUMMARY_END -->")) throw new Error("README benchmark summary markers are missing.");
const updatedReadme = readme.replace(/<!-- BENCHMARK_SUMMARY_START -->[\s\S]*?<!-- BENCHMARK_SUMMARY_END -->/, block);
const docs = `# Benchmark\n\nThis document is generated only by the approved canonical evidence update command. Latency is environment-specific and is not a commercial parity claim.\n\n## Canonical source\n\n| Field | Value |\n| --- | --- |\n| Evidence ID | \`${bundle.manifest.evidenceId}\` |\n| Manifest hash | \`${bundle.manifest.manifestHash}\` |\n| Source commit | \`${bundle.manifest.sourceIdentity.sourceCommitSha}\` |\n| Source tree | \`${bundle.manifest.sourceIdentity.sourceTreeSha}\` |\n| Dataset hash | \`${bundle.manifest.sourceIdentity.datasetHash}\` |\n| Package-lock hash | \`${bundle.manifest.sourceIdentity.packageLockHash}\` |\n| Engine composition hash | \`${bundle.manifest.sourceIdentity.engineCompositionHash}\` |\n| Repository dirty | false |\n| Warmup iterations | ${balanced.executionPolicy.warmupIterations} |\n| Measured iterations | ${balanced.executionPolicy.measuredIterations} |\n\n## Balanced correctness and latency\n\n| Metric | Value |\n| --- | ---: |\n| Fixtures | ${balanced.passed}/${balanced.total} |\n| Positive recall | ${positivePassed}/${balanced.positiveCases} |\n| False positives | ${balanced.falsePositiveCount}/${balanced.negativeCases} |\n| Average | ${balanced.averageMs.toFixed(2)} ms |\n| Median | ${balanced.medianMs.toFixed(2)} ms |\n| P95 | ${balanced.p95Ms.toFixed(2)} ms |\n| Peak controlled memory | ${balanced.controlledMemoryPeakBytes} bytes |\n| Final controlled memory | ${balanced.finalControlledMemoryBytes} bytes |\n| Remaining failure | ${remainingFailures} |\n| Parallel execution | ${bundle.reports.comparison.parallelExecution.status} |\n\nSee the canonical JSON aliases for per-fixture iteration timings, phase timing, variance, attempts, and profile-specific metrics.\n`;

const canonicalDir = path.join(ROOT, "benchmark-results", "canonical");
const destinations: Array<[string, Buffer | string]> = [
  [path.join(ROOT, "benchmark-results", "latest-fast.json"), fs.readFileSync(bundle.reportPaths.fast)],
  [path.join(ROOT, "benchmark-results", "latest.json"), fs.readFileSync(bundle.reportPaths.balanced)],
  [path.join(ROOT, "benchmark-results", "latest-robust.json"), fs.readFileSync(bundle.reportPaths.robust)],
  [path.join(ROOT, "benchmark-results", "comparison.json"), fs.readFileSync(bundle.reportPaths.comparison)],
  [readmePath, updatedReadme], [path.join(ROOT, "docs", "benchmark.md"), docs],
  [path.join(canonicalDir, "canonical-evidence-manifest.json"), JSON.stringify(bundle.manifest, null, 2) + "\n"],
  ...Object.entries(bundle.reportPaths).map(([key, source]) => [path.join(canonicalDir, path.basename(source)), fs.readFileSync(source)] as [string, Buffer]),
];
const staged = destinations.map(([destination, contents]) => {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, contents, { flag: "wx" });
  return { destination, temporary, backup: `${destination}.${process.pid}.bak`, existed: fs.existsSync(destination) };
});
const installed: typeof staged = [];
try {
  for (const entry of staged) {
    if (entry.existed) fs.renameSync(entry.destination, entry.backup);
    fs.renameSync(entry.temporary, entry.destination);
    installed.push(entry);
  }
  for (const entry of staged) if (entry.existed) fs.rmSync(entry.backup);
} catch (error) {
  for (const entry of installed.reverse()) {
    if (fs.existsSync(entry.destination)) fs.rmSync(entry.destination);
    if (entry.existed && fs.existsSync(entry.backup)) fs.renameSync(entry.backup, entry.destination);
  }
  for (const entry of staged) if (fs.existsSync(entry.temporary)) fs.rmSync(entry.temporary);
  throw error;
}
console.log(`Updated all canonical aliases atomically from ${bundle.manifest.evidenceId}.`);
