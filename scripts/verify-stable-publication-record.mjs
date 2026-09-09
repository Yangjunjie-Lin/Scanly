import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const stableRoot = path.join(root, "release", "stable");
const readJson = (absolute) => JSON.parse(fs.readFileSync(absolute, "utf8"));
const sha256 = (absolute) => crypto.createHash("sha256").update(fs.readFileSync(absolute)).digest("hex");
const fail = (message) => { throw new Error(`Stable publication record: ${message}`); };
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const recordPaths = [
  ...fs.readdirSync(stableRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^v\d+\.\d+\.\d+-publication-record\.json$/.test(entry.name))
    .map((entry) => path.join(stableRoot, entry.name)),
  ...fs.readdirSync(stableRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^v\d+\.\d+\.\d+$/.test(entry.name))
    .flatMap((entry) => {
      const directory = path.join(stableRoot, entry.name);
      return fs.readdirSync(directory, { withFileTypes: true })
        .filter((child) => child.isFile() && child.name === `${entry.name}-publication-record.json`)
        .map((child) => path.join(directory, child.name));
    }),
].sort();

if (recordPaths.length === 0) fail("no immutable publication records were found.");

for (const recordPath of recordPaths) {
  const releaseRoot = path.dirname(recordPath);
  const record = readJson(recordPath);
  const version = record.version;
  if (record.schemaVersion !== "scanly-stable-publication-record-1" || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version ?? "")) fail(`${recordPath}: schema or version is invalid.`);
  if (path.basename(recordPath) !== `v${version}-publication-record.json`) fail(`${recordPath}: filename does not match record version.`);

  const qualificationPath = path.join(root, record.qualificationManifest?.path ?? "");
  const artifactManifestPath = path.join(releaseRoot, "artifact-manifest.json");
  const physicalPath = path.join(releaseRoot, "physical-validation-status.json");
  const qualification = readJson(qualificationPath);
  const artifactManifest = readJson(artifactManifestPath);
  const physical = readJson(physicalPath);

  if (sha256(qualificationPath) !== record.qualificationManifest.sha256) fail(`${version}: qualification manifest hash changed.`);
  if (qualification.version !== version || qualification.stable !== "V2_STABLE_RELEASE_GO") fail(`${version}: qualification identity is not the frozen Stable GO record.`);

  const tagObject = git("rev-parse", record.gitTag.name);
  const tagTarget = git("rev-parse", `${record.gitTag.name}^{}`);
  if (record.gitTag.name !== `v${version}` || git("cat-file", "-t", record.gitTag.name) !== "tag") fail(`${version}: release tag is not the expected annotated tag.`);
  if (tagObject !== record.gitTag.object || tagTarget !== record.gitTag.target) fail(`${version}: tag object or target does not match the recorded immutable identity.`);
  if (record.gitTag.signing?.verified !== true || record.gitTag.signing?.status !== "GITHUB_VERIFIED" || record.gitTag.signing?.reason !== "valid") fail(`${version}: GitHub tag signature verification is not recorded as valid.`);
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", qualification.identity.productSourceCommit, tagTarget], { cwd: root, stdio: "ignore" });
  } catch {
    fail(`${version}: the frozen product source is not an ancestor of the signed Stable tag target.`);
  }

  if (record.githubRelease.tag !== record.gitTag.name || record.githubRelease.draft !== false || record.githubRelease.prerelease !== false) fail(`${version}: GitHub Release identity is invalid.`);
  if (!Number.isInteger(record.githubRelease.id) || !Date.parse(record.githubRelease.publishedAt)) fail(`${version}: GitHub Release ID or publication time is invalid.`);

  const suffix = new RegExp(`-${escapeRegExp(version)}$`);
  const expectedPackages = new Set(artifactManifest.artifacts.filter((artifact) => artifact.platform === "npm").map((artifact) => {
    const base = path.basename(artifact.path, ".tgz").replace(suffix, "");
    return `@scanly/${base.replace(/^scanly-/, "")}`;
  }));
  if (record.npm.length !== expectedPackages.size || record.npm.length !== 10) fail(`${version}: npm publication set must contain exactly ten packages.`);
  for (const publication of record.npm) {
    if (!expectedPackages.delete(publication.name)) fail(`${version}: unexpected or duplicate npm package '${publication.name}'.`);
    if (publication.version !== version || publication.distTag !== "latest" || publication.distTagVersion !== version || publication.registry !== "https://registry.npmjs.org/" || publication.published !== true) fail(`${publication.name}@${version}: publication identity is invalid.`);
    if (publication.provenance !== "VERIFIED_ATTESTATION_PRESENT") fail(`${publication.name}@${version}: provenance is not recorded as verified.`);
  }
  if (expectedPackages.size) fail(`${version}: missing npm publications: ${[...expectedPackages].join(", ")}.`);

  for (const artifact of artifactManifest.artifacts) {
    const absolute = path.join(root, artifact.path);
    if (!fs.existsSync(absolute)) fail(`${version}: frozen artifact is missing: ${artifact.path}.`);
    const stat = fs.statSync(absolute);
    if (stat.size !== artifact.size || sha256(absolute) !== artifact.sha256) fail(`${version}: frozen artifact bytes changed: ${artifact.path}.`);
  }

  const androidArtifact = artifactManifest.artifacts.find((artifact) => artifact.id === "android-aar");
  if (!androidArtifact || record.android.filename !== path.basename(androidArtifact.path) || record.android.sha256 !== androidArtifact.sha256 || record.android.size !== androidArtifact.size) fail(`${version}: Android GitHub Release asset does not match the Artifact Manifest.`);
  const spmArtifact = artifactManifest.artifacts.find((artifact) => artifact.id === "ios-swift-package-source");
  if (!spmArtifact || record.spm.tag !== record.gitTag.name || record.spm.artifactPackageSwiftSha256 !== spmArtifact.sha256 || !fs.existsSync(path.join(root, record.spm.packageSwiftPath))) fail(`${version}: SPM source package identity is invalid.`);

  if (record.physicalValidation.status !== "POST_RELEASE_VALIDATION_PENDING" || record.physicalValidation.issue !== 13) fail(`${version}: physical validation must remain pending under Issue #13.`);
  if (physical.issue !== 13 || physical.physicalMobileDeviceCount !== 0 || physical.physicalLongSessionCount !== 0) fail(`${version}: frozen physical evidence counts are not zero.`);
  if (JSON.stringify(record.physicalValidation).includes('"PASS"') || JSON.stringify(physical).includes('"PASS"')) fail(`${version}: physical PASS is forbidden without independent qualification evidence.`);
  if (!Date.parse(record.createdAt) || !/^[0-9a-f]{40}$/.test(record.recordedFromGitState.commit) || !/^[0-9a-f]{40}$/.test(record.recordedFromGitState.tree)) fail(`${version}: record creation or Git-state identity is invalid.`);
}

console.log(`Verified ${recordPaths.length} immutable Stable publication record(s), frozen artifacts, and pending physical boundary.`);
