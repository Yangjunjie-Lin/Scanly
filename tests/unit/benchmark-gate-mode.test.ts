import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { BaselineRegistry } from "../../scripts/baseline-registry.js";
import { enforceGateModeForLifecycle, selectBenchmarkGateMode, selectWorkflowEvidenceMode, type CurrentBenchmarkIdentity } from "../../scripts/select-benchmark-gate-mode.js";

const FAMILY = "node24-win32-x64";
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function sha256Text(value: string): string {
  return crypto.createHash("sha256").update(value.replace(/\r\n/g, "\n")).digest("hex");
}

function validRegistry(baselineId: string, sdkVersion = "2.0.0-beta.3"): { registry: BaselineRegistry; root: string; current: CurrentBenchmarkIdentity } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "scanly-gate-mode-"));
  roots.push(root);
  const directory = path.join(root, "benchmark-results", "baselines");
  fs.mkdirSync(directory, { recursive: true });
  const evidenceId = "evidence-test";
  const canonicalManifestHash = "a".repeat(64);
  const sourceCommit = "source-commit";
  const sourceTree = "source-tree";
  const packageLockHash = "c".repeat(64);
  const datasetHash = "d".repeat(64);
  const symbologyManifestHash = "e".repeat(64);
  const symbologyDatasetHash = "f".repeat(64);
  const engineCompositionHash = "engine-composition";
  const wasmBuildHash = "wasm-build";
  const files = {} as Record<"fast" | "balanced" | "robust", string>;
  const hashes = {} as Record<"fast" | "balanced" | "robust", string>;
  for (const profile of ["fast", "balanced", "robust"] as const) {
    const file = [baselineId, profile, "node24-windows-x64.json"].join("-");
    const contents = JSON.stringify({
      runtime: { nodeVersion: "v24.1.0", platform: "win32", arch: "x64" },
      sourceIdentity: { commitSha: sourceCommit, treeSha: sourceTree, repositoryDirty: false, packageLockHash, datasetHash, engineCompositionHash, wasmBuildHash },
      environment: { scenario: profile, sdkVersion },
      evidenceId,
      canonicalManifestHash,
    }, null, 2) + "\n";
    fs.writeFileSync(path.join(directory, file), contents);
    files[profile] = file;
    hashes[profile] = sha256Text(contents);
  }
  return {
    root,
    registry: {
      schemaVersion: "2.0",
      activeBaselines: { [FAMILY]: files },
      activeEvidence: {
        [FAMILY]: { baselineId, evidenceId, canonicalManifestHash, baselineHashes: hashes, sourceCommit, sourceTree, sdkVersion, packageLockHash, datasetHash, symbologyManifestHash, symbologyDatasetHash, engineCompositionHash, wasmBuildHash },
      },
    },
    current: { sdkVersion, runtimeFamily: FAMILY, packageLockHash, legacyDatasetHash: datasetHash, engineCompositionHash, wasmBuildHash, lifecycleState: "active-baseline", sourceCommit, sourceTree, evidenceId, canonicalManifestHash, symbologyManifestHash, symbologyDatasetHash },
  };
}

function select(registry: BaselineRegistry, root: string, current: CurrentBenchmarkIdentity) {
  return selectBenchmarkGateMode(registry, FAMILY, root, current);
}

