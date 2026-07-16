import fs from "node:fs";
import path from "node:path";
import type { BuiltinScenarioId } from "@scanly/scenario-schema";
import type { BenchmarkRunSummary } from "@scanly/benchmark";

export interface BaselineRegistry {
  schemaVersion: "1.0";
  activeBaselines: Record<string, Record<BuiltinScenarioId, string>>;
}

const PORTABLE_FILE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,191}\.json$/;

export function runtimeFamily(nodeVersion = process.version, platform = process.platform, arch = process.arch): string {
  const major = /^v?(\d+)/.exec(nodeVersion)?.[1] ?? "unknown";
  return `node${major}-${platform}-${arch}`;
}

export async function loadBaselineRegistry(file: string): Promise<BaselineRegistry> {
  const parsed = JSON.parse(await fs.promises.readFile(file, "utf8")) as Partial<BaselineRegistry>;
  if (parsed.schemaVersion !== "1.0" || !parsed.activeBaselines || typeof parsed.activeBaselines !== "object") throw new Error("Baseline registry schema is invalid.");
  for (const [family, profiles] of Object.entries(parsed.activeBaselines)) {
    if (!/^node\d+-(win32|linux|darwin)-(x64|arm64)$/.test(family) || !profiles || typeof profiles !== "object") throw new Error(`Baseline registry runtime family '${family}' is invalid.`);
    for (const profile of ["fast", "balanced", "robust"] as const) {
      if (!PORTABLE_FILE.test(profiles[profile])) throw new Error(`Baseline registry entry '${family}.${profile}' is invalid.`);
    }
  }
  return parsed as BaselineRegistry;
}

export async function resolveActiveBaseline(registryFile: string, profile: BuiltinScenarioId, family = runtimeFamily()): Promise<string> {
  const registry = await loadBaselineRegistry(registryFile);
  const file = registry.activeBaselines[family]?.[profile];
  if (!file) throw new Error(`No active baseline is registered for ${family}/${profile}.`);
  const resolved = path.join(path.dirname(registryFile), file);
  if (!fs.existsSync(resolved)) throw new Error(`Active baseline file '${file}' does not exist.`);
  return resolved;
}

export interface BaselineCompatibility {
  sdkVersion: string;
  fixtureCount: number;
  datasetHash: string;
  profile: BuiltinScenarioId;
  runtimeFamily: string;
}

export function validateBaselineForActivation(baseline: Partial<BenchmarkRunSummary>, expected: BaselineCompatibility): string[] {
  const failures: string[] = [];
  const normalizedFamily = expected.runtimeFamily.replace("windows", "win32");
  const actualFamily = baseline.runtime?.nodeVersion && baseline.runtime.platform && baseline.runtime.arch
    ? runtimeFamily(baseline.runtime.nodeVersion, baseline.runtime.platform as NodeJS.Platform, baseline.runtime.arch as NodeJS.Architecture)
    : "";
  if (!baseline.sourceIdentity) failures.push("baseline source identity is missing");
  if (baseline.sourceIdentity?.repositoryDirty !== false) failures.push("baseline source repository is dirty");
  if (baseline.environment?.sdkVersion !== expected.sdkVersion) failures.push("baseline SDK version is incompatible");
  if (baseline.environment?.fixtureCount !== expected.fixtureCount || baseline.total !== expected.fixtureCount) failures.push("baseline fixture count is incompatible");
  if (baseline.sourceIdentity?.datasetHash !== expected.datasetHash || baseline.environment?.datasetManifestHash !== expected.datasetHash) failures.push("baseline dataset hash is incompatible");
  if (baseline.environment?.scenario !== expected.profile) failures.push("baseline profile is incompatible");
  if (actualFamily !== normalizedFamily) failures.push("baseline runtime family is incompatible");
  if (!baseline.executionPolicy?.canonical) failures.push("baseline execution policy is not canonical");
  if ((baseline.executionPolicy?.warmupIterations ?? 0) < 1) failures.push("baseline warmup is below one iteration");
  if ((baseline.executionPolicy?.measuredIterations ?? 0) < 3) failures.push("baseline measured iterations are below three");
  if (baseline.multipleCompleteness?.complete !== baseline.multipleCompleteness?.total) failures.push("baseline multiple-code results are incomplete");
  if ((baseline.timeoutCount ?? 0) !== 0) failures.push("baseline contains timeouts");
  if ((baseline.falsePositiveCount ?? 0) !== 0) failures.push("baseline contains false positives");
  if ((baseline.engineInitializationFailures ?? 0) !== 0 || (baseline.engineExecutionFailures ?? 0) !== 0) failures.push("baseline contains engine failures");
  if ((baseline.finalControlledMemoryBytes ?? -1) !== 0) failures.push("baseline does not prove zero final controlled bytes");
  return failures;
}
