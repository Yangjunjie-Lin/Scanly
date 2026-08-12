import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { assertCleanRepository, collectSourceIdentity, computeDatasetHash, sha256Text, verifyEvidenceCommitPolicy, verifyEvidenceOnlyPaths, verifyEvidenceWorkingTreePolicy } from "../../scripts/benchmark-provenance.js";
import { deviceEvidenceOnlyAfterSource } from "../../scripts/device-evidence-source-policy.js";
import { loadBaselineRegistry, resolveActiveBaseline, validateBaselineForActivation, writeImmutableBaseline } from "../../scripts/baseline-registry.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

function repository() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "scanly-provenance-")); roots.push(root);
  const write = (file: string, content: string) => { const target = path.join(root, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, content); };
  write("package-lock.json", "{\"lockfileVersion\":3}"); write("fixtures/manifest.json", "{\"fixtures\":[]}"); write("fixtures/a.bin", "one"); write("scripts/runner.ts", "export {};"); write("source.ts", "export const value = 1;"); write("README.md", "before\n<!-- BENCHMARK_SUMMARY_START -->\nold\n<!-- BENCHMARK_SUMMARY_END -->\nafter\n");
  execFileSync("git", ["init"], { cwd: root }); execFileSync("git", ["config", "user.email", "test@scanly.dev"], { cwd: root }); execFileSync("git", ["config", "user.name", "Scanly Test"], { cwd: root });
  execFileSync("git", ["add", "."], { cwd: root }); execFileSync("git", ["commit", "-m", "initial"], { cwd: root });
  return { root, write };
}

function identity(root: string, scenario: unknown, version = "1") {
  return collectSourceIdentity({ root, scenario, engines: [{ id: "engine", version, capabilities: { formats: ["qr_code"] } }], manifestPath: path.join(root, "fixtures/manifest.json"), fixtureFiles: ["fixtures/a.bin"], runnerPath: path.join(root, "scripts/runner.ts") });
}

describe("benchmark source provenance", () => {
  it("normalizes checkout-specific line endings in reproducibility hashes", async () => {
    expect(sha256Text("lock\nfile\n")).toBe(sha256Text("lock\r\nfile\r\n"));
    const left = repository();
    const right = repository();
    left.write("fixtures/manifest.json", "{\"fixtures\":[]}\n");
    right.write("fixtures/manifest.json", "{\"fixtures\":[]}\r\n");
    expect(await computeDatasetHash(path.join(left.root, "fixtures/manifest.json"), ["fixtures/a.bin"], left.root))
      .toBe(await computeDatasetHash(path.join(right.root, "fixtures/manifest.json"), ["fixtures/a.bin"], right.root));
  });

  it("blocks canonical work from a dirty repository", () => {
    const repo = repository(); repo.write("source.ts", "changed");
    expect(() => assertCleanRepository(repo.root)).toThrow(/clean repository/);
  });

  it("records commit/tree identity and changes the tree after an intentional commit", async () => {
    const repo = repository(); const before = await identity(repo.root, { id: "a" });
    repo.write("source.ts", "export const value = 2;"); execFileSync("git", ["add", "."], { cwd: repo.root }); execFileSync("git", ["commit", "-m", "change"], { cwd: repo.root });
    const after = await identity(repo.root, { id: "a" });
    expect(after.commitSha).not.toBe(before.commitSha); expect(after.treeSha).not.toBe(before.treeSha); expect(after.repositoryDirty).toBe(false);
  });

  it("changes dataset, scenario, and engine composition hashes independently", async () => {
    const repo = repository(); const before = await identity(repo.root, { id: "a" }, "1");
    const scenario = await identity(repo.root, { id: "b" }, "1"); const engine = await identity(repo.root, { id: "a" }, "2");
    expect(scenario.scenarioHash).not.toBe(before.scenarioHash); expect(engine.engineCompositionHash).not.toBe(before.engineCompositionHash);
    const firstDataset = await computeDatasetHash(path.join(repo.root, "fixtures/manifest.json"), ["fixtures/a.bin"], repo.root);
    repo.write("fixtures/a.bin", "two");
    const secondDataset = await computeDatasetHash(path.join(repo.root, "fixtures/manifest.json"), ["fixtures/a.bin"], repo.root);
    expect(secondDataset).not.toBe(firstDataset);
  });
});

