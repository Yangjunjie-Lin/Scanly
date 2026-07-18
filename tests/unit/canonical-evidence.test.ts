import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { BenchmarkRunSummary, ComparisonReport } from "@scanly/benchmark";
import { assembleCanonicalEvidence, computeCanonicalManifestHash, readCanonicalEvidence, validateProfileReport } from "../../scripts/canonical-evidence.js";
import { benchmarkResultsToCsv } from "../../scripts/benchmark-csv.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
const temp = () => { const root = fs.mkdtempSync(path.join(os.tmpdir(), "scanly-evidence-")); roots.push(root); return root; };

function artifacts() {
  const root = temp();
  const identity = {
    commitSha: "a".repeat(40), treeSha: "b".repeat(40), repositoryDirty: false,
    packageLockHash: "c".repeat(64), scenarioHash: "d".repeat(64), datasetHash: "e".repeat(64),
    engineCompositionHash: "f".repeat(64), wasmBuildHash: "2".repeat(64),
    nativeAdapterHash: "3".repeat(64), loaderHash: "4".repeat(64), benchmarkRunnerHash: "1".repeat(64),
  };
  const reports = {} as Record<"fast" | "balanced" | "robust", BenchmarkRunSummary>;
  for (const [profile, file] of [["fast", "latest-fast.json"], ["balanced", "latest.json"], ["robust", "latest-robust.json"]] as const) {
    const report = JSON.parse(fs.readFileSync(path.join(process.cwd(), "benchmark-results", file), "utf8")) as BenchmarkRunSummary;
    report.sourceIdentity = { ...identity, scenarioHash: profile.repeat(64).slice(0, 64) };
    report.environment.sdkVersion = "2.0.0-alpha.5";
    report.environment.warmInitializationMs = 0.01;
    report.environment.selectedWasmVariant = "standard";
    report.environment.wasmLinearMemoryPeakBytes = 22_282_240;
    report.executionPolicy = { mode: "canonical-candidate", evidenceType: "canonical-candidate", canonical: true, warmupIterations: 1, measuredIterations: 3, dirtyDevelopmentAllowed: false, updatesDocumentation: false };
    report.finalControlledMemoryBytes = 0;
    report.results = report.results.map((result) => ({ ...result, iterationPassCount: result.pass ? 3 : 0, iterationFailureCount: result.pass ? 0 : 3, unstablePayload: false, runTimingsMs: [1, 2, 3], finalControlledMemoryBytes: 0 }));
    reports[profile] = report;
  }
  const comparison = JSON.parse(fs.readFileSync(path.join(process.cwd(), "benchmark-results", "comparison.json"), "utf8")) as ComparisonReport & { runtime: { kind: "node"; nodeVersion: string; platform: string; arch: string } };
  const strategyAliases: Record<string, string> = {
    "raw-zxing-cpp-wasm": "raw-zxing-js",
    "scanly-zxing-js-only": "scanly-zxing-only",
    "scanly-zxing-cpp-only": "scanly-zxing-only",
    "scanly-js-wasm-sequential": "scanly-multi-sequential",
    "scanly-js-wasm-parallel-experimental": "scanly-multi-parallel",
  };
  for (const [strategyId, sourceId] of Object.entries(strategyAliases)) {
    const source = comparison.strategies.find((entry) => entry.strategyId === sourceId)!;
    comparison.strategies.push({ ...source, strategyId });
    comparison.perFixture.push(...comparison.perFixture.filter((entry) => entry.strategyId === sourceId).map((entry) => ({ ...entry, strategyId })));
  }
  Object.assign(comparison.strategies.find((entry) => entry.strategyId === "raw-zxing-cpp-wasm")!, {
    wasmVariant: "standard",
    wasmLinearMemoryPeakBytes: 22_282_240,
    initializationFailures: 0,
    executionFailures: 0,
    uniqueWins: ["05-low-contrast"],
  });
  comparison.sourceIdentity = { ...identity, scenarioHash: "2".repeat(64) };
  comparison.sdkVersion = "2.0.0-alpha.5";
  comparison.runtime = { kind: "node", nodeVersion: "v24.15.0", platform: "win32", arch: "x64" };
  comparison.executionPolicy = { mode: "canonical-candidate", evidenceType: "canonical-candidate", canonical: true, warmupIterations: 1, measuredIterations: 3, dirtyDevelopmentAllowed: false, updatesDocumentation: false };
  comparison.finalControlledMemoryBytes = 0;
  comparison.parallelExecution = { ...comparison.parallelExecution, status: "experimental", builtInScenarioUsage: false };
  comparison.perFixture = comparison.perFixture.map((result) => ({ ...result, iterationPassCount: result.pass ? 3 : 0, iterationFailureCount: result.pass ? 0 : 3, unstablePayload: false, runTimingsMs: [1, 2, 3], finalControlledMemoryBytes: 0 }));
  const paths = {
    fastJson: path.join(root, "fast.json"),
    fastCsv: path.join(root, "fast.csv"),
    balancedJson: path.join(root, "balanced.json"),
    balancedCsv: path.join(root, "balanced.csv"),
    robustJson: path.join(root, "robust.json"),
    robustCsv: path.join(root, "robust.csv"),
    comparisonJson: path.join(root, "comparison.json"),
  };
  for (const profile of ["fast", "balanced", "robust"] as const) {
    const prefix = profile === "fast" ? "fast" : profile === "balanced" ? "balanced" : "robust";
    fs.writeFileSync(paths[`${prefix}Json`], JSON.stringify(reports[profile]));
    fs.writeFileSync(paths[`${prefix}Csv`], benchmarkResultsToCsv(reports[profile].results));
  }
  fs.writeFileSync(paths.comparisonJson, JSON.stringify(comparison));
  return { root, paths, reports, comparison };
}

