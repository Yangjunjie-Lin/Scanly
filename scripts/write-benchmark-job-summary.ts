import fs from "node:fs";
import path from "node:path";
import type { BenchmarkRunSummary, ComparisonReport } from "@scanly/benchmark";
import { readCanonicalEvidence } from "./canonical-evidence.js";

const value = (name: string) => process.argv.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3);
const reportPath = value("report");
const manifestPath = value("manifest");

if (Boolean(reportPath) === Boolean(manifestPath)) throw new Error("Summary requires exactly one of --report=<path> or --manifest=<path>.");

function sourceRows(source: BenchmarkRunSummary["sourceIdentity"] | ComparisonReport["sourceIdentity"]): string[] {
  return [
    `| Commit SHA | \`${source.commitSha}\` |`,
    `| Tree SHA | \`${source.treeSha}\` |`,
    `| Repository dirty | ${source.repositoryDirty} |`,
    `| Dataset hash | \`${source.datasetHash}\` |`,
    `| Package-lock hash | \`${source.packageLockHash}\` |`,
    `| Engine composition hash | \`${source.engineCompositionHash}\` |`,
    `| WASM build hash | \`${source.wasmBuildHash}\` |`,
    `| Native adapter hash | \`${source.nativeAdapterHash}\` |`,
    `| Loader hash | \`${source.loaderHash}\` |`,
    `| Benchmark runner hash | \`${source.benchmarkRunnerHash}\` |`,
  ];
}

function profileRows(profile: string, report: BenchmarkRunSummary): string[] {
  const positivePassed = report.results.filter((result) => result.expectedOutcome === "decode" && result.pass).length;
  return [
    `| ${profile} | ${report.passed}/${report.total} | ${positivePassed}/${report.positiveCases} | ${report.falsePositiveCount}/${report.negativeCases} | ${report.remainingFailures.join(", ") || "None"} |`,
  ];
}

let lines: string[];
if (manifestPath) {
  const bundle = readCanonicalEvidence(path.resolve(manifestPath));
  lines = [
    "## Canonical evidence bundle",
    "",
    `- Evidence ID: \`${bundle.manifest.evidenceId}\``,
    `- Manifest hash: \`${bundle.manifest.manifestHash}\``,
    `- Source commit/tree: \`${bundle.manifest.sourceIdentity.sourceCommitSha}\` / \`${bundle.manifest.sourceIdentity.sourceTreeSha}\``,
    `- Parallel status: **${bundle.reports.comparison.parallelExecution.status}**`,
    "",
    "| Profile | Correctness | Positive passes | False positives | Remaining failures |",
    "| --- | ---: | ---: | ---: | --- |",
    ...(["fast", "balanced", "robust"] as const).flatMap((profile) => profileRows(profile, bundle.reports[profile])),
    "",
    "| Report | SHA-256 |",
    "| --- | --- |",
    ...Object.entries(bundle.manifest.reportHashes).map(([key, hash]) => `| ${key} | \`${hash}\` |`),
  ];
} else {
  const report = JSON.parse(fs.readFileSync(path.resolve(reportPath!), "utf8")) as BenchmarkRunSummary | ComparisonReport;
  lines = ["## Candidate source identity", "", "| Field | Value |", "| --- | --- |", ...sourceRows(report.sourceIdentity), ""];
  if ("strategies" in report) {
    lines.push(`Comparison strategies: ${report.strategies.length}; Parallel status: **${report.parallelExecution.status}**.`);
  } else {
    lines.push("| Profile | Correctness | Positive passes | False positives | Remaining failures |", "| --- | ---: | ---: | ---: | --- |", ...profileRows(report.environment.scenario, report));
  }
}

const markdown = `${lines.join("\n")}\n`;
process.stdout.write(markdown);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