describe("baseline registry", () => {
  it("never overwrites an immutable baseline", () => {
    const repo = repository();
    const file = path.join(repo.root, "baselines", "v2-alpha3-r1-fast-node24-windows-x64.json");
    writeImmutableBaseline(file, { evidenceId: "first" });
    expect(() => writeImmutableBaseline(file, { evidenceId: "second" })).toThrow();
    expect(JSON.parse(fs.readFileSync(file, "utf8"))).toEqual({ evidenceId: "first" });
  });

  it("validates and resolves an exact runtime/profile baseline", async () => {
    const repo = repository();
    repo.write("baselines/base.json", "{}");
    repo.write("baselines/registry.json", JSON.stringify({ schemaVersion: "1.0", activeBaselines: { "node24-win32-x64": { fast: "base.json", balanced: "base.json", robust: "base.json" } } }));
    expect((await loadBaselineRegistry(path.join(repo.root, "baselines/registry.json"))).schemaVersion).toBe("1.0");
    expect(await resolveActiveBaseline(path.join(repo.root, "baselines/registry.json"), "balanced", "node24-win32-x64")).toBe(path.join(repo.root, "baselines/base.json"));
  });

  it("accepts only clean canonical Alpha.3-compatible baseline evidence", () => {
    const expected = { sdkVersion: "2.0.0-alpha.3", fixtureCount: 74, datasetHash: "dataset", profile: "balanced" as const, runtimeFamily: "node24-win32-x64" };
    const baseline = JSON.parse(fs.readFileSync(path.join(process.cwd(), "benchmark-results", "latest.json"), "utf8")) as Parameters<typeof validateBaselineForActivation>[0];
    baseline.runtime = { kind: "node", nodeVersion: "v24.1.0", platform: "win32", arch: "x64" };
    baseline.sourceIdentity = { ...baseline.sourceIdentity!, repositoryDirty: false, datasetHash: "dataset" };
    baseline.environment = { ...baseline.environment!, sdkVersion: "2.0.0-alpha.3", fixtureCount: 74, datasetManifestHash: "dataset", scenario: "balanced" };
    baseline.executionPolicy = { ...baseline.executionPolicy!, canonical: true, warmupIterations: 1, measuredIterations: 3 };
    baseline.finalControlledMemoryBytes = 0;
    expect(validateBaselineForActivation(baseline, expected)).toEqual([]);
    expect(validateBaselineForActivation({ ...baseline, sourceIdentity: { ...baseline.sourceIdentity!, repositoryDirty: true } }, expected).join(" ")).toContain("dirty");
    expect(validateBaselineForActivation({ ...baseline, environment: { ...baseline.environment!, sdkVersion: "2.0.0-alpha.2", fixtureCount: 63 } }, expected).join(" ")).toMatch(/SDK version|fixture count/);
    expect(validateBaselineForActivation({ ...baseline, executionPolicy: { ...baseline.executionPolicy!, canonical: false, warmupIterations: 0, measuredIterations: 1 } }, expected).join(" ")).toMatch(/not canonical|warmup|measured/);
  });
});

