import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import type { BenchmarkSourceIdentity } from "@scanly/benchmark";

export interface EngineIdentityInput {
  id: string;
  version: string;
  capabilities: unknown;
}

export interface SourceIdentityOptions {
  root: string;
  scenario: unknown;
  engines: readonly EngineIdentityInput[];
  manifestPath: string;
  fixtureFiles: readonly string[];
  runnerPath: string;
  allowDirty?: boolean;
}

export function sha256(value: string | Buffer): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function repositoryStatus(root: string): string {
  return execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], { cwd: root, encoding: "utf8" }).trim();
}

export function assertCleanRepository(root: string): void {
  let clean = true;
  try { execFileSync("git", ["diff", "--exit-code"], { cwd: root, stdio: "pipe" }); } catch { clean = false; }
  try { execFileSync("git", ["diff", "--cached", "--exit-code"], { cwd: root, stdio: "pipe" }); } catch { clean = false; }
  const status = repositoryStatus(root);
  if (!clean || status) throw new Error(`Canonical benchmark requires a clean repository. Dirty entries:\n${status.slice(0, 4_096)}`);
}

export async function computeDatasetHash(manifestPath: string, fixtureFiles: readonly string[], root: string): Promise<string> {
  const hash = crypto.createHash("sha256").update(await fs.promises.readFile(manifestPath));
  for (const file of [...fixtureFiles].sort()) hash.update(file).update(await fs.promises.readFile(path.join(root, file)));
  return hash.digest("hex");
}

export async function collectSourceIdentity(options: SourceIdentityOptions): Promise<BenchmarkSourceIdentity> {
  const status = repositoryStatus(options.root);
  if (status && !options.allowDirty) assertCleanRepository(options.root);
  const git = (args: string[]) => execFileSync("git", args, { cwd: options.root, encoding: "utf8" }).trim();
  return {
    commitSha: git(["rev-parse", "HEAD"]),
    treeSha: git(["rev-parse", "HEAD^{tree}"]),
    repositoryDirty: Boolean(status),
    packageLockHash: sha256(await fs.promises.readFile(path.join(options.root, "package-lock.json"))),
    scenarioHash: sha256(stableJson(options.scenario)),
    datasetHash: await computeDatasetHash(options.manifestPath, options.fixtureFiles, options.root),
    engineCompositionHash: sha256(stableJson(options.engines.map((engine) => ({ id: engine.id, version: engine.version, capabilities: engine.capabilities })))),
    benchmarkRunnerHash: sha256(await fs.promises.readFile(options.runnerPath)),
  };
}