describe("canonical evidence assembly", () => {
  it("accepts four compatible clean artifacts and writes a deterministic manifest", () => {
    const fixture = artifacts();
    const first = assembleCanonicalEvidence(fixture.paths, path.join(fixture.root, "one"));
    const second = assembleCanonicalEvidence(fixture.paths, path.join(fixture.root, "two"));
    expect(first.manifest).toEqual(second.manifest);
    expect(computeCanonicalManifestHash(first.manifest)).toBe(first.manifest.manifestHash);
    expect(readCanonicalEvidence(first.manifestPath).manifest.evidenceId).toBe(first.manifest.evidenceId);
  });

  it.each([
    ["dirty report", (fixture: ReturnType<typeof artifacts>) => { fixture.reports.fast.sourceIdentity.repositoryDirty = true; }],
    ["development report", (fixture: ReturnType<typeof artifacts>) => { fixture.reports.fast.executionPolicy.canonical = false; fixture.reports.fast.executionPolicy.mode = "development"; }],
    ["low warmup", (fixture: ReturnType<typeof artifacts>) => { fixture.reports.fast.executionPolicy.warmupIterations = 0; }],
    ["low measured iterations", (fixture: ReturnType<typeof artifacts>) => { fixture.reports.fast.executionPolicy.measuredIterations = 2; }],
    ["different commit", (fixture: ReturnType<typeof artifacts>) => { fixture.reports.fast.sourceIdentity.commitSha = "8".repeat(40); }],
    ["different tree", (fixture: ReturnType<typeof artifacts>) => { fixture.reports.fast.sourceIdentity.treeSha = "9".repeat(40); }],
    ["different dataset", (fixture: ReturnType<typeof artifacts>) => { fixture.reports.fast.sourceIdentity.datasetHash = "9".repeat(64); }],
    ["different engine composition", (fixture: ReturnType<typeof artifacts>) => { fixture.reports.fast.sourceIdentity.engineCompositionHash = "7".repeat(64); }],
  ])("rejects %s", (_label, mutate) => {
    const fixture = artifacts(); mutate(fixture); fs.writeFileSync(fixture.paths.fastJson, JSON.stringify(fixture.reports.fast));
    expect(() => assembleCanonicalEvidence(fixture.paths, path.join(fixture.root, "out"))).toThrow(/assembly failed/);
  });

  it("rejects report substitution after assembly", () => {
    const fixture = artifacts();
    const bundle = assembleCanonicalEvidence(fixture.paths, path.join(fixture.root, "out"));
    fs.appendFileSync(bundle.reportPaths.fastJson, " ");
    expect(() => readCanonicalEvidence(bundle.manifestPath)).toThrow(/hash mismatch/);
  });

  it("accepts checkout-specific CRLF conversion for canonical text evidence", () => {
    const fixture = artifacts();
    const bundle = assembleCanonicalEvidence(fixture.paths, path.join(fixture.root, "out"));
    for (const reportPath of Object.values(bundle.reportPaths)) {
      const contents = fs.readFileSync(reportPath, "utf8").replace(/\r?\n/g, "\r\n");
      fs.writeFileSync(reportPath, contents);
    }
    expect(readCanonicalEvidence(bundle.manifestPath).manifest.evidenceId).toBe(bundle.manifest.evidenceId);
  });

  it("rejects a missing canonical report", () => {
    const fixture = artifacts();
    const bundle = assembleCanonicalEvidence(fixture.paths, path.join(fixture.root, "out"));
    fs.rmSync(bundle.reportPaths.robustCsv);
    expect(() => readCanonicalEvidence(bundle.manifestPath)).toThrow(/missing/);
  });

  it("rejects stale CSV metadata even when fixture IDs and row counts still match", () => {
    const fixture = artifacts();
    const csv = fs.readFileSync(fixture.paths.balancedCsv, "utf8").replace(",pass,", ",fail,");
    fs.writeFileSync(fixture.paths.balancedCsv, csv);
    expect(() => assembleCanonicalEvidence(fixture.paths, path.join(fixture.root, "out"))).toThrow(/CSV fixture metadata/);
  });
});