describe("source/evidence commit policy", () => {
  it("allows only canonical aliases, versioned baselines, registry, and evidence documentation", () => {
    expect(verifyEvidenceOnlyPaths([
      "benchmark-results/latest-fast.json", "benchmark-results/latest-fast.csv", "benchmark-results/latest.json", "benchmark-results/latest.csv",
      "benchmark-results/latest-robust.json", "benchmark-results/latest-robust.csv", "benchmark-results/comparison.json", "benchmark-results/symbologies.json",
      "benchmark-results/canonical/canonical-evidence-manifest.json",
      "benchmark-results/baselines/v2-alpha3-r1-fast-node24-windows-x64.json",
      "benchmark-results/baselines/v2-alpha5-r1-balanced-node24-windows-x64.json",
      "benchmark-results/baselines/registry.json", "docs/benchmark.md", "docs/symbologies.md", "README.md",
    ])).toEqual([]);
  });

  it.each([
    "benchmark-results/baselines/v2-alpha5-balanced-node24-windows-x64.json",
    "fixtures/manifest.json",
    ".github/workflows/benchmark.yml",
    "scripts/run-benchmark.ts",
    "package-lock.json",
  ])("rejects non-evidence path %s", (file) => {
    expect(verifyEvidenceOnlyPaths([file])).toEqual([file]);
  });

  it("allows report, benchmark documentation, and marked README summary changes", () => {
    const repo = repository();
    const source = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo.root, encoding: "utf8" }).trim();
    const tree = execFileSync("git", ["rev-parse", "HEAD^{tree}"], { cwd: repo.root, encoding: "utf8" }).trim();
    repo.write("benchmark-results/latest.json", "{}"); repo.write("docs/benchmark.md", "evidence"); repo.write("README.md", "before\n<!-- BENCHMARK_SUMMARY_START -->\nnew\n<!-- BENCHMARK_SUMMARY_END -->\nafter\n");
    execFileSync("git", ["add", "."], { cwd: repo.root }); execFileSync("git", ["commit", "-m", "evidence"], { cwd: repo.root });
    expect(verifyEvidenceCommitPolicy(repo.root, source, tree)).toEqual([]);
  });

  it("checks tracked and untracked evidence paths before the evidence commit", () => {
    const repo = repository();
    const source = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo.root, encoding: "utf8" }).trim();
    const tree = execFileSync("git", ["rev-parse", "HEAD^{tree}"], { cwd: repo.root, encoding: "utf8" }).trim();
    repo.write("benchmark-results/canonical/canonical-evidence-manifest.json", "{}");
    expect(verifyEvidenceWorkingTreePolicy(repo.root, source, tree)).toEqual([]);
    repo.write("fixtures/manifest.json", "changed");
    expect(verifyEvidenceWorkingTreePolicy(repo.root, source, tree).join(" ")).toContain("fixtures/manifest.json");
  });

  it("rejects runtime changes between source and evidence commits", () => {
    const repo = repository();
    const source = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo.root, encoding: "utf8" }).trim();
    const tree = execFileSync("git", ["rev-parse", "HEAD^{tree}"], { cwd: repo.root, encoding: "utf8" }).trim();
    repo.write("source.ts", "export const value = 2;"); execFileSync("git", ["add", "."], { cwd: repo.root }); execFileSync("git", ["commit", "-m", "runtime"], { cwd: repo.root });
    expect(verifyEvidenceCommitPolicy(repo.root, source, tree).join(" ")).toContain("runtime/tooling");
  });

  it("rejects README changes outside the marked benchmark block", () => {
    const repo = repository();
    const source = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo.root, encoding: "utf8" }).trim();
    const tree = execFileSync("git", ["rev-parse", "HEAD^{tree}"], { cwd: repo.root, encoding: "utf8" }).trim();
    repo.write("README.md", "changed outside\n<!-- BENCHMARK_SUMMARY_START -->\nold\n<!-- BENCHMARK_SUMMARY_END -->\nafter\n");
    execFileSync("git", ["add", "."], { cwd: repo.root }); execFileSync("git", ["commit", "-m", "bad readme"], { cwd: repo.root });
    expect(verifyEvidenceCommitPolicy(repo.root, source, tree).join(" ")).toContain("README changes outside");
  });
});

