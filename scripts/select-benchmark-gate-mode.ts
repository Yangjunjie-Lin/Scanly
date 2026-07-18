import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { BuiltinScenarioId } from "@scanly/scenario-schema";
import type { BaselineRegistry } from "./baseline-registry.js";
import { runtimeFamily as baselineRuntimeFamily } from "./baseline-registry.js";
import { sha256Text } from "./benchmark-provenance.js";

export type BenchmarkGateMode = "active-baseline" | "baseline-candidate";

export interface GateModeSelection {
  mode: BenchmarkGateMode;
  reason: string;
  runtimeFamily: string;
  baselineId?: string;
}

const PROFILES = ["fast", "balanced", "robust"] as const satisfies readonly BuiltinScenarioId[];
const PORTABLE_FILE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,191}\.json$/;
const SHA256 = /^[a-f0-9]{64}$/;

function candidate(runtimeFamily: string, reason: string): GateModeSelection {
  return { mode: "baseline-candidate", reason, runtimeFamily };
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function baselineIdFromFile(file: string, profile: BuiltinScenarioId, runtimeFamily: string): string | undefined {
  const fileRuntime = runtimeFamily.replace(/-win32-/, "-windows-");
  const suffix = `-${profile}-${fileRuntime}.json`;
  if (!file.endsWith(suffix)) return undefined;
  const baselineId = file.slice(0, -suffix.length);
  return baselineId || undefined;
}

export function selectBenchmarkGateMode(
  registry: BaselineRegistry,
  runtimeFamily: string,
  repositoryRoot = process.cwd(),
): GateModeSelection {
  try {
    if (!registry || typeof registry !== "object") return candidate(runtimeFamily, "registry is malformed");
    if (!registry.activeBaselines || typeof registry.activeBaselines !== "object") return candidate(runtimeFamily, "registry activeBaselines is missing or malformed");
    const active = registry.activeBaselines[runtimeFamily];
    if (!active || typeof active !== "object") return candidate(runtimeFamily, `runtime family ${runtimeFamily} has no active baselines`);

    const files = {} as Record<BuiltinScenarioId, string>;
    const ids = {} as Record<BuiltinScenarioId, string>;
    for (const profile of PROFILES) {
      const file = active[profile];
      if (!nonEmpty(file) || !PORTABLE_FILE.test(file)) return candidate(runtimeFamily, `${profile} active baseline entry is missing or invalid`);
      const baselineId = baselineIdFromFile(file, profile, runtimeFamily);
      if (!baselineId) return candidate(runtimeFamily, `${profile} baseline filename does not match its profile and runtime family`);
      files[profile] = file;
      ids[profile] = baselineId;
    }
    const baselineIds = new Set(Object.values(ids));
    if (baselineIds.size !== 1) return candidate(runtimeFamily, "active baseline files belong to different baseline IDs");
    const baselineId = ids.fast;

    const evidence = registry.activeEvidence?.[runtimeFamily];
    if (!evidence || typeof evidence !== "object") return candidate(runtimeFamily, `runtime family ${runtimeFamily} has no active evidence`);
    if (!nonEmpty(evidence.baselineId) || evidence.baselineId !== baselineId) return candidate(runtimeFamily, "active evidence baseline ID does not match all baseline filenames");
    if (!nonEmpty(evidence.evidenceId)) return candidate(runtimeFamily, "active evidence ID is missing");
    if (!nonEmpty(evidence.canonicalManifestHash) || !SHA256.test(evidence.canonicalManifestHash)) return candidate(runtimeFamily, "active evidence canonical manifest hash is missing or invalid");
    if (!nonEmpty(evidence.sourceCommit) || !nonEmpty(evidence.engineCompositionHash) || !nonEmpty(evidence.wasmBuildHash)) return candidate(runtimeFamily, "active evidence provenance is incomplete");
    if (!evidence.baselineHashes || typeof evidence.baselineHashes !== "object") return candidate(runtimeFamily, "active evidence baseline hashes are missing");

    const baselineDirectory = path.join(repositoryRoot, "benchmark-results", "baselines");
    for (const profile of PROFILES) {
      const registeredHash = evidence.baselineHashes[profile];
      if (!nonEmpty(registeredHash) || !SHA256.test(registeredHash)) return candidate(runtimeFamily, `${profile} active baseline hash is missing or invalid`);
      const baselinePath = path.join(baselineDirectory, files[profile]);
      if (!fs.existsSync(baselinePath) || !fs.statSync(baselinePath).isFile()) return candidate(runtimeFamily, `${profile} active baseline file does not exist`);
      const raw = fs.readFileSync(baselinePath);
      if (sha256Text(raw) !== registeredHash) return candidate(runtimeFamily, `${profile} active baseline hash does not match its file`);

      let baseline: Record<string, unknown>;
      try {
        baseline = JSON.parse(raw.toString("utf8")) as Record<string, unknown>;
      } catch {
        return candidate(runtimeFamily, `${profile} active baseline file is malformed`);
      }
      const source = baseline.sourceIdentity as Record<string, unknown> | undefined;
      const environment = baseline.environment as Record<string, unknown> | undefined;
      const runtime = baseline.runtime as Record<string, unknown> | undefined;
      const actualRuntimeFamily = nonEmpty(runtime?.nodeVersion) && nonEmpty(runtime.platform) && nonEmpty(runtime.arch)
        ? baselineRuntimeFamily(runtime.nodeVersion, runtime.platform as NodeJS.Platform, runtime.arch as NodeJS.Architecture)
        : "";
      if (
        baseline.evidenceId !== evidence.evidenceId
        || baseline.canonicalManifestHash !== evidence.canonicalManifestHash
        || source?.commitSha !== evidence.sourceCommit
        || source?.engineCompositionHash !== evidence.engineCompositionHash
        || source?.wasmBuildHash !== evidence.wasmBuildHash
        || source?.repositoryDirty !== false
        || environment?.scenario !== profile
        || actualRuntimeFamily !== runtimeFamily
      ) return candidate(runtimeFamily, `${profile} active baseline is inconsistent with active evidence`);
    }

    return {
      mode: "active-baseline",
      reason: "complete and internally consistent active evidence",
      runtimeFamily,
      baselineId,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return candidate(runtimeFamily, `registry validation failed: ${message}`);
  }
}

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

async function main(): Promise<void> {
  const runtimeFamily = argument("runtime-family");
  const registryFile = argument("registry");
  if (!runtimeFamily || !registryFile) throw new Error("Usage: --runtime-family=<family> --registry=<registry.json> [--github-output=<file>]");

  let selection: GateModeSelection;
  try {
    const registry = JSON.parse(await fs.promises.readFile(path.resolve(registryFile), "utf8")) as BaselineRegistry;
    selection = selectBenchmarkGateMode(registry, runtimeFamily, path.resolve(path.dirname(registryFile), "..", ".."));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    selection = candidate(runtimeFamily, `registry could not be read: ${message}`);
  }

  const output = [
    `mode=${selection.mode}`,
    `reason=${selection.reason}`,
    `baseline-id=${selection.baselineId ?? ""}`,
  ];
  console.log(output.join("\n"));
  const githubOutput = argument("github-output");
  if (githubOutput) await fs.promises.appendFile(githubOutput, `${output.join("\n")}\n`);
}

const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedFile === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
