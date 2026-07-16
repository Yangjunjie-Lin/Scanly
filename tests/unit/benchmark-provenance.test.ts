import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { assertCleanRepository, collectSourceIdentity, computeDatasetHash } from "../../scripts/benchmark-provenance.js";
import { loadBaselineRegistry, resolveActiveBaseline } from "../../scripts/baseline-registry.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

function repository() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "scanly-provenance-")); roots.push(root);
  const write = (file: string, content: string) => { const target = path.join(root, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, content); };
  write("package-lock.json", "{\"lockfileVersion\":3}"); write("fixtures/manifest.json", "{\"fixtures\":[]}"); write("fixtures/a.bin", "one"); write("scripts/runner.ts", "export {};"); write("source.ts", "export const value = 1;");
  execFileSync("git", ["init"], { cwd: root }); execFileSync("git", ["config", "user.email", "test@scanly.dev"], { cwd: root }); execFileSync("git", ["config", "user.name", "Scanly Test"], { cwd: root });
  execFileSync("git", ["add", "."], { cwd: root }); execFileSync("git", ["commit", "-m", "initial"], { cwd: root });
  return { root, write };
}

function identity(root: string, scenario: unknown, version = "1") {
  return collectSourceIdentity({ root, scenario, engines: [{ id: "engine", version, capabilities: { formats: ["qr_code"] } }], manifestPath: path.join(root, "fixtures/manifest.json"), fixtureFiles: ["fixtures/a.bin"], runnerPath: path.join(root, "scripts/runner.ts") });
}

describe("benchmark source provenance", () => {
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
  it("validates and resolves an exact runtime/profile baseline", async () => {
    const repo = repository();
    repo.write("baselines/base.json", "{}");
    repo.write("baselines/registry.json", JSON.stringify({ schemaVersion: "1.0", activeBaselines: { "node24-win32-x64": { fast: "base.json", balanced: "base.json", robust: "base.json" } } }));
    expect((await loadBaselineRegistry(path.join(repo.root, "baselines/registry.json"))).schemaVersion).toBe("1.0");
    expect(await resolveActiveBaseline(path.join(repo.root, "baselines/registry.json"), "balanced", "node24-win32-x64")).toBe(path.join(repo.root, "baselines/base.json"));
  });
});