describe("benchmark gate mode selector", () => {
  it("classifies develop, Beta branches, and PR development as integration", () => {
    expect(selectWorkflowEvidenceMode({ eventName: "push", refName: "develop/sdk-v2" })).toBe("integration");
    expect(selectWorkflowEvidenceMode({ eventName: "push", refName: "architecture/sdk-v2-beta1-realtime-scanner-foundation" })).toBe("integration");
    expect(selectWorkflowEvidenceMode({ eventName: "push", refName: "architecture/sdk-v2-beta2-barcode-tracking-foundation" })).toBe("integration");
    expect(selectWorkflowEvidenceMode({ eventName: "push", refName: "architecture/sdk-v2-beta3-industrial-robustness-foundation" })).toBe("integration");
    expect(selectWorkflowEvidenceMode({ eventName: "push", refName: "architecture/sdk-v2-beta4-device-platform-hardening" })).toBe("integration");
    expect(selectWorkflowEvidenceMode({ eventName: "pull_request", baseRef: "develop/sdk-v2" })).toBe("integration");
    expect(selectWorkflowEvidenceMode({ eventName: "workflow_dispatch", refName: "develop/sdk-v2", manualGateMode: "integration" })).toBe("integration");
  });

  it("enters release policy only through an explicit manual input or release candidate ref", () => {
    expect(selectWorkflowEvidenceMode({ eventName: "workflow_dispatch", refName: "develop/sdk-v2", manualGateMode: "release" })).toBe("release");
    expect(selectWorkflowEvidenceMode({ eventName: "push", refName: "rc/sdk-v2-beta2" })).toBe("release");
    expect(selectWorkflowEvidenceMode({ eventName: "push", refName: "feature/unclassified" })).toBe("integration");
  });

  it("selects active-baseline for matching Beta 3 evidence", () => {
    const { registry, root, current } = validRegistry("v2-beta3-r1");
    expect(select(registry, root, current)).toEqual({
      mode: "active-baseline",
      reason: "complete active evidence matches current source and runtime identities",
      runtimeFamily: FAMILY,
      baselineId: "v2-beta3-r1",
    });
  });

  it.each(["fast", "balanced", "robust"] as const)("falls back when the %s entry is missing", (profile) => {
    const { registry, root, current } = validRegistry("v2-beta3-r1");
    delete (registry.activeBaselines[FAMILY] as Partial<Record<typeof profile, string>>)[profile];
    expect(select(registry, root, current).mode).toBe("baseline-candidate");
  });

  it("falls back for mixed revisions", () => {
    const { registry, root, current } = validRegistry("v2-beta3-r1");
    registry.activeBaselines[FAMILY].fast = "v2-beta3-r2-fast-node24-windows-x64.json";
    expect(select(registry, root, current)).toMatchObject({ mode: "baseline-candidate", reason: expect.stringContaining("different baseline IDs") });
  });

  it("falls back when a filename does not match its baseline ID", () => {
    const { registry, root, current } = validRegistry("v2-beta3-r1");
    registry.activeEvidence![FAMILY].baselineId = "v2-beta3-r2";
    expect(select(registry, root, current)).toMatchObject({ mode: "baseline-candidate", reason: expect.stringContaining("does not match") });
  });

  it("falls back when active evidence is missing", () => {
    const { registry, root, current } = validRegistry("v2-beta3-r1");
    delete registry.activeEvidence![FAMILY];
    expect(select(registry, root, current).mode).toBe("baseline-candidate");
  });

  it("falls back when the evidence ID is missing", () => {
    const { registry, root, current } = validRegistry("v2-beta3-r1");
    registry.activeEvidence![FAMILY].evidenceId = "";
    expect(select(registry, root, current).mode).toBe("baseline-candidate");
  });

  it("falls back when the manifest hash is missing", () => {
    const { registry, root, current } = validRegistry("v2-beta3-r1");
    registry.activeEvidence![FAMILY].canonicalManifestHash = "";
    expect(select(registry, root, current).mode).toBe("baseline-candidate");
  });

  it("falls back when one baseline hash is missing", () => {
    const { registry, root, current } = validRegistry("v2-beta3-r1");
    registry.activeEvidence![FAMILY].baselineHashes.robust = "";
    expect(select(registry, root, current).mode).toBe("baseline-candidate");
  });

  it("falls back when a referenced baseline file is missing", () => {
    const { registry, root, current } = validRegistry("v2-beta3-r1");
    fs.rmSync(path.join(root, "benchmark-results", "baselines", registry.activeBaselines[FAMILY].balanced));
    expect(select(registry, root, current).mode).toBe("baseline-candidate");
  });

  it("falls back for malformed registry data", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "scanly-gate-mode-"));
    roots.push(root);
    const { current } = validRegistry("v2-beta3-r1");
    expect(select(null as unknown as BaselineRegistry, root, current)).toMatchObject({ mode: "baseline-candidate", reason: "registry is malformed" });
  });

  it("falls back for an unsupported runtime family", () => {
    const { registry, root, current } = validRegistry("v2-beta3-r1");
    expect(selectBenchmarkGateMode(registry, "node24-linux-arm64", root, { ...current, runtimeFamily: "node24-linux-arm64" })).toMatchObject({ mode: "baseline-candidate", runtimeFamily: "node24-linux-arm64" });
  });

  it("falls back when the current architecture does not match the requested runtime", () => {
    const { registry, root, current } = validRegistry("v2-beta3-r1");
    expect(select(registry, root, { ...current, runtimeFamily: "node24-win32-arm64" })).toMatchObject({
      mode: "baseline-candidate",
      reason: expect.stringContaining("current runtime identity"),
    });
  });

  it("falls back for an empty registry", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "scanly-gate-mode-"));
    roots.push(root);
    const { current } = validRegistry("v2-beta3-r1");
    const registry = { schemaVersion: "2.0", activeBaselines: {} } as BaselineRegistry;
    expect(select(registry, root, current).mode).toBe("baseline-candidate");
  });

  it("rejects an Alpha.4 active baseline for Beta 3 source", () => {
    const { registry, root, current } = validRegistry("v2-alpha4-r4", "2.0.0-alpha.4");
    expect(select(registry, root, { ...current, sdkVersion: "2.0.0-beta.3" })).toMatchObject({ mode: "baseline-candidate", reason: expect.stringContaining("release track") });
  });

  it("does not reuse Beta 3 active evidence as a Beta 4 baseline", () => {
    const { registry, root, current } = validRegistry("v2-beta3-r1");
    expect(select(registry, root, { ...current, sdkVersion: "2.0.0-beta.4" })).toMatchObject({ mode: "baseline-candidate", reason: expect.stringContaining("release track") });
  });

  it("does not reuse Beta 4 active evidence as a Beta 5 baseline", () => {
    const { registry, root, current } = validRegistry("v2-beta4-r1", "2.0.0-beta.4");
    expect(select(registry, root, { ...current, sdkVersion: "2.0.0-beta.5" })).toMatchObject({ mode: "baseline-candidate", reason: expect.stringContaining("release track") });
  });

  it("falls back for a mismatched legacy dataset", () => {
    const { registry, root, current } = validRegistry("v2-beta3-r1");
    expect(select(registry, root, { ...current, legacyDatasetHash: "1".repeat(64) }).mode).toBe("baseline-candidate");
  });

  it("falls back for stale evidence in candidate lifecycle and hard-fails when active", () => {
    const { registry, root, current } = validRegistry("v2-beta3-r1");
    const stale = { ...current, canonicalManifestHash: "b".repeat(64), lifecycleState: "evidence-bootstrap" as const };
    expect(select(registry, root, stale).mode).toBe("baseline-candidate");
    expect(() => enforceGateModeForLifecycle(select(registry, root, stale), "active-baseline")).toThrow(/requires active-baseline/);
  });
});
