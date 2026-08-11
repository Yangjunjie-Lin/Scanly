import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { BROWSER_SDK_VERSION } from "../packages/browser/src/index.js";
import { runTrackingSuite } from "../benchmark/tracking/report.js";

const ROOT = path.resolve(__dirname, "..");
const OUTPUT = path.join(ROOT, "benchmark-results", "tracking", "tracking-results.json");

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
}

async function main(): Promise<void> {
  const suite = await runTrackingSuite();
  const report = {
    schemaVersion: "2.3-beta2-development",
    kind: "barcode-tracking-and-batch-integration",
    generatedAt: new Date().toISOString(),
    sourceCommit: git("rev-parse", "HEAD"),
    sourceTree: git("rev-parse", "HEAD^{tree}"),
    repositoryDirty: git("status", "--porcelain", "--untracked-files=all").length > 0,
    sdkVersion: BROWSER_SDK_VERSION,
    semanticContract: suite.semanticContract,
    scenarioCount: suite.scenarios.length,
    scenarios: suite.scenarios,
    scaleBaselines: suite.scales,
    aggregateMetrics: suite.aggregateMetrics,
    aggregateGates: suite.aggregateGates,
    pass: suite.pass,
    status: suite.pass ? "passed" : "failed",
    failureReasons: suite.failureReasons,
  };
  await fs.mkdir(path.dirname(OUTPUT), { recursive: true });
  await fs.writeFile(OUTPUT, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    output: path.relative(ROOT, OUTPUT),
    sourceCommit: report.sourceCommit,
    sourceTree: report.sourceTree,
    repositoryDirty: report.repositoryDirty,
    sdkVersion: report.sdkVersion,
    semanticContract: report.semanticContract,
    scenarioCount: report.scenarioCount,
    aggregateMetrics: report.aggregateMetrics,
    scaleBaselines: report.scaleBaselines,
    status: report.status,
    failureReasons: report.failureReasons,
  }, null, 2));
  if (!suite.pass) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
