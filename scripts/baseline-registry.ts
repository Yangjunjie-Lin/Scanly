import fs from "node:fs";
import path from "node:path";
import type { BuiltinScenarioId } from "@scanly/scenario-schema";

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
