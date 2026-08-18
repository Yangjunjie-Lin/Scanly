import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { canonicalZipSha256 } from "./release-artifact-canonicalization.mjs";

const root = path.resolve(import.meta.dirname, "..");
const stableRoot = path.join(root, "release", "stable");
const requireGo = process.argv.includes("--require-go");
const fail = (message) => { throw new Error(message); };
const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
const sha256 = (relative) => crypto.createHash("sha256").update(fs.readFileSync(path.join(root, relative))).digest("hex");
const exists = (relative) => fs.existsSync(path.join(root, relative));
const manifest = readJson("release/stable/v2.0.0-manifest.json");
const sourceCommit = manifest.identity?.productSourceCommit;
const sourceTree = manifest.identity?.sourceTree;
const physical = readJson("release/stable/physical-validation-status.json");
const policy = readJson("release/stable/release-policy.json");
const signing = readJson("release/stable/signing-manifest.json");
const artifacts = readJson("release/stable/artifact-manifest.json");
const licenses = readJson("release/stable/license-inventory.json");
const deployment = readJson("release/stable/deployment.json");
const reproducibility = readJson("release/stable/reproducibility.json");
const publicationCredentials = readJson("release/stable/publication-credentials.json");

if (manifest.schemaVersion !== "scanly-stable-manifest-1" || manifest.version !== "2.0.0") fail("Stable Manifest schema/version mismatch.");
if (!/^[a-f0-9]{40}$/.test(sourceCommit ?? "") || !/^[a-f0-9]{40}$/.test(sourceTree ?? "")) fail("Stable Manifest source identity is malformed.");
if (execFileSync("git", ["show", "-s", "--format=%T", sourceCommit], { cwd: root, encoding: "utf8" }).trim() !== sourceTree) fail("Stable Manifest source tree does not match source commit.");
try { execFileSync("git", ["merge-base", "--is-ancestor", sourceCommit, "HEAD"], { cwd: root, stdio: "ignore" }); } catch { fail("Stable source commit is not an ancestor of the qualified Stable head."); }
if (manifest.identity?.branch !== "release/sdk-v2-v2.0.0") fail("Stable Manifest branch identity is invalid.");
if (artifacts.productSourceCommit !== sourceCommit || artifacts.sourceTree !== sourceTree) fail("Artifact Manifest source identity mismatch.");
if (licenses.sourceCommit !== sourceCommit || licenses.sourceTree !== sourceTree || licenses.unknownLicenseCount !== 0 || licenses.status !== "GO") fail("Stable license gate is not GO with zero unknown licenses.");
if (!policy.featureFreeze || policy.physicalValidation?.requiredForPublication !== false || policy.physicalValidation?.status !== "POST_RELEASE_VALIDATION_PENDING") fail("Stable Release Policy is incomplete.");
if (signing.secretMaterialCommitted !== false || !["STABLE_SIGNING_GO", "STABLE_SIGNING_NO_GO"].includes(signing.status)) fail("Signing manifest is invalid or reports committed secret material.");
if ((manifest.signing === "GO") !== (signing.status === "STABLE_SIGNING_GO")) fail("Stable signing gate and signing manifest disagree.");
if (publicationCredentials.secretMaterialCommitted !== false || !["GO", "NO_GO"].includes(publicationCredentials.requiredCredentialsStatus)) fail("Publication credential inventory is invalid or reports committed secret material.");
if (publicationCredentials.requiredCredentialsStatus !== manifest.publicationCredentials) fail("Publication credential inventory and Stable gate disagree.");
if (signing.status === "STABLE_SIGNING_GO") {
  const expectedSigningChannels = {
    gitTagSigning: "GIT_TAG_SIGNING_GO",
    githubReleaseSigning: "GITHUB_RELEASE_SIGNING_GO",
    npmPublication: "NPM_PUBLICATION_GO",
    androidArtifactSigning: "ANDROID_ARTIFACT_SIGNING_GO",
    iosSpmRelease: "IOS_SPM_RELEASE_GO",
  };
  for (const [channel, status] of Object.entries(expectedSigningChannels)) {
    if (signing.channels?.[channel]?.status !== status) fail(`Stable signing channel ${channel} is not GO.`);
  }
  const tagIdentity = signing.channels.gitTagSigning;
  if (tagIdentity.scheme !== "SSH_ED25519" || !Number.isInteger(tagIdentity.githubSigningKeyId)
    || !/^SHA256:/.test(tagIdentity.publicKeyFingerprint ?? "")
    || tagIdentity.localSmokeTest?.status !== "PASS"
    || tagIdentity.localSmokeTest?.sshSignatureBlockPresent !== true
    || tagIdentity.localSmokeTest?.temporaryTagDeleted !== true) {
    fail("Production SSH tag signing evidence is incomplete.");
  }
}
if (publicationCredentials.requiredCredentialsStatus === "GO") {
  for (const channel of ["githubApi", "productionTagSigningIdentity", "npmRegistry", "npmProvenance", "androidAarGitHubRelease"]) {
    if (publicationCredentials.channels?.[channel]?.status !== "AVAILABLE") fail(`Required publication credential ${channel} is unavailable.`);
  }
  if (publicationCredentials.blocker) fail("Publication credential GO cannot retain a blocker.");
  const npmEvidence = publicationCredentials.channels.npmRegistry.evidence;
  if (npmEvidence?.account !== "yangjunjielin" || npmEvidence?.organization !== "scanly"
    || npmEvidence?.organizationRole !== "owner" || npmEvidence?.packageDryRunStatus !== "PASS"
    || npmEvidence?.packageDryRunCount !== 10 || npmEvidence?.githubSecretName !== "NPM_TOKEN"
    || npmEvidence?.secretValueRecorded !== false) fail("npm publication credential evidence is incomplete.");
}
const stableNpmWorkflowPath = ".github/workflows/stable-npm-publish.yml";
if (!exists(stableNpmWorkflowPath)) fail("Stable npm provenance publication workflow is missing.");
const stableNpmWorkflow = fs.readFileSync(path.join(root, stableNpmWorkflowPath), "utf8");
for (const marker of ["id-token: write", "secrets.NPM_TOKEN", "provenance: true", "libnpmpublish", "npm_internal_modules", "Waiting for Registry propagation", "git+https://github.com/Yangjunjie-Lin/Scanly.git", "v2.0.0", "stable:manifest:verify -- --require-go"]) {
  if (!stableNpmWorkflow.includes(marker)) fail(`Stable npm provenance workflow is missing '${marker}'.`);
}
if ((manifest.reproducibility === "GO") !== (reproducibility.status === "REPRODUCIBILITY_GO")) fail("Stable reproducibility gate and report disagree.");
if (deployment.status !== "GO" || deployment.sourceCommit !== sourceCommit || deployment.sourceTree !== sourceTree || deployment.gitCommitSha !== sourceCommit || deployment.readyState !== "READY" || deployment.target !== "production" || !/^https:\/\//.test(deployment.url ?? "")) fail("Stable production deployment provenance is incomplete or source-mismatched.");

const pending = "POST_RELEASE_VALIDATION_PENDING";
if (physical.version !== "2.0.0" || physical.issue !== 13 || physical.requiredForPublication !== false || physical.status !== "POST_RELEASE_VALIDATION_REQUIRED") fail("Physical validation status policy is invalid.");
if (Object.values(physical.matrix ?? {}).some((value) => value !== pending) || physical.fullDeviceMatrix !== pending) fail("Physical validation contains a non-pending status.");
for (const field of ["physicalMobileDeviceCount", "iosSafariSessionCount", "androidChromeSessionCount", "physicalLongSessionCount", "nativeIosPhysicalSessionCount", "nativeAndroidPhysicalSessionCount"]) {
  if (physical[field] !== 0) fail(`Physical count ${field} must remain zero until evidence exists.`);
}
if (JSON.stringify(physical).includes('"PASS"')) fail("Physical validation status must never claim PASS.");

for (const artifact of artifacts.artifacts ?? []) {
  if (artifact.sourceCommit !== sourceCommit || artifact.sourceTree !== sourceTree) fail(`${artifact.id}: artifact source identity mismatch.`);
  if (artifact.status === "PASS" || artifact.status === "PASS_SOURCE_PACKAGE") {
    if (!artifact.sha256 || !Number.isInteger(artifact.size) || !exists(artifact.path)) fail(`${artifact.id}: passing artifact is missing bytes or identity.`);
    if (sha256(artifact.path) !== artifact.sha256 || fs.statSync(path.join(root, artifact.path)).size !== artifact.size) fail(`${artifact.id}: artifact hash or size mismatch.`);
  }
}
const androidArtifact = (artifacts.artifacts ?? []).find((artifact) => artifact.id === "android-aar");
if (androidArtifact?.status === "PASS") {
  const androidEvidence = readJson("release/stable/android-build-evidence.json");
  if (androidEvidence.sourceCommit !== sourceCommit || androidEvidence.sourceTree !== sourceTree || androidEvidence.status !== "GO"
    || androidEvidence.normalizedBuildAEqualsBuildB !== true || androidEvidence.metadataCleanBuilds?.status !== "GO"
    || androidEvidence.selectedArtifact?.sha256 !== androidArtifact.sha256
    || androidEvidence.selectedArtifact?.canonicalContentSha256 !== androidArtifact.canonicalContentSha256
    || canonicalZipSha256(path.join(root, androidArtifact.path)) !== androidArtifact.canonicalContentSha256) {
    fail("Stable Android artifact or reproducibility evidence is invalid.");
  }
}
for (const file of Object.values(manifest.files ?? {})) {
  if (!exists(file.path) || sha256(file.path) !== file.sha256 || fs.statSync(path.join(root, file.path)).size !== file.size) fail(`Stable Manifest file identity mismatch: ${file.path}`);
}
if (!exists("release/stable/checksums.sha256") || !exists("release/stable/v2.0.0-manifest.json.sha256")) fail("Stable checksum files are missing.");
const checksumLines = fs.readFileSync(path.join(stableRoot, "checksums.sha256"), "utf8").trim().split(/\r?\n/);
const checksummedPaths = new Set();
for (const line of checksumLines) {
  const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
  if (!match || match[2].includes("\\") || match[2].startsWith("/") || match[2].split("/").some((segment) => segment === "" || segment === "." || segment === "..")) fail("Stable checksum manifest contains an invalid entry.");
  const relative = `release/stable/${match[2]}`;
  if (!exists(relative) || sha256(relative) !== match[1] || checksummedPaths.has(relative)) fail(`Stable checksum mismatch: ${relative}`);
  checksummedPaths.add(relative);
}
for (const artifact of artifacts.artifacts ?? []) if ((artifact.status === "PASS" || artifact.status === "PASS_SOURCE_PACKAGE") && !checksummedPaths.has(artifact.path)) fail(`${artifact.id}: passing artifact is absent from checksums.sha256.`);
const sidecar = fs.readFileSync(path.join(stableRoot, "v2.0.0-manifest.json.sha256"), "utf8").trim().split(/\s+/)[0];
if (sidecar !== sha256("release/stable/v2.0.0-manifest.json")) fail("Stable Manifest detached SHA-256 sidecar mismatch.");

const requiredGateStatuses = ["software", "manifestIntegrity", "apiAbi", "security", "sbom", "licenses", "artifacts", "reproducibility", "signing", "publicationCredentials", "publication"];
if (requireGo) {
  for (const field of requiredGateStatuses) if (manifest[field] !== "GO") fail(`Stable promotion blocked: ${field}=${manifest[field]}.`);
  if (manifest.stable !== "V2_STABLE_RELEASE_GO") fail("Stable promotion requires V2_STABLE_RELEASE_GO.");
}
console.log(`STABLE_MANIFEST_INTEGRITY_GO source=${sourceCommit} tree=${sourceTree} physical=${physical.status} stable=${manifest.stable}`);
