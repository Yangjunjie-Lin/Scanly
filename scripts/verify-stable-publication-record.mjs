import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
const sha256 = (absolute) => crypto.createHash("sha256").update(fs.readFileSync(absolute)).digest("hex");
const fail = (message) => { throw new Error(`Stable publication record: ${message}`); };
const recordPath = "release/stable/v2.0.0-publication-record.json";
const record = readJson(recordPath);
const qualification = readJson(record.qualificationManifest?.path ?? "");
const artifactManifest = readJson("release/stable/artifact-manifest.json");
const physical = readJson("release/stable/physical-validation-status.json");

if (record.schemaVersion !== "scanly-stable-publication-record-1" || record.version !== "2.0.0") fail("schema or version is invalid.");
const qualificationAbsolute = path.join(root, record.qualificationManifest.path);
if (sha256(qualificationAbsolute) !== record.qualificationManifest.sha256) fail("qualification manifest hash changed.");
if (qualification.version !== record.version || qualification.stable !== "V2_STABLE_RELEASE_GO") fail("qualification identity is not the frozen Stable GO record.");

const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const tagObject = git("rev-parse", record.gitTag.name);
const tagTarget = git("rev-parse", `${record.gitTag.name}^{}`);
if (git("cat-file", "-t", record.gitTag.name) !== "tag") fail("v2.0.0 is not an annotated tag.");
if (tagObject !== record.gitTag.object || tagTarget !== record.gitTag.target) fail("v2.0.0 tag object or target does not match the recorded immutable identity.");
if (record.gitTag.signing?.verified !== true || record.gitTag.signing?.status !== "GITHUB_VERIFIED" || record.gitTag.signing?.reason !== "valid") fail("GitHub tag signature verification is not recorded as valid.");
try {
  execFileSync("git", ["merge-base", "--is-ancestor", qualification.identity.productSourceCommit, tagTarget], { cwd: root, stdio: "ignore" });
} catch {
  fail("the frozen product source is not an ancestor of the signed Stable tag target.");
}

if (record.githubRelease.tag !== record.gitTag.name || record.githubRelease.draft !== false || record.githubRelease.prerelease !== false) fail("GitHub Release identity must be the final v2.0.0 release.");
if (!Number.isInteger(record.githubRelease.id) || !Date.parse(record.githubRelease.publishedAt)) fail("GitHub Release ID or publication time is invalid.");

const expectedPackages = new Set(artifactManifest.artifacts.filter((artifact) => artifact.platform === "npm").map((artifact) => {
  const base = path.basename(artifact.path, ".tgz").replace(/-2\.0\.0$/, "");
  return `@scanly/${base.replace(/^scanly-/, "")}`;
}));
if (record.npm.length !== expectedPackages.size || record.npm.length !== 10) fail("npm publication set must contain exactly the ten frozen package artifacts.");
for (const publication of record.npm) {
  if (!expectedPackages.delete(publication.name)) fail(`unexpected or duplicate npm package '${publication.name}'.`);
  if (publication.version !== record.version || publication.distTag !== "latest" || publication.distTagVersion !== record.version || publication.registry !== "https://registry.npmjs.org/" || publication.published !== true) fail(`${publication.name} publication identity is invalid.`);
  if (publication.provenance !== "VERIFIED_ATTESTATION_PRESENT") fail(`${publication.name} provenance is not recorded as verified.`);
}
if (expectedPackages.size) fail(`missing npm publications: ${[...expectedPackages].join(", ")}.`);

for (const artifact of artifactManifest.artifacts) {
  const absolute = path.join(root, artifact.path);
  if (!fs.existsSync(absolute)) fail(`frozen artifact is missing: ${artifact.path}.`);
  const stat = fs.statSync(absolute);
  if (stat.size !== artifact.size || sha256(absolute) !== artifact.sha256) fail(`frozen artifact bytes changed: ${artifact.path}.`);
}

const androidArtifact = artifactManifest.artifacts.find((artifact) => artifact.id === "android-aar");
if (!androidArtifact || record.android.filename !== path.basename(androidArtifact.path) || record.android.sha256 !== androidArtifact.sha256 || record.android.size !== androidArtifact.size) fail("Android GitHub Release asset does not match the Stable Artifact Manifest.");
const spmArtifact = artifactManifest.artifacts.find((artifact) => artifact.id === "ios-swift-package-source");
if (!spmArtifact || record.spm.tag !== record.gitTag.name || record.spm.artifactPackageSwiftSha256 !== spmArtifact.sha256 || !fs.existsSync(path.join(root, record.spm.packageSwiftPath))) fail("SPM source package identity is invalid.");

if (record.physicalValidation.status !== "POST_RELEASE_VALIDATION_PENDING" || record.physicalValidation.issue !== 13) fail("physical validation must remain pending under Issue #13.");
if (physical.issue !== 13 || physical.physicalMobileDeviceCount !== 0 || physical.physicalLongSessionCount !== 0) fail("frozen physical evidence counts are not zero.");
if (JSON.stringify(record.physicalValidation).includes('"PASS"') || JSON.stringify(physical).includes('"PASS"')) fail("physical PASS is forbidden without an independent qualification record.");
if (!Date.parse(record.createdAt) || !/^[0-9a-f]{40}$/.test(record.recordedFromGitState.commit) || !/^[0-9a-f]{40}$/.test(record.recordedFromGitState.tree)) fail("record creation or Git-state identity is invalid.");

console.log("Verified v2.0.0 Qualification → Publication identity, frozen artifacts, and pending physical boundary.");
