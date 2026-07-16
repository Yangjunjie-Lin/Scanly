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

const EVIDENCE_ONLY_PATHS = [
  /^benchmark-results\/(?:latest-fast|latest|latest-robust)\.(?:json|csv)$/,
  /^benchmark-results\/comparison\.json$/,
  /^benchmark-results\/canonical\/.+$/,
  /^benchmark-results\/baselines\/v2-alpha3-r\d+-(?:fast|balanced|robust)-node24-windows-x64\.json$/,
  /^benchmark-results\/baselines\/registry\.json$/,
  /^docs\/benchmark\.md$/,
  /^README\.md$/,
] as const;

function stripReadmeBenchmarkBlock(value: string): string {
  return value.replace(/<!-- BENCHMARK_SUMMARY_START -->[\s\S]*?<!-- BENCHMARK_SUMMARY_END -->/, "<!-- BENCHMARK_SUMMARY -->");
}

export function verifyEvidenceOnlyPaths(changedPaths: readonly string[]): string[] {
  return changedPaths
    .map((file) => file.replace(/\\/g, "/"))
    .filter((file) => !EVIDENCE_ONLY_PATHS.some((allowed) => allowed.test(file)));
}

export function verifyEvidenceCommitPolicy(root: string, sourceCommitSha: string, sourceTreeSha: string, evidenceCommitSha = "HEAD"): string[] {
  const failures: string[] = [];
  const git = (args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  try {
    if (git(["rev-parse", `${sourceCommitSha}^{tree}`]) !== sourceTreeSha) failures.push("source tree does not match source commit");
    execFileSync("git", ["merge-base", "--is-ancestor", sourceCommitSha, evidenceCommitSha], { cwd: root, stdio: "pipe" });
  } catch {
    failures.push("source commit is not an ancestor of the evidence commit");
    return failures;
  }
  const changed = git(["diff", "--name-only", sourceCommitSha, evidenceCommitSha]).split(/\r?\n/).filter(Boolean).map((file) => file.replace(/\\/g, "/"));
  const forbidden = verifyEvidenceOnlyPaths(changed);
  if (forbidden.length) failures.push(`runtime/tooling paths changed after source commit: ${forbidden.join(", ")}`);
  if (changed.includes("README.md")) {
    try {
      const source = execFileSync("git", ["show", `${sourceCommitSha}:README.md`], { cwd: root, encoding: "utf8" });
      const evidence = execFileSync("git", ["show", `${evidenceCommitSha}:README.md`], { cwd: root, encoding: "utf8" });
      if (stripReadmeBenchmarkBlock(source) !== stripReadmeBenchmarkBlock(evidence)) failures.push("README changes outside the benchmark summary block are not evidence-only");
    } catch { failures.push("README benchmark-only policy could not be verified"); }
  }
  return failures;
}

export function verifyEvidenceWorkingTreePolicy(root: string, sourceCommitSha: string, sourceTreeSha: string): string[] {
  const failures: string[] = [];
  const git = (args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  try {
    if (git(["rev-parse", `${sourceCommitSha}^{tree}`]) !== sourceTreeSha) failures.push("source tree does not match source commit");
    execFileSync("git", ["merge-base", "--is-ancestor", sourceCommitSha, "HEAD"], { cwd: root, stdio: "pipe" });
  } catch {
    failures.push("source commit is not an ancestor of the working tree HEAD");
    return failures;
  }
  const tracked = git(["diff", "--name-only", sourceCommitSha]).split(/\r?\n/).filter(Boolean);
  const untracked = git(["ls-files", "--others", "--exclude-standard"]).split(/\r?\n/).filter(Boolean);
  const changed = [...new Set([...tracked, ...untracked].map((file) => file.replace(/\\/g, "/")))];
  const forbidden = verifyEvidenceOnlyPaths(changed);
  if (forbidden.length) failures.push(`runtime/tooling paths changed after source commit: ${forbidden.join(", ")}`);
  if (changed.includes("README.md")) {
    try {
      const source = execFileSync("git", ["show", `${sourceCommitSha}:README.md`], { cwd: root, encoding: "utf8" });
      const evidence = fs.readFileSync(path.join(root, "README.md"), "utf8");
      if (stripReadmeBenchmarkBlock(source) !== stripReadmeBenchmarkBlock(evidence)) failures.push("README changes outside the benchmark summary block are not evidence-only");
    } catch { failures.push("README benchmark-only policy could not be verified"); }
  }
  return failures;
}
