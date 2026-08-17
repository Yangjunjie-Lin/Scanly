import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

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

if (manifest.schemaVersion !== "scanly-stable-manifest-1" || manifest.version !== "2.0.0") fail("Stable Manifest schema/version mismatch.");
if (!/^[a-f0-9]{40}$/.test(sourceCommit ?? "") || !/^[a-f0-9]{40}$/.test(sourceTree ?? "")) fail("Stable Manifest source identity is malformed.");
if (execFileSync("git", ["show", "-s", "--format=%T", sourceCommit], { cwd: root, encoding: "utf8" }).trim() !== sourceTree) fail("Stable Manifest source tree does not match source commit.");
try { execFileSync("git", ["merge-base", "--is-ancestor", sourceCommit, "HEAD"], { cwd: root, stdio: "ignore" }); } catch { fail("Stable source commit is not an ancestor of the qualified Stable head."); }
if (manifest.identity?.branch !== "release/sdk-v2-v2.0.0") fail("Stable Manifest branch identity is invalid.");
if (artifacts.productSourceCommit !== sourceCommit || artifacts.sourceTree !== sourceTree) fail("Artifact Manifest source identity mismatch.");
if (licenses.sourceCommit !== sourceCommit || licenses.sourceTree !== sourceTree || licenses.unknownLicenseCount !== 0 || licenses.status !== "GO") fail("Stable license gate is not GO with zero unknown licenses.");
if (!policy.featureFreeze || policy.physicalValidation?.requiredForPublication !== false || policy.physicalValidation?.status !== "POST_RELEASE_VALIDATION_PENDING") fail("Stable Release Policy is incomplete.");
if (signing.secretMaterialCommitted !== false || signing.status !== "STABLE_SIGNING_NO_GO") fail("Signing manifest is not fail-closed or reports committed secret material.");
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
for (const file of Object.values(manifest.files ?? {})) {
  if (!exists(file.path) || sha256(file.path) !== file.sha256 || fs.statSync(path.join(root, file.path)).size !== file.size) fail(`Stable Manifest file identity mismatch: ${file.path}`);
}
if (!exists("release/stable/checksums.sha256") || !exists("release/stable/v2.0.0-manifest.json.sha256")) fail("Stable checksum files are missing.");
const sidecar = fs.readFileSync(path.join(stableRoot, "v2.0.0-manifest.json.sha256"), "utf8").trim().split(/\s+/)[0];
if (sidecar !== sha256("release/stable/v2.0.0-manifest.json")) fail("Stable Manifest detached SHA-256 sidecar mismatch.");

const requiredGateStatuses = ["software", "manifestIntegrity", "apiAbi", "security", "sbom", "licenses", "artifacts", "reproducibility", "signing", "publicationCredentials", "publication"];
if (requireGo) {
  for (const field of requiredGateStatuses) if (manifest[field] !== "GO") fail(`Stable promotion blocked: ${field}=${manifest[field]}.`);
  if (manifest.stable !== "V2_STABLE_RELEASE_GO") fail("Stable promotion requires V2_STABLE_RELEASE_GO.");
}
console.log(`STABLE_MANIFEST_INTEGRITY_GO source=${sourceCommit} tree=${sourceTree} physical=${physical.status} stable=${manifest.stable}`);
