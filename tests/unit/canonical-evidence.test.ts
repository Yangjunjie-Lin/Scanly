import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { BenchmarkRunSummary, ComparisonReport } from "@scanly/benchmark";
import { assembleCanonicalEvidence, computeCanonicalManifestHash, readCanonicalEvidence } from "../../scripts/canonical-evidence.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
const temp = () => { const root = fs.mkdtempSync(path.join(os.tmpdir(), "scanly-evidence-")); roots.push(root); return root; };

function artifacts() {
  const root = temp();
  const identity = {
    commitSha: "a".repeat(40), treeSha: "b".repeat(40), repositoryDirty: false,
    packageLockHash: "c".repeat(64), scenarioHash: "d".repeat(64), datasetHash: "e".repeat(64),
    engineCompositionHash: "f".repeat(64), benchmarkRunnerHash: "1".repeat(64),
  };
  const reports = {} as Record<"fast" | "balanced" | "robust", BenchmarkRunSummary>;
  for (const [profile, file] of [["fast", "latest-fast.json"], ["balanced", "latest.json"], ["robust", "latest-robust.json"]] as const) {
    const report = JSON.parse(fs.readFileSync(path.join(process.cwd(), "benchmark-results", file), "utf8")) as BenchmarkRunSummary;
    report.sourceIdentity = { ...identity, scenarioHash: profile.repeat(64).slice(0, 64) };
    report.executionPolicy = { mode: "canonical-candidate", evidenceType: "canonical-candidate", canonical: true, warmupIterations: 1, measuredIterations: 3, dirtyDevelopmentAllowed: false, updatesDocumentation: false };
    report.finalControlledMemoryBytes = 0;
    report.results = report.results.map((result) => ({ ...result, iterationPassCount: result.pass ? 3 : 0, iterationFailureCount: result.pass ? 0 : 3, unstablePayload: false, runTimingsMs: [1, 2, 3] }));
    reports[profile] = report;
  }
  const comparison = JSON.parse(fs.readFileSync(path.join(process.cwd(), "benchmark-results", "comparison.json"), "utf8")) as ComparisonReport;
  comparison.sourceIdentity = { ...identity, scenarioHash: "2".repeat(64) };
  comparison.executionPolicy = { mode: "canonical-candidate", evidenceType: "canonical-candidate", canonical: true, warmupIterations: 1, measuredIterations: 3, dirtyDevelopmentAllowed: false, updatesDocumentation: false };
  comparison.finalControlledMemoryBytes = 0;
  comparison.parallelExecution = { ...comparison.parallelExecution, status: "experimental", builtInScenarioUsage: false };
  comparison.perFixture = comparison.perFixture.map((result) => ({ ...result, iterationPassCount: result.pass ? 3 : 0, iterationFailureCount: result.pass ? 0 : 3, unstablePayload: false, runTimingsMs: [1, 2, 3], finalControlledMemoryBytes: 0 }));
  const paths = {
    fast: path.join(root, "fast.json"), balanced: path.join(root, "balanced.json"), robust: path.join(root, "robust.json"), comparison: path.join(root, "comparison.json"),
  };
  for (const profile of ["fast", "balanced", "robust"] as const) fs.writeFileSync(paths[profile], JSON.stringify(reports[profile]));
  fs.writeFileSync(paths.comparison, JSON.stringify(comparison));
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
    ["different tree", (fixture: ReturnType<typeof artifacts>) => { fixture.reports.fast.sourceIdentity.treeSha = "9".repeat(40); }],
    ["different dataset", (fixture: ReturnType<typeof artifacts>) => { fixture.reports.fast.sourceIdentity.datasetHash = "9".repeat(64); }],
  ])("rejects %s", (_label, mutate) => {
    const fixture = artifacts(); mutate(fixture); fs.writeFileSync(fixture.paths.fast, JSON.stringify(fixture.reports.fast));
    expect(() => assembleCanonicalEvidence(fixture.paths, path.join(fixture.root, "out"))).toThrow(/assembly failed/);
  });

  it("rejects report substitution after assembly", () => {
    const fixture = artifacts();
    const bundle = assembleCanonicalEvidence(fixture.paths, path.join(fixture.root, "out"));
    fs.appendFileSync(bundle.reportPaths.fast, " ");
    expect(() => readCanonicalEvidence(bundle.manifestPath)).toThrow(/hash mismatch/);
  });
});