describe("physical device source/evidence policy", () => {
  it("allows a clean source followed only by physical evidence and status documentation", () => {
    const repo = repository();
    const source = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo.root, encoding: "utf8" }).trim();
    repo.write("device-evidence/sessions/beta4-physical.json", "{}");
    repo.write("device-evidence/status.json", "{}");
    repo.write("docs/platform-compatibility.md", "physical evidence status");
    execFileSync("git", ["add", "."], { cwd: repo.root });
    execFileSync("git", ["commit", "-m", "device evidence"], { cwd: repo.root });
    expect(deviceEvidenceOnlyAfterSource(repo.root, source)).toBe(true);
  });

  it("rejects any runtime or verifier change after the tested source", () => {
    const repo = repository();
    const source = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo.root, encoding: "utf8" }).trim();
    repo.write("source.ts", "export const value = 2;");
    execFileSync("git", ["add", "."], { cwd: repo.root });
    execFileSync("git", ["commit", "-m", "runtime change"], { cwd: repo.root });
    expect(deviceEvidenceOnlyAfterSource(repo.root, source)).toBe(false);
  });

  it("rejects a tree object presented as a source commit", () => {
    const repo = repository();
    const tree = execFileSync("git", ["rev-parse", "HEAD^{tree}"], { cwd: repo.root, encoding: "utf8" }).trim();
    expect(deviceEvidenceOnlyAfterSource(repo.root, tree)).toBe(false);
  });

  it.each(["device-evidence/schema.json", "device-evidence/README.md", "device-evidence/sessions/README.md", "docs/beta4-device-validation.md"])('rejects contract or instruction change %s after the tested source', (file) => {
    const repo = repository();
    const source = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo.root, encoding: "utf8" }).trim();
    repo.write(file, "changed contract");
    execFileSync("git", ["add", "."], { cwd: repo.root });
    execFileSync("git", ["commit", "-m", "contract change"], { cwd: repo.root });
    expect(deviceEvidenceOnlyAfterSource(repo.root, source)).toBe(false);
  });

  it("rejects a post-source manifest that could redefine tested protocol identity", () => {
    const repo = repository();
    const source = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo.root, encoding: "utf8" }).trim();
    repo.write("device-evidence/manifests/session.json", "{}");
    execFileSync("git", ["add", "."], { cwd: repo.root });
    execFileSync("git", ["commit", "-m", "manifest"], { cwd: repo.root });
    expect(deviceEvidenceOnlyAfterSource(repo.root, source)).toBe(false);
  });

  it("rejects runtime changes in the current working tree when requested", () => {
    const repo = repository();
    const source = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo.root, encoding: "utf8" }).trim();
    repo.write("source.ts", "export const value = 2;");
    expect(deviceEvidenceOnlyAfterSource(repo.root, source, "HEAD", true)).toBe(false);
    execFileSync("git", ["add", "source.ts"], { cwd: repo.root });
    expect(deviceEvidenceOnlyAfterSource(repo.root, source, "HEAD", true)).toBe(false);
    repo.write("untracked-runtime.ts", "export {};");
    expect(deviceEvidenceOnlyAfterSource(repo.root, source, "HEAD", true)).toBe(false);
  });

  it("does not hide a runtime change by renaming it into an evidence-only path", () => {
    const repo = repository();
    const source = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo.root, encoding: "utf8" }).trim();
    fs.mkdirSync(path.join(repo.root, "device-evidence", "sessions"), { recursive: true });
    fs.renameSync(path.join(repo.root, "source.ts"), path.join(repo.root, "device-evidence", "sessions", "runtime.json"));
    execFileSync("git", ["add", "-A"], { cwd: repo.root });
    execFileSync("git", ["commit", "-m", "rename runtime"], { cwd: repo.root });
    expect(deviceEvidenceOnlyAfterSource(repo.root, source)).toBe(false);
  });
});
