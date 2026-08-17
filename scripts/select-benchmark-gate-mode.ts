import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createNodeCaptureRouter } from "@scanly/node";
import { getBuiltinScenario, type BuiltinScenarioId } from "@scanly/scenario-schema";
import type { BaselineRegistry } from "./baseline-registry.js";
import { runtimeFamily as baselineRuntimeFamily } from "./baseline-registry.js";
import { collectSourceIdentity, sha256, sha256Text } from "./benchmark-provenance.js";
import { readCanonicalEvidence, type CanonicalEvidenceManifestV21 } from "./canonical-evidence.js";
import {
  benchmarkLifecycleState,
  selectEvidenceLifecycle,
  type EvidenceLifecycleState,
} from "./evidence-lifecycle.js";

export type BenchmarkGateMode = "active-baseline" | "baseline-candidate";
export type WorkflowEvidenceMode = "integration" | "release";

export interface WorkflowEvidenceContext {
  eventName?: string;
  refName?: string;
  baseRef?: string;
  manualGateMode?: string;
}

export interface GateModeSelection {
  mode: BenchmarkGateMode;
  reason: string;
  runtimeFamily: string;
  baselineId?: string;
}

export interface CurrentBenchmarkIdentity {
  sdkVersion: string;
  runtimeFamily: string;
  packageLockHash: string;
  legacyDatasetHash: string;
  engineCompositionHash: string;
  wasmBuildHash: string;
  lifecycleState: EvidenceLifecycleState;
  sourceCommit?: string;
  sourceTree?: string;
  evidenceId?: string;
  canonicalManifestHash?: string;
  symbologyManifestHash?: string;
  symbologyDatasetHash?: string;
}

const PROFILES = ["fast", "balanced", "robust"] as const satisfies readonly BuiltinScenarioId[];
const PORTABLE_FILE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,191}\.json$/;
const SHA256 = /^[a-f0-9]{64}$/;

export function selectWorkflowEvidenceMode(context: WorkflowEvidenceContext): WorkflowEvidenceMode {
  if (context.eventName === "workflow_dispatch" && (context.manualGateMode === "integration" || context.manualGateMode === "release")) return context.manualGateMode;
  if (context.eventName === "pull_request" && context.baseRef === "develop/sdk-v2") return "integration";
  if (context.refName === "develop/sdk-v2" || /^architecture\/sdk-v2-beta\d+-/.test(context.refName ?? "")) return "integration";
  if (/^(?:release\/|rc\/|architecture\/sdk-v2-rc)/.test(context.refName ?? "")) return "release";
  return "integration";
}

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

function currentSymbologyIdentity(repositoryRoot: string): { manifestHash?: string; datasetHash?: string } {
  const manifestPath = path.join(repositoryRoot, "fixtures", "alpha5", "manifest.json");
  if (!fs.existsSync(manifestPath)) return {};
  const manifestBytes = fs.readFileSync(manifestPath);
  const manifest = JSON.parse(manifestBytes.toString("utf8")) as { fixtures?: Array<{ id: string; file: string }> };
  if (!Array.isArray(manifest.fixtures)) return {};
  const dataset = manifest.fixtures.map((fixture) => (
    `${fixture.id}\u001f${sha256(fs.readFileSync(path.join(repositoryRoot, fixture.file)))}`
  )).join("\n");
  return { manifestHash: sha256(manifestBytes), datasetHash: sha256(dataset) };
}