describe("canonical correctness policy", () => {
  it("accepts the Balanced minimum and a report that fixes 14-damaged", () => {
    const fixture = artifacts();
    expect(validateProfileReport(fixture.reports.balanced, "balanced")).toEqual([]);
    const report = fixture.reports.balanced;
    const damaged = report.results.find((result) => result.id === "14-damaged")!;
    damaged.pass = true;
    damaged.actualPayload = typeof damaged.expectedPayload === "string" ? damaged.expectedPayload : damaged.expectedPayload[0];
    damaged.failureReason = null;
    damaged.iterationPassCount = 3;
    damaged.iterationFailureCount = 0;
    report.passed = 74;
    report.failed = 0;
    report.successRate = 1;
    report.decodeRecall = 1;
    report.exactPayloadAccuracy = 1;
    report.remainingFailures = [];
    expect(validateProfileReport(report, "balanced")).toEqual([]);
  });

  it("rejects an unexpected new failure and recall below the integer minimum", () => {
    const fixture = artifacts();
    const report = fixture.reports.balanced;
    const newlyFailed = report.results.find((result) => result.pass && result.expectedOutcome === "decode")!;
    newlyFailed.pass = false;
    newlyFailed.actualPayload = null;
    newlyFailed.failureReason = "no_symbol_found";
    newlyFailed.iterationPassCount = 0;
    newlyFailed.iterationFailureCount = 3;
    report.passed = 72;
    report.failed = 2;
    report.successRate = 72 / 74;
    report.decodeRecall = 61 / 63;
    report.exactPayloadAccuracy = 61 / 63;
    report.remainingFailures.push(newlyFailed.id);
    const failures = validateProfileReport(report, "balanced").join(" ");
    expect(failures).toContain("below the 73/74 minimum");
    expect(failures).toContain("below the 62/63 minimum");
    expect(failures).toContain(`unexpected remaining failure: ${newlyFailed.id}`);
  });

  it("uses integer pass counts with tolerance-safe reported recall", () => {
    const report = artifacts().reports.balanced;
    report.decodeRecall += 5e-13;
    report.exactPayloadAccuracy += 5e-13;
    expect(validateProfileReport(report, "balanced")).toEqual([]);
  });

  it("accepts partial duplicate-symbol recovery as an expected Fast-profile failure", () => {
    const report = artifacts().reports.fast;
    report.results.find((result) => result.id === "67-multiple-same-two")!.failureReason = "incomplete_multiple";
    expect(validateProfileReport(report, "fast")).toEqual([]);
  });

  it("rejects a timeout even when it uses an allowed retained failure ID", () => {
    const report = artifacts().reports.balanced;
    report.results.find((result) => result.id === "14-damaged")!.failureReason = "timeout";
    report.timeoutCount = 1;
    expect(validateProfileReport(report, "balanced").join(" ")).toMatch(/timeouts|unexpected failure category/);
  });

  it("rejects an engine execution failure even when it uses an allowed retained failure ID", () => {
    const report = artifacts().reports.balanced;
    report.results.find((result) => result.id === "14-damaged")!.failureReason = "engine_execution_failure";
    report.engineExecutionFailures = 1;
    expect(validateProfileReport(report, "balanced").join(" ")).toMatch(/engine failures|unexpected failure category/);
  });
});
