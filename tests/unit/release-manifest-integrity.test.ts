import { execFileSync, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const root = process.cwd();
const verifier = path.join(root, "scripts", "verify-release-manifest.mjs");
const manifest = path.join(root, "release", "rc2", "rc2-candidate-manifest.v2.json");
const sidecar = `${manifest}.sha256`;
const expectedCandidateTag = JSON.parse(fs.readFileSync(manifest, "utf8")).identity.candidateTag as string;
const temporaryDirectories: string[] = [];

const temporaryCandidate = () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "scanly-release-manifest-"));
  temporaryDirectories.push(directory);
  const candidateManifest = path.join(directory, path.basename(manifest));
  const candidateSidecar = `${candidateManifest}.sha256`;
  fs.copyFileSync(manifest, candidateManifest);
  fs.copyFileSync(sidecar, candidateSidecar);
  return { candidateManifest, candidateSidecar };
};
const resignTemporaryCandidate = (candidateManifest: string, candidateSidecar: string) => {
  const bytes = fs.readFileSync(candidateManifest);
  const digest = crypto.createHash("sha256").update(bytes).digest("hex");
  fs.writeFileSync(candidateSidecar, `${digest}  ${path.basename(candidateManifest)}\n`, "utf8");
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe("RC2 detached Release Manifest integrity", () => {
  it("verifies raw bytes and classifies both historical manifests without upgrading their claims", () => {
    const output = execFileSync(process.execPath, [verifier], { cwd: root, encoding: "utf8" });
    expect(output).toContain("RC2_MANIFEST_INTEGRITY_GO");
    expect(output).toMatch(/CANDIDATE_TAG_(?:NOT_PRESENT|BOUND)/);
    expect(output).toContain(expectedCandidateTag);
    expect(output.match(/LEGACY_MANIFEST_HASH_UNVERIFIED/g)).toHaveLength(2);
    expect(output).not.toContain("PASS_RAW_SHA256");
    expect(fs.readFileSync(verifier, "utf8")).not.toContain("skip-canonical-recompute");

    const manifestValue = JSON.parse(fs.readFileSync(manifest, "utf8"));
    expect(manifestValue.schemaVersion).toBe("rc2-final-candidate-manifest-2");
    expect(manifestValue.identity).not.toHaveProperty("manifestSha256");
    expect(manifestValue.manifestDigest).toEqual({
      digestAlgorithm: "SHA-256",
      digestScope: "RAW_FILE_BYTES",
      encoding: "UTF-8",
      lineEnding: "LF",
      bom: false,
      digestStorage: "DETACHED_SIDECAR",
      sidecar: "release/rc2/rc2-candidate-manifest.v2.json.sha256",
    });
  }, 90_000);

  it("fails closed when one raw Manifest byte changes", () => {
    const candidate = temporaryCandidate();
    fs.appendFileSync(candidate.candidateManifest, "\n", "utf8");
    const result = spawnSync(process.execPath, [verifier, "--manifest", candidate.candidateManifest, "--sidecar", candidate.candidateSidecar], { cwd: root, encoding: "utf8" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Manifest raw SHA-256 mismatch");
  });

  it("fails closed when the detached sidecar changes", () => {
    const candidate = temporaryCandidate();
    const original = fs.readFileSync(candidate.candidateSidecar, "utf8");
    fs.writeFileSync(candidate.candidateSidecar, `${original[0] === "0" ? "1" : "0"}${original.slice(1)}`, "utf8");
    const result = spawnSync(process.execPath, [verifier, "--manifest", candidate.candidateManifest, "--sidecar", candidate.candidateSidecar], { cwd: root, encoding: "utf8" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Manifest raw SHA-256 mismatch");
  });

  it("treats RC1 r1 and RC2 r1 as legacy without requiring detached sidecars", () => {
    for (const legacy of ["release/rc1/rc1-candidate-manifest.json", "release/rc2/rc2-candidate-manifest.json"]) {
      const output = execFileSync(process.execPath, [verifier, "--manifest", legacy], { cwd: root, encoding: "utf8" });
      expect(output).toContain("LEGACY_MANIFEST_HASH_UNVERIFIED");
      expect(output).not.toContain("RC2_MANIFEST_INTEGRITY_GO");
      expect(output).not.toContain("PASS_RAW_SHA256");
    }
  });

  it("rejects unknown schemas outside the two anchored legacy paths", () => {
    const candidate = temporaryCandidate();
    const value = JSON.parse(fs.readFileSync(candidate.candidateManifest, "utf8"));
    value.schemaVersion = "unknown-release-schema";
    fs.writeFileSync(candidate.candidateManifest, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    resignTemporaryCandidate(candidate.candidateManifest, candidate.candidateSidecar);
    const result = spawnSync(process.execPath, [verifier, "--manifest", candidate.candidateManifest, "--sidecar", candidate.candidateSidecar], { cwd: root, encoding: "utf8" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Unsupported Manifest schema");
  });

  it("rejects a detached Manifest whose SBOM source declaration diverges", () => {
    const candidate = temporaryCandidate();
    const value = JSON.parse(fs.readFileSync(candidate.candidateManifest, "utf8"));
    value.sbom.sourceCommit = "0000000000000000000000000000000000000000";
    fs.writeFileSync(candidate.candidateManifest, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    resignTemporaryCandidate(candidate.candidateManifest, candidate.candidateSidecar);
    const result = spawnSync(process.execPath, [verifier, "--manifest", candidate.candidateManifest, "--sidecar", candidate.candidateSidecar], { cwd: root, encoding: "utf8" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Manifest SBOM Product Source identity mismatch");
  });

  it("rejects duplicate required artifact identities even when the detached digest is valid", () => {
    const candidate = temporaryCandidate();
    const value = JSON.parse(fs.readFileSync(candidate.candidateManifest, "utf8"));
    value.artifacts.required = [value.artifacts.required[0], value.artifacts.required[0], value.artifacts.required[0]];
    fs.writeFileSync(candidate.candidateManifest, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    resignTemporaryCandidate(candidate.candidateManifest, candidate.candidateSidecar);
    const result = spawnSync(process.execPath, [verifier, "--manifest", candidate.candidateManifest, "--sidecar", candidate.candidateSidecar], { cwd: root, encoding: "utf8" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Duplicate required artifact id");
  });

  it("keeps Stable qualification fail-closed while Physical and Signing remain NO-GO", () => {
    const result = spawnSync(process.execPath, [verifier, "--mode=stable"], { cwd: root, encoding: "utf8" });
    expect(result.status).not.toBe(0);
    expect(
      result.stderr.includes(`Required candidate tag '${expectedCandidateTag}' is not present`) ||
      result.stderr.includes("Stable release gate requires every Physical Matrix row to PASS"),
    ).toBe(true);
  });

  it("wires the verifier into RC assembly, artifact build, and the future Stable gate", () => {
    const read = (file: string) => fs.readFileSync(path.join(root, ".github", "workflows", file), "utf8");
    const integrity = read("rc-manifest-integrity.yml");
    const evidence = read("rc-evidence-assemble.yml");
    const artifacts = read("rc-artifact-build.yml");
    const stable = read("stable-release-gate.yml");

    for (const workflow of [integrity, evidence, artifacts, stable]) expect(workflow).toContain("rc:manifest:verify");
    expect(integrity).toContain("--require-candidate-tag");
    expect(evidence).not.toContain("rc2-candidate-manifest.template.json");
    expect(evidence).toContain("npm run rc:sbom -- --verify");
    expect(evidence).toContain("npm run rc:repro -- --output=${{ runner.temp }}/rc2-reproducibility.json");
    expect(artifacts).toContain("RC2_ARTIFACT_ROOT: ${{ runner.temp }}/rc2-artifacts");
    expect(artifacts).toContain("Record isolated CI rebuild identities without rewriting frozen evidence");
    expect(artifacts).toContain("rc:artifacts:verify-canonical");
    expect(stable).toContain("--mode=stable");
    expect(stable).toContain("device:evidence:verify");
  });
});