export async function collectCurrentBenchmarkIdentity(
  registry: BaselineRegistry,
  runtimeFamily: string,
  repositoryRoot = process.cwd(),
): Promise<CurrentBenchmarkIdentity> {
  const pkg = JSON.parse(fs.readFileSync(path.join(repositoryRoot, "package.json"), "utf8")) as { version: string };
  const manifestPath = path.join(repositoryRoot, "fixtures", "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as { fixtures: Array<{ file: string }> };
  const router = createNodeCaptureRouter({ scenario: getBuiltinScenario("balanced") });
  let source;
  try {
    source = await collectSourceIdentity({
      root: repositoryRoot,
      scenario: getBuiltinScenario("balanced"),
      engines: router.engines.list().map((engine) => ({ id: engine.id, version: engine.version, capabilities: engine.capabilities })),
      manifestPath,
      fixtureFiles: manifest.fixtures.map((fixture) => fixture.file),
      runnerPath: path.join(repositoryRoot, "scripts", "run-benchmark.ts"),
      allowDirty: true,
    });
  } finally {
    await router.dispose();
  }

  const symbology = currentSymbologyIdentity(repositoryRoot);
  const canonicalPath = path.join(repositoryRoot, "benchmark-results", "canonical", "canonical-evidence-manifest.json");
  let canonical: ReturnType<typeof readCanonicalEvidence>["manifest"] | undefined;
  try {
    if (fs.existsSync(canonicalPath)) canonical = readCanonicalEvidence(canonicalPath).manifest;
  } catch {
    canonical = undefined;
  }
  const sourceCompatible = Boolean(canonical
    && canonical.sdkVersion === pkg.version
    && canonical.sourceIdentity.packageLockHash === source.packageLockHash
    && canonical.sourceIdentity.datasetHash === source.datasetHash
    && canonical.sourceIdentity.engineCompositionHash === source.engineCompositionHash
    && canonical.sourceIdentity.wasmBuildHash === source.wasmBuildHash
    && (canonical.schemaVersion !== "2.1" || (
      (canonical as CanonicalEvidenceManifestV21).sourceIdentity.symbologyManifestHash === symbology.manifestHash
      && (canonical as CanonicalEvidenceManifestV21).sourceIdentity.symbologyDatasetHash === symbology.datasetHash
    )));
  const activeEvidence = registry.activeEvidence?.[runtimeFamily];
  const lifecycleState = selectEvidenceLifecycle({
    sdkVersion: pkg.version,
    ...(canonical ? {
      canonical: {
        sdkVersion: canonical.sdkVersion,
        evidenceId: canonical.evidenceId,
        manifestHash: canonical.manifestHash,
        sourceCompatible,
      },
    } : {}),
    activeEvidence,
  });

  return {
    sdkVersion: pkg.version,
    runtimeFamily: baselineRuntimeFamily(process.version, process.platform, process.arch),
    packageLockHash: source.packageLockHash,
    legacyDatasetHash: source.datasetHash,
    engineCompositionHash: source.engineCompositionHash,
    wasmBuildHash: source.wasmBuildHash,
    lifecycleState,
    ...(canonical?.sdkVersion === pkg.version ? {
      sourceCommit: canonical.sourceIdentity.sourceCommitSha,
      sourceTree: canonical.sourceIdentity.sourceTreeSha,
      evidenceId: canonical.evidenceId,
      canonicalManifestHash: canonical.manifestHash,
    } : {}),
    ...(symbology.manifestHash ? { symbologyManifestHash: symbology.manifestHash } : {}),
    ...(symbology.datasetHash ? { symbologyDatasetHash: symbology.datasetHash } : {}),
  };
}

export function selectBenchmarkGateMode(
  registry: BaselineRegistry,
  runtimeFamily: string,
  repositoryRoot: string,
  current: CurrentBenchmarkIdentity,
): GateModeSelection {
  try {
    if (!registry || typeof registry !== "object") return candidate(runtimeFamily, "registry is malformed");
    if (current.runtimeFamily !== runtimeFamily) return candidate(runtimeFamily, "requested runtime family does not match the current runtime identity");
    if (benchmarkLifecycleState(current.lifecycleState) === "baseline-candidate") {
      return candidate(runtimeFamily, `evidence lifecycle is ${current.lifecycleState}`);
    }
    if (!current.evidenceId || !current.canonicalManifestHash || !current.sourceCommit || !current.sourceTree) {
      return candidate(runtimeFamily, "current source has no compatible active evidence identity");
    }
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
    const releaseMatch = /^2\.0\.0-(alpha|beta|rc)\.(\d+)$/.exec(current.sdkVersion);
    const releaseTrack = releaseMatch ? `${releaseMatch[1]}${releaseMatch[2]}` : undefined;
    if (!releaseTrack || !baselineId.startsWith(`v2-${releaseTrack}-`)) return candidate(runtimeFamily, "active baseline release track is incompatible with the current SDK version");

    const evidence = registry.activeEvidence?.[runtimeFamily];
    if (!evidence || typeof evidence !== "object") return candidate(runtimeFamily, `runtime family ${runtimeFamily} has no active evidence`);
    if (!nonEmpty(evidence.baselineId) || evidence.baselineId !== baselineId) return candidate(runtimeFamily, "active evidence baseline ID does not match all baseline filenames");
    if (!nonEmpty(evidence.evidenceId) || evidence.evidenceId !== current.evidenceId) return candidate(runtimeFamily, "active evidence ID does not match current canonical evidence");
    if (!nonEmpty(evidence.canonicalManifestHash) || !SHA256.test(evidence.canonicalManifestHash) || evidence.canonicalManifestHash !== current.canonicalManifestHash) return candidate(runtimeFamily, "active evidence canonical manifest hash is stale");
    if (
      evidence.sourceCommit !== current.sourceCommit
      || evidence.sourceTree !== current.sourceTree
      || evidence.sdkVersion !== current.sdkVersion
      || evidence.packageLockHash !== current.packageLockHash
      || evidence.datasetHash !== current.legacyDatasetHash
      || evidence.engineCompositionHash !== current.engineCompositionHash
      || evidence.wasmBuildHash !== current.wasmBuildHash
    ) return candidate(runtimeFamily, "active evidence source identity is incompatible");
    if (current.symbologyManifestHash && evidence.symbologyManifestHash !== current.symbologyManifestHash) return candidate(runtimeFamily, "active evidence symbology manifest hash is stale");
    if (current.symbologyDatasetHash && evidence.symbologyDatasetHash !== current.symbologyDatasetHash) return candidate(runtimeFamily, "active evidence symbology dataset hash is stale");
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
        || source?.commitSha !== current.sourceCommit
        || source?.treeSha !== current.sourceTree
        || source?.packageLockHash !== current.packageLockHash
        || source?.datasetHash !== current.legacyDatasetHash
        || source?.engineCompositionHash !== current.engineCompositionHash
        || source?.wasmBuildHash !== current.wasmBuildHash
        || source?.repositoryDirty !== false
        || environment?.sdkVersion !== current.sdkVersion
        || environment?.scenario !== profile
        || actualRuntimeFamily !== runtimeFamily
      ) return candidate(runtimeFamily, `${profile} active baseline is inconsistent with the current source and evidence`);
    }

    return {
      mode: "active-baseline",
      reason: "complete active evidence matches current source and runtime identities",
      runtimeFamily,
      baselineId,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return candidate(runtimeFamily, `registry validation failed: ${message}`);
  }
}

