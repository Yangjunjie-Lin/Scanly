import { execFileSync, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const root = process.cwd();
const verifier = path.join(root, "scripts", "verify-release-manifest.mjs");
const stableVerifier = path.join(root, "scripts", "verify-stable-manifest.mjs");
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
const clonedRepository = () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "scanly-release-manifest-repository-"));
  temporaryDirectories.push(directory);
  const repository = path.join(directory, "repository");
  execFileSync("git", ["clone", "--quiet", "--shared", root, repository], { cwd: root });
  fs.copyFileSync(verifier, path.join(repository, "scripts", "verify-release-manifest.mjs"));
  return repository;
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe("RC2 detached Release Manifest integrity", () => {
  it("verifies raw bytes and classifies both historical manifests without upgrading their claims", () => {
    const output = execFileSync(process.execPath, [verifier], { cwd: root, encoding: "utf8" });
    expect(output).toContain("RC2_MANIFEST_INTEGRITY_GO");
    expect(output).toMatch(/CANDIDATE_TAG_(?:NOT_PRESENT|BOUND|INTEGRATED)/);
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

  it("distinguishes an exact Candidate head from a Candidate integrated into a descendant", () => {
    const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
    const target = execFileSync("git", ["rev-list", "-n", "1", expectedCandidateTag], { cwd: root, encoding: "utf8" }).trim();
    const ancestry = spawnSync("git", ["merge-base", "--is-ancestor", target, head], { cwd: root });
    expect(ancestry.status).toBe(0);

    const integrated = execFileSync(process.execPath, [verifier, "--require-candidate-tag"], { cwd: root, encoding: "utf8" });
    expect(integrated).toContain(target === head ? "CANDIDATE_TAG_BOUND" : "CANDIDATE_TAG_INTEGRATED");

    const exact = spawnSync(process.execPath, [verifier, "--require-exact-candidate-head"], { cwd: root, encoding: "utf8" });
    if (target === head) {
      expect(exact.status).toBe(0);
      expect(exact.stdout).toContain("CANDIDATE_TAG_BOUND");
    } else {
      expect(exact.status).not.toBe(0);
      expect(exact.stderr).toContain("Candidate tag does not target the exact Evidence Head.");
    }
  }, 90_000);

  it("rejects descendant rewriting of Candidate-bound release evidence", () => {
    const repository = clonedRepository();
    const repositoryManifest = path.join(repository, "release", "rc2", "rc2-candidate-manifest.v2.json");
    const repositorySidecar = `${repositoryManifest}.sha256`;
    const value = JSON.parse(fs.readFileSync(repositoryManifest, "utf8"));
    value.postTagMutation = true;
    fs.writeFileSync(repositoryManifest, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    resignTemporaryCandidate(repositoryManifest, repositorySidecar);
    execFileSync("git", ["add", "release/rc2/rc2-candidate-manifest.v2.json", "release/rc2/rc2-candidate-manifest.v2.json.sha256"], { cwd: repository });
    execFileSync("git", ["-c", "user.name=Scanly Test", "-c", "user.email=scanly-test@example.invalid", "commit", "--quiet", "--no-verify", "-m", "test: mutate candidate evidence"], { cwd: repository });

    const result = spawnSync(process.execPath, [path.join(repository, "scripts", "verify-release-manifest.mjs"), "--require-candidate-tag"], { cwd: repository, encoding: "utf8" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Candidate-bound release/rc2 evidence changed after the immutable Candidate tag.");
  }, 90_000);

  it("rejects movement of an immutable Candidate tag object and target", () => {
    const repository = clonedRepository();
    execFileSync("git", ["-c", "user.name=Scanly Test", "-c", "user.email=scanly-test@example.invalid", "tag", "--force", "--annotate", "v2-rc2-r4", "--message", "moved test tag", "HEAD"], { cwd: repository });

    const result = spawnSync(process.execPath, [path.join(repository, "scripts", "verify-release-manifest.mjs"), "--require-candidate-tag"], { cwd: repository, encoding: "utf8" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/Immutable Candidate tag 'v2-rc2-r4' (?:object changed|target moved)/);
  }, 90_000);

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

  it("allows Physical pending when all software and publication gates are GO", () => {
    const policy = execFileSync(process.execPath, [stableVerifier], { cwd: root, encoding: "utf8" });
    expect(policy).toContain("physical=POST_RELEASE_VALIDATION_REQUIRED");
    expect(policy).toContain("stable=V2_STABLE_RELEASE_GO");

    const result = spawnSync(process.execPath, [stableVerifier, "--require-go"], { cwd: root, encoding: "utf8" });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("stable=V2_STABLE_RELEASE_GO");
  });

  it("keeps incomplete software or publication gates fail-closed", () => {
    const repository = clonedRepository();
    const repositoryStableVerifier = path.join(repository, "scripts", "verify-stable-manifest.mjs");
    const repositoryStableManifest = path.join(repository, "release", "stable", "v2.0.0-manifest.json");
    const repositoryStableSidecar = `${repositoryStableManifest}.sha256`;
    const value = JSON.parse(fs.readFileSync(repositoryStableManifest, "utf8"));
    value.publication = "NO_GO";
    value.stable = "V2_STABLE_RELEASE_NO_GO";
    fs.writeFileSync(repositoryStableManifest, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    const digest = crypto.createHash("sha256").update(fs.readFileSync(repositoryStableManifest)).digest("hex");
    fs.writeFileSync(repositoryStableSidecar, `${digest}  v2.0.0-manifest.json\n`, "utf8");

    const policy = execFileSync(process.execPath, [repositoryStableVerifier], { cwd: repository, encoding: "utf8" });
    expect(policy).toContain("physical=POST_RELEASE_VALIDATION_REQUIRED");
    expect(policy).toContain("stable=V2_STABLE_RELEASE_NO_GO");

    const result = spawnSync(process.execPath, [repositoryStableVerifier, "--require-go"], { cwd: repository, encoding: "utf8" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Stable promotion blocked: publication=NO_GO");
  }, 90_000);

  it("wires the verifier into RC assembly, artifact build, and the future Stable gate", () => {
    const read = (file: string) => fs.readFileSync(path.join(root, ".github", "workflows", file), "utf8");
    const integrity = read("rc-manifest-integrity.yml");
    const evidence = read("rc-evidence-assemble.yml");
    const artifacts = read("rc-artifact-build.yml");
    const stable = read("stable-release-gate.yml");

    for (const workflow of [integrity, evidence, artifacts]) expect(workflow).toContain("rc:manifest:verify");
    expect(integrity).toContain("--require-candidate-tag");
    expect(integrity).toContain("--require-exact-candidate-head");
    expect(integrity).toContain("branches: [develop, develop/sdk-v2, release/sdk-v2-rc2-final-validation]");
    expect(evidence).not.toContain("rc2-candidate-manifest.template.json");
    expect(evidence.match(/--require-exact-candidate-head/g)).toHaveLength(2);
    expect(evidence).toContain("npm run rc:sbom -- --verify");
    expect(evidence).toContain("npm run rc:repro -- --output=${{ runner.temp }}/rc2-reproducibility.json");
    expect(artifacts).toContain("RC2_ARTIFACT_ROOT: ${{ runner.temp }}/rc2-artifacts");
    expect(artifacts).toContain("Record isolated CI rebuild identities without rewriting frozen evidence");
    expect(artifacts).toContain("rc:artifacts:verify-canonical");
    expect(artifacts).toContain("--require-exact-candidate-head");
    expect(artifacts).toContain("branches: [develop, develop/sdk-v2, release/sdk-v2-rc2-final-validation]");
    expect(stable).toContain("stable:manifest:verify");
    expect(stable).toContain("--require-go");
    expect(stable).toContain("POST_RELEASE_VALIDATION_PENDING");
    expect(stable).not.toContain("--require-exact-candidate-head");
    expect(stable).not.toContain("device:evidence:verify");
  });
});
