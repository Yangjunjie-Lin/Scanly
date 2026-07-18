import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { BaselineRegistry } from "../../scripts/baseline-registry.js";
import { selectBenchmarkGateMode } from "../../scripts/select-benchmark-gate-mode.js";

const FAMILY = "node24-win32-x64";
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function sha256Text(value: string): string {
  return crypto.createHash("sha256").update(value.replace(/\r\n/g, "\n")).digest("hex");
}

function validRegistry(baselineId: string): { registry: BaselineRegistry; root: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "scanly-gate-mode-"));
  roots.push(root);
  const directory = path.join(root, "benchmark-results", "baselines");
  fs.mkdirSync(directory, { recursive: true });
  const evidenceId = "evidence-test";
  const canonicalManifestHash = "a".repeat(64);
  const sourceCommit = "source-commit";
  const engineCompositionHash = "engine-composition";
  const wasmBuildHash = "wasm-build";
  const files = {} as Record<"fast" | "balanced" | "robust", string>;
  const hashes = {} as Record<"fast" | "balanced" | "robust", string>;
  for (const profile of ["fast", "balanced", "robust"] as const) {
    const file = `${baselineId}-${profile}-node24-windows-x64.json`;
    const contents = `${JSON.stringify({
      runtime: { nodeVersion: "v24.1.0", platform: "win32", arch: "x64" },
      sourceIdentity: { commitSha: sourceCommit, repositoryDirty: false, engineCompositionHash, wasmBuildHash },
      environment: { scenario: profile },
      evidenceId,
      canonicalManifestHash,
    }, null, 2)}\n`;
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
        [FAMILY]: { baselineId, evidenceId, canonicalManifestHash, baselineHashes: hashes, sourceCommit, engineCompositionHash, wasmBuildHash },
      },
    },
  };
}

function select(registry: BaselineRegistry, root: string) {
  return selectBenchmarkGateMode(registry, FAMILY, root);
}

describe("benchmark gate mode selector", () => {
  it.each([
    "v2-alpha3-r3",
    "v2-alpha4-r3",
    "v2-alpha5-r1",
    "v2-beta1-r1",
    "v2-rc1-r1",
  ])("selects active-baseline for complete %s evidence", (baselineId) => {
    const { registry, root } = validRegistry(baselineId);
    expect(select(registry, root)).toEqual({
      mode: "active-baseline",
      reason: "complete and internally consistent active evidence",
      runtimeFamily: FAMILY,
      baselineId,
    });
  });

  it.each(["fast", "balanced", "robust"] as const)("falls back when the %s entry is missing", (profile) => {
    const { registry, root } = validRegistry("v2-alpha4-r3");
    delete (registry.activeBaselines[FAMILY] as Partial<Record<typeof profile, string>>)[profile];
    expect(select(registry, root).mode).toBe("baseline-candidate");
  });

  it("falls back for mixed revisions", () => {
    const { registry, root } = validRegistry("v2-alpha4-r3");
    registry.activeBaselines[FAMILY].fast = "v2-alpha4-r2-fast-node24-windows-x64.json";
    expect(select(registry, root)).toMatchObject({ mode: "baseline-candidate", reason: expect.stringContaining("different baseline IDs") });
  });

  it("falls back when a filename does not match its baseline ID", () => {
    const { registry, root } = validRegistry("v2-alpha4-r3");
    registry.activeEvidence![FAMILY].baselineId = "v2-alpha4-r2";
    expect(select(registry, root)).toMatchObject({ mode: "baseline-candidate", reason: expect.stringContaining("does not match") });
  });

  it("falls back when active evidence is missing", () => {
    const { registry, root } = validRegistry("v2-alpha4-r3");
    delete registry.activeEvidence![FAMILY];
    expect(select(registry, root).mode).toBe("baseline-candidate");
  });

  it("falls back when the evidence ID is missing", () => {
    const { registry, root } = validRegistry("v2-alpha4-r3");
    registry.activeEvidence![FAMILY].evidenceId = "";
    expect(select(registry, root).mode).toBe("baseline-candidate");
  });

  it("falls back when the manifest hash is missing", () => {
    const { registry, root } = validRegistry("v2-alpha4-r3");
    registry.activeEvidence![FAMILY].canonicalManifestHash = "";
    expect(select(registry, root).mode).toBe("baseline-candidate");
  });

  it("falls back when one baseline hash is missing", () => {
    const { registry, root } = validRegistry("v2-alpha4-r3");
    registry.activeEvidence![FAMILY].baselineHashes.robust = "";
    expect(select(registry, root).mode).toBe("baseline-candidate");
  });

  it("falls back when a referenced baseline file is missing", () => {
    const { registry, root } = validRegistry("v2-alpha4-r3");
    fs.rmSync(path.join(root, "benchmark-results", "baselines", registry.activeBaselines[FAMILY].balanced));
    expect(select(registry, root).mode).toBe("baseline-candidate");
  });

  it("falls back for malformed registry data", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "scanly-gate-mode-"));
    roots.push(root);
    expect(select(null as unknown as BaselineRegistry, root)).toMatchObject({ mode: "baseline-candidate", reason: "registry is malformed" });
  });

  it("falls back for an unsupported runtime family", () => {
    const { registry, root } = validRegistry("v2-alpha4-r3");
    expect(selectBenchmarkGateMode(registry, "node24-linux-arm64", root)).toMatchObject({ mode: "baseline-candidate", runtimeFamily: "node24-linux-arm64" });
  });

  it("falls back for an empty registry", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "scanly-gate-mode-"));
    roots.push(root);
    const registry = { schemaVersion: "2.0", activeBaselines: {} } as BaselineRegistry;
    expect(select(registry, root).mode).toBe("baseline-candidate");
  });
});