export function enforceGateModeForLifecycle(selection: GateModeSelection, lifecycleState: EvidenceLifecycleState): void {
  if (benchmarkLifecycleState(lifecycleState) === "active-baseline" && selection.mode !== "active-baseline") {
    throw new Error(`Active evidence lifecycle requires active-baseline gate mode: ${selection.reason}.`);
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

  const resolvedRegistry = path.resolve(registryFile);
  const repositoryRoot = path.resolve(path.dirname(resolvedRegistry), "..", "..");
  const registry = JSON.parse(await fs.promises.readFile(resolvedRegistry, "utf8")) as BaselineRegistry;
  const current = await collectCurrentBenchmarkIdentity(registry, runtimeFamily, repositoryRoot);
  const selection = selectBenchmarkGateMode(registry, runtimeFamily, repositoryRoot, current);
  enforceGateModeForLifecycle(selection, current.lifecycleState);
  const workflowMode = selectWorkflowEvidenceMode({
    eventName: argument("event-name"),
    refName: argument("ref-name"),
    baseRef: argument("base-ref"),
    manualGateMode: argument("manual-gate-mode"),
  });

  const output = [
    `mode=${selection.mode}`,
    `workflow-mode=${workflowMode}`,
    `reason=${selection.reason}`,
    `baseline-id=${selection.baselineId ?? ""}`,
    `lifecycle-state=${current.lifecycleState}`,
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
