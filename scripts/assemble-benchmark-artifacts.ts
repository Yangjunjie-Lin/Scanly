import fs from "node:fs";
import path from "node:path";
import type { BenchmarkRunSummary, ComparisonReport } from "@scanly/benchmark";

const directory = path.resolve(process.argv.find((argument) => argument.startsWith("--directory="))?.split("=")[1] ?? "benchmark-results/ci");
const files = (root: string): string[] => fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? files(path.join(root, entry.name)) : entry.name.endsWith(".json") ? [path.join(root, entry.name)] : []);
const available = files(directory);
const named = (name: string) => {
  const match = available.find((file) => path.basename(file) === name);
  if (!match) throw new Error(`Missing assembled benchmark artifact '${name}'.`);
  return JSON.parse(fs.readFileSync(match, "utf8"));
};

const reports = [named("latest-fast.json"), named("latest.json"), named("latest-robust.json")] as BenchmarkRunSummary[];
const comparison = named("comparison.json") as ComparisonReport;
for (const report of reports) {
  if (report.sourceIdentity.repositoryDirty) throw new Error(`${report.environment.scenario} CI benchmark was generated from a dirty repository.`);
  if (report.executionPolicy.mode !== "ci-artifact") throw new Error(`${report.environment.scenario} report is not a CI artifact benchmark.`);
  if (report.finalControlledMemoryBytes !== 0) throw new Error(`${report.environment.scenario} retained controlled memory.`);
}
if (comparison.sourceIdentity.repositoryDirty) throw new Error("Comparison report was generated from a dirty repository.");
if (comparison.executionPolicy.mode !== "ci-artifact") throw new Error("Comparison report is not a CI artifact comparison.");

const identities = [...reports.map((report) => ({
  commitSha: report.sourceIdentity.commitSha,
  treeSha: report.sourceIdentity.treeSha,
  datasetHash: report.sourceIdentity.datasetHash,
  packageLockHash: report.sourceIdentity.packageLockHash,
  sdkVersion: report.environment.sdkVersion,
  fixtureCount: report.environment.fixtureCount,
  engineCompositionHash: report.sourceIdentity.engineCompositionHash,
})), {
  commitSha: comparison.sourceIdentity.commitSha,
  treeSha: comparison.sourceIdentity.treeSha,
  datasetHash: comparison.sourceIdentity.datasetHash,
  packageLockHash: comparison.sourceIdentity.packageLockHash,
  sdkVersion: comparison.sdkVersion,
  fixtureCount: comparison.fixtureCount,
  engineCompositionHash: comparison.sourceIdentity.engineCompositionHash,
}];
for (const key of Object.keys(identities[0]) as Array<keyof typeof identities[number]>) {
  if (new Set(identities.map((identity) => identity[key])).size !== 1) throw new Error(`Assembled reports disagree on ${key}.`);
}

const sequential = comparison.strategies.find((strategy) => strategy.strategyId === "scanly-multi-sequential");
const parallel = comparison.strategies.find((strategy) => strategy.strategyId === "scanly-multi-parallel");
if (!sequential || !parallel) throw new Error("Comparison lacks sequential or parallel Scanly strategies.");
const parityFailures = [
  parallel.positiveRecall < sequential.positiveRecall - 0.01 && "positive recall",
  parallel.exactPayloadAccuracy < sequential.exactPayloadAccuracy - 0.01 && "exact accuracy",
  parallel.falsePositiveCount > sequential.falsePositiveCount && "false positives",
  parallel.timeoutCount !== 0 && "timeouts",
  (parallel.initializationFailures !== 0 || parallel.executionFailures !== 0) && "engine failures",
].filter(Boolean);
if (parityFailures.length && (comparison.parallelExecution.status !== "experimental" || comparison.parallelExecution.builtInScenarioUsage)) {
  throw new Error(`Production parallel execution regressed: ${parityFailures.join(", ")}.`);
}
console.log(`Assembled ${reports.length + 1} compatible clean benchmark reports; parallel=${comparison.parallelExecution.status}.`);
