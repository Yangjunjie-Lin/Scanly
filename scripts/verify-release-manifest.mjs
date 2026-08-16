import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { TextDecoder } from "node:util";
import { canonicalNpmTarballSha256, NPM_CANONICALIZATION_POLICY } from "./release-artifact-canonicalization.mjs";

const root = path.resolve(import.meta.dirname, "..");
const canonicalManifestPath = path.resolve(root, "release/rc2/rc2-candidate-manifest.v2.json");
const canonicalSidecarPath = `${canonicalManifestPath}.sha256`;
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const equals = args.find((value) => value.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};
const has = (name) => args.includes(name);
const mode = option("--mode", "integrity");
const manifestArgument = option("--manifest", "release/rc2/rc2-candidate-manifest.v2.json");
const sidecarArgument = option("--sidecar", `${manifestArgument}.sha256`);
const requireExactCandidateHead = has("--require-exact-candidate-head");
const requireCandidateTag = has("--require-candidate-tag") || requireExactCandidateHead || mode === "stable";
const knownLegacyManifestPaths = new Set([
  path.resolve(root, "release/rc1/rc1-candidate-manifest.json"),
  path.resolve(root, "release/rc2/rc2-candidate-manifest.json"),
]);
const immutableCandidateTagLocks = new Map([
  ["v2-rc2-r2", { tagObject: "1ff2c77b53ef864d09bdae89ced0d67fd5bea2c2", target: "5d125e141b3133ff887fbc6c79132186e567163a" }],
  ["v2-rc2-r3", { tagObject: "dfa7835b7393e1ac9857368f958a922e32d7928d", target: "7077ddfa65fda8be81e6be86f5e7619815f5df99" }],
  ["v2-rc2-r4", { tagObject: "66143a81576faf3b54bbe35b934315d38f17659d", target: "5574ef54c4c7870df28748cfebae4ff2d3994de5" }],
]);

const fail = (message) => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };
assert(mode === "integrity" || mode === "stable", `Unsupported mode '${mode}'.`);
assert(!(mode === "stable" && requireExactCandidateHead), "Stable mode cannot require an exact Candidate Evidence Head; it verifies Candidate ancestry instead.");
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const isSha256 = (value) => typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
const isCommit = (value) => typeof value === "string" && /^[0-9a-f]{40}$/.test(value);
const posix = (value) => value.replaceAll("\\", "/");
const resolveInput = (value) => path.isAbsolute(value) ? path.resolve(value) : path.resolve(root, value);
const resolveRepositoryPath = (relative, label) => {
  assert(typeof relative === "string" && relative.length > 0 && posix(relative) === relative, `${label}: path must be a non-empty repository-relative POSIX path.`);
  const absolute = path.resolve(root, relative);
  assert(absolute === root || absolute.startsWith(`${root}${path.sep}`), `${label}: path escapes the repository.`);
  return absolute;
};
const strictUtf8 = (bytes, label) => {
  assert(!bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])), `${label}: UTF-8 BOM is forbidden.`);
  assert(!bytes.includes(0x0d), `${label}: CR/CRLF is forbidden; LF is required.`);
  assert(bytes.at(-1) === 0x0a, `${label}: file must end with LF.`);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail(`${label}: invalid UTF-8.`);
  }
};
const parseJson = (bytes, label) => {
  try {
    return JSON.parse(strictUtf8(bytes, label));
  } catch (error) {
    if (error instanceof SyntaxError) fail(`${label}: invalid JSON (${error.message}).`);
    throw error;
  }
};
const parseLegacyJson = (bytes, label) => {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) {
    fail(`${label}: invalid legacy UTF-8/JSON (${error instanceof Error ? error.message : String(error)}).`);
  }
};
const git = (...gitArgs) => execFileSync("git", gitArgs, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const gitSucceeds = (...gitArgs) => spawnSync("git", gitArgs, { cwd: root, stdio: "ignore" }).status === 0;
const commitExists = (commit) => isCommit(commit) && gitSucceeds("cat-file", "-e", `${commit}^{commit}`);
const fileIdentity = (identity, label) => {
  assert(identity && typeof identity === "object", `${label}: missing file identity.`);
  assert(isSha256(identity.sha256), `${label}: invalid SHA-256.`);
  const absolute = resolveRepositoryPath(identity.path, label);
  assert(fs.existsSync(absolute) && fs.statSync(absolute).isFile(), `${label}: file does not exist.`);
  const bytes = fs.readFileSync(absolute);
  assert(sha256(bytes) === identity.sha256, `${label}: SHA-256 mismatch.`);
  if (identity.size !== undefined) assert(bytes.length === identity.size, `${label}: byte size mismatch.`);
  return { absolute, bytes };
};
const classification = (manifest, manifestPath) => {
  if (manifest?.schemaVersion === "rc2-final-candidate-manifest-2") return undefined;
  if (manifest?.identity && Object.prototype.hasOwnProperty.call(manifest.identity, "manifestSha256")) {
    return `LEGACY_MANIFEST_HASH_UNVERIFIED ${posix(path.relative(root, manifestPath))} schema=${String(manifest.schemaVersion)}`;
  }
  return `LEGACY_SCHEMA ${posix(path.relative(root, manifestPath))} schema=${String(manifest?.schemaVersion ?? "UNKNOWN")}`;
};

const manifestPath = resolveInput(manifestArgument);
assert(fs.existsSync(manifestPath), `Manifest does not exist: ${manifestArgument}`);
const manifestBytes = fs.readFileSync(manifestPath);
const tentativeManifest = parseLegacyJson(manifestBytes, "release manifest");
const manifest = tentativeManifest.schemaVersion === "rc2-final-candidate-manifest-2" ? parseJson(manifestBytes, "release manifest") : tentativeManifest;
const legacyClassification = classification(manifest, manifestPath);
if (legacyClassification) {
  assert(knownLegacyManifestPaths.has(manifestPath), `Unsupported Manifest schema '${String(manifest.schemaVersion)}' outside the two anchored legacy paths.`);
  assert(mode !== "stable", "Stable mode requires manifest schema v2 with a detached digest.");
  console.log(legacyClassification);
  process.exit(0);
}

const sidecarPath = resolveInput(sidecarArgument);
assert(fs.existsSync(sidecarPath), `Detached digest sidecar does not exist: ${sidecarArgument}`);
const sidecarBytes = fs.readFileSync(sidecarPath);
const sidecarText = strictUtf8(sidecarBytes, "manifest digest sidecar");
const sidecarMatch = /^([0-9a-f]{64})  ([^\n]+)\n$/.exec(sidecarText);
assert(sidecarMatch, "Manifest digest sidecar must use '<lowercase sha256>  <filename>\\n>'.");
assert(sidecarMatch[2] === path.basename(manifestPath), "Manifest digest sidecar filename does not match the manifest.");
const actualDigest = sha256(manifestBytes);
assert(
  crypto.timingSafeEqual(Buffer.from(actualDigest, "hex"), Buffer.from(sidecarMatch[1], "hex")),
  `Manifest raw SHA-256 mismatch: expected ${sidecarMatch[1]}, got ${actualDigest}.`,
);

const expectedDigestPolicy = {
  digestAlgorithm: "SHA-256",
  digestScope: "RAW_FILE_BYTES",
  encoding: "UTF-8",
  lineEnding: "LF",
  bom: false,
  digestStorage: "DETACHED_SIDECAR",
  sidecar: "release/rc2/rc2-candidate-manifest.v2.json.sha256",
};
assert(JSON.stringify(manifest.manifestDigest) === JSON.stringify(expectedDigestPolicy), "Manifest digest policy is not the exact schema v2 policy.");
assert(!Object.prototype.hasOwnProperty.call(manifest.identity ?? {}, "manifestSha256"), "Schema v2 must not embed manifestSha256.");

const identity = manifest.identity ?? {};
assert(identity.version === "2.0.0-rc.2", "Manifest SDK version is not 2.0.0-rc.2.");
assert(commitExists(identity.productSourceCommit), "Product Source commit is missing or invalid.");
assert(git("show", "-s", "--format=%T", identity.productSourceCommit) === identity.sourceTree, "Product Source Tree does not match Product Source commit.");
assert(commitExists(identity.qualificationBaseCommit), "Qualification base commit is missing or invalid.");
assert(gitSucceeds("merge-base", "--is-ancestor", identity.productSourceCommit, identity.qualificationBaseCommit), "Qualification base is not descended from Product Source.");
assert(gitSucceeds("merge-base", "--is-ancestor", identity.qualificationBaseCommit, "HEAD"), "Current Evidence Head is not descended from the declared qualification base.");
assert(identity.candidateBinding === "GIT_ANNOTATED_TAG_TARGET", "Candidate binding policy must use an annotated Git tag target.");
const candidateNumber = /^v2-rc2-r([1-9][0-9]*)$/.exec(identity.candidateTag ?? "");
assert(candidateNumber && Number(candidateNumber[1]) >= 2, "Candidate tag must be v2-rc2-r2 or later.");
for (const [tag, expected] of immutableCandidateTagLocks) {
  const ref = `refs/tags/${tag}`;
  assert(gitSucceeds("show-ref", "--verify", "--quiet", ref), `Immutable Candidate tag '${tag}' is missing.`);
  assert(git("cat-file", "-t", ref) === "tag", `Immutable Candidate tag '${tag}' is no longer annotated.`);
  assert(git("rev-parse", ref) === expected.tagObject, `Immutable Candidate tag '${tag}' object changed.`);
  assert(git("rev-parse", `${ref}^{}`) === expected.target, `Immutable Candidate tag '${tag}' target moved.`);
}
for (const productPath of ["apps", "engines", "native", "packages"]) {
  assert(gitSucceeds("diff", "--quiet", identity.productSourceCommit, "HEAD", "--", productPath), `Product Source boundary changed under ${productPath}.`);
  assert(gitSucceeds("diff", "--quiet", "HEAD", "--", productPath) && git("status", "--porcelain", "--", productPath) === "", `Working tree contains Product Source changes under ${productPath}.`);
}
const changedPaths = git("diff", "--name-only", identity.productSourceCommit, "HEAD").split(/\r?\n/).filter(Boolean).map(posix);
const allowedEvidencePath = (relative) => relative === ".gitattributes"
  || relative === "package.json"
  || relative === "api-snapshots/public-api.json"
  || [".github/workflows/", "device-evidence/", "device-lab/", "docs/releases/", "release/", "scripts/", "tests/"].some((prefix) => relative.startsWith(prefix));
assert(changedPaths.every(allowedEvidencePath), `Product Source boundary contains non-evidence paths: ${changedPaths.filter((relative) => !allowedEvidencePath(relative)).join(", ")}.`);
const sourcePackage = JSON.parse(git("show", `${identity.productSourceCommit}:package.json`));
const evidencePackage = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
delete evidencePackage.scripts?.["rc:manifest:digest"];
delete evidencePackage.scripts?.["rc:manifest:verify"];
delete evidencePackage.scripts?.["rc:artifacts:verify-canonical"];
assert(JSON.stringify(evidencePackage) === JSON.stringify(sourcePackage), "package.json changed beyond the three Release Integrity tooling commands.");
const historicalReleaseChanges = git("diff", "--name-status", "v2-rc2-r1", "--", "release/rc1", "release/rc2").split(/\r?\n/).filter(Boolean);
assert(historicalReleaseChanges.every((entry) => entry.startsWith("A\t")), `Historical RC1/RC2 release evidence was modified instead of append-only additions: ${historicalReleaseChanges.join(", ")}.`);

let candidateBinding = "CANDIDATE_TAG_NOT_PRESENT";
const candidateRef = `refs/tags/${identity.candidateTag}`;
if (gitSucceeds("show-ref", "--verify", "--quiet", candidateRef)) {
  const canonicalCandidateInput = manifestPath === canonicalManifestPath && sidecarPath === canonicalSidecarPath;
  if (!canonicalCandidateInput) {
    assert(!requireCandidateTag, "Candidate tag binding requires the canonical RC2 Manifest and detached sidecar paths.");
    candidateBinding = "CANDIDATE_TAG_NOT_APPLICABLE";
  } else {
    assert(git("cat-file", "-t", candidateRef) === "tag", "Candidate tag must be annotated.");
    const candidateTarget = git("rev-parse", `${candidateRef}^{}`);
    const evidenceHead = git("rev-parse", "HEAD");
    if (mode === "stable") {
      assert(gitSucceeds("merge-base", "--is-ancestor", candidateTarget, "HEAD"), "Qualified Candidate tag is not an ancestor of the Stable Release Head.");
    } else if (requireExactCandidateHead) {
      assert(candidateTarget === evidenceHead, "Candidate tag does not target the exact Evidence Head.");
    } else {
      assert(gitSucceeds("merge-base", "--is-ancestor", candidateTarget, "HEAD"), "Candidate tag is neither the exact Evidence Head nor an ancestor integrated into it.");
    }
    assert(gitSucceeds("diff", "--quiet", "HEAD", "--", "release/rc2") && git("status", "--porcelain", "--", "release/rc2") === "", "Candidate-bound release/rc2 evidence has uncommitted or untracked changes.");
    if (candidateTarget !== evidenceHead) {
      assert(immutableCandidateTagLocks.has(identity.candidateTag), `Integrated Candidate tag '${identity.candidateTag}' has no immutable object/target lock.`);
      assert(gitSucceeds("diff", "--quiet", candidateTarget, "HEAD", "--", "release/rc2"), "Candidate-bound release/rc2 evidence changed after the immutable Candidate tag.");
    }
    candidateBinding = candidateTarget === evidenceHead ? "CANDIDATE_TAG_BOUND" : "CANDIDATE_TAG_INTEGRATED";
  }
} else {
  assert(!requireCandidateTag, `Required candidate tag '${identity.candidateTag}' is not present.`);
}

const artifactManifestIdentity = manifest.artifacts?.manifest;
assert(manifest.software?.status === "RC2_SOFTWARE_GO" && manifest.software.featureFreeze === true && manifest.software.productSourceUnchanged === true && manifest.software.apiAbiFreeze === "GO", "Software/Product Source freeze declaration is incomplete.");
assert(manifest.artifacts?.status === "PASS_RC2_CI_REBUILD", "Artifact status is not the frozen RC2 CI rebuild PASS state.");
const artifactManifestFile = fileIdentity(artifactManifestIdentity, "artifact manifest");
const artifactManifest = parseJson(artifactManifestFile.bytes, "artifact manifest");
assert(artifactManifest.schemaVersion === "rc2-artifact-manifest-2", "Artifact Manifest schema mismatch.");
assert(artifactManifest.version === identity.version, "Artifact Manifest version mismatch.");
assert(artifactManifest.productSourceCommit === identity.productSourceCommit && artifactManifest.sourceTree === identity.sourceTree, "Artifact Manifest source identity mismatch.");
assert(artifactManifest.rawArtifactDigest?.algorithm === "SHA-256" && artifactManifest.rawArtifactDigest?.scope === "EXACT_FILE_BYTES", "Artifact raw digest policy mismatch.");
assert(JSON.stringify(artifactManifest.npmCanonicalization) === JSON.stringify(NPM_CANONICALIZATION_POLICY), "Artifact npm canonicalization policy mismatch.");
assert(artifactManifest.legacyManifest?.classification === "LEGACY_BUILD_METADATA_PLATFORM_SPECIFIC", "Historical Artifact Manifest classification is missing.");
fileIdentity(artifactManifest.legacyManifest, "historical artifact manifest");
assert(Array.isArray(artifactManifest.artifacts) && artifactManifest.artifacts.length > 0, "Artifact Manifest has no artifacts.");
const artifactEntries = new Map();
for (const entry of artifactManifest.artifacts) {
  assert(typeof entry.artifact === "string" && !artifactEntries.has(entry.artifact), `Artifact Manifest contains an invalid or duplicate path '${String(entry.artifact)}'.`);
  const relative = `release/rc2/artifacts/${entry.artifact}`;
  const verified = fileIdentity({ path: relative, sha256: entry.rawSha256, size: entry.size }, `artifact ${entry.artifact}`);
  assert(verified.bytes.length > 0, `Artifact '${entry.artifact}' is empty.`);
  if (entry.platform === "npm") {
    assert(isSha256(entry.canonicalContentSha256), `Artifact '${entry.artifact}' is missing its canonical npm content digest.`);
    assert(canonicalNpmTarballSha256(verified.absolute) === entry.canonicalContentSha256, `Artifact '${entry.artifact}' canonical npm content digest mismatch.`);
  } else {
    assert(entry.canonicalContentSha256 === undefined, `Non-npm artifact '${entry.artifact}' must not claim npm canonicalization.`);
  }
  artifactEntries.set(entry.artifact, entry);
}
const requiredArtifactIds = new Map([
  ["ios-source-package", "ios/Package.swift"],
  ["android-aar", "android/scanly-sdk-release.aar"],
  ["native-core-header", "native/scanly-core.h"],
]);
assert(Array.isArray(manifest.artifacts.required) && manifest.artifacts.required.length === requiredArtifactIds.size, "Required artifact identity set is incomplete.");
const seenRequiredArtifactIds = new Set();
for (const required of manifest.artifacts.required) {
  const artifactPath = requiredArtifactIds.get(required.id);
  assert(artifactPath, `Unknown required artifact id '${String(required.id)}'.`);
  assert(!seenRequiredArtifactIds.has(required.id), `Duplicate required artifact id '${required.id}'.`);
  seenRequiredArtifactIds.add(required.id);
  assert(required.path === `release/rc2/artifacts/${artifactPath}`, `Required artifact '${required.id}' path mismatch.`);
  const entry = artifactEntries.get(artifactPath);
  assert(entry && entry.rawSha256 === required.sha256 && entry.size === required.size, `Required artifact '${required.id}' does not match Artifact Manifest.`);
  fileIdentity(required, `required artifact ${required.id}`);
}
assert([...requiredArtifactIds.keys()].every((id) => seenRequiredArtifactIds.has(id)), "Required artifact identity set is incomplete.");

const sbomFile = fileIdentity(manifest.sbom, "SBOM");
const sbom = parseJson(sbomFile.bytes, "SBOM");
assert(manifest.sbom.sourceCommit === identity.productSourceCommit, "Manifest SBOM Product Source identity mismatch.");
assert(sbom.bomFormat === "CycloneDX" && sbom.specVersion === "1.5", "SBOM format identity mismatch.");
assert(sbom.metadata?.component?.name === "scanly" && sbom.metadata?.component?.version === identity.version, "SBOM component identity mismatch.");
assert(sbom.metadata?.properties?.some((entry) => entry.name === "scanly:sourceCommit" && entry.value === identity.productSourceCommit), "SBOM Product Source identity mismatch.");

const licenseFile = fileIdentity(manifest.licenses, "license inventory");
const licenseInventory = parseJson(licenseFile.bytes, "license inventory");
assert(licenseInventory.schemaVersion === "rc2-license-inventory-1" && licenseInventory.version === identity.version, "License inventory identity mismatch.");
assert(Array.isArray(licenseInventory.components) && licenseInventory.components.length > 0, "License inventory is empty.");

const reproducibilityFile = fileIdentity(manifest.reproducibility, "reproducibility report");
const reproducibility = parseJson(reproducibilityFile.bytes, "reproducibility report");
assert(reproducibility.schemaVersion === "rc2-reproducibility-1" && reproducibility.version === identity.version, "Reproducibility report identity mismatch.");
assert(reproducibility.pass === true && reproducibility.normalizedComparison === "MATCH", "Reproducibility report is not passing.");

const matrixFile = fileIdentity(manifest.physicalEvidence?.matrix, "physical validation matrix");
const matrix = parseJson(matrixFile.bytes, "physical validation matrix");
assert(matrix.schemaVersion === "rc2-unified-physical-validation-matrix-1", "Physical Matrix schema mismatch.");
assert(matrix.issue === 13, "Physical Matrix must remain bound to Issue #13.");
assert(matrix.sourceIdentity?.sourceCommit === identity.productSourceCommit && matrix.sourceIdentity?.sourceTree === identity.sourceTree && matrix.sourceIdentity?.sdkVersion === identity.version, "Physical Matrix source identity mismatch.");
assert(matrix.policy?.physicalEvidenceRequired === true && matrix.policy.falseConfirmedScans === 0 && matrix.policy.stalePublicEvents === 0 && matrix.policy.rawPrivateVideoCommitted === false && matrix.policy.dpm === "EXPERIMENTAL", "Physical Matrix policy is not fail-closed.");
resolveRepositoryPath(manifest.physicalEvidence.evidenceDirectory, "Physical Evidence directory");
const requiredRows = [
  "Physical iPhone generation A",
  "Physical iPhone generation B",
  "Android lower-end",
  "Android mid-range",
  "Android flagship",
  "Desktop real webcam",
  "Physical iPhone/iPad",
  "Physical Android",
];
const nonPlaceholder = (value) => typeof value === "string" && value.trim().length > 0 && !/^(NONE|NOT_(?:TESTED|AVAILABLE)|UNKNOWN|PLACEHOLDER)$/i.test(value.trim());
const nonNegativeInteger = (value) => Number.isInteger(value) && value >= 0;
const requiredWebScenarioIds = ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8", "P9", "P10", "P11", "P12", "N1"];
const requiredFinalResourceKeys = ["activeDecode", "pendingFrames", "activeTasks", "liveNativeResults", "WASMInputAllocation", "controlledMemory"];
const qualifyingPhysicalEvidence = [];
const verifyLongRun = (longRun, label) => {
  assert(longRun && typeof longRun === "object", `${label}: soak metrics are missing.`);
  const started = Date.parse(longRun.startedAt);
  const ended = Date.parse(longRun.endedAt);
  assert(Number.isFinite(started) && Number.isFinite(ended) && ended > started, `${label}: soak start/end timestamps are invalid.`);
  assert(nonNegativeInteger(longRun.durationMs) && Math.abs((ended - started) - longRun.durationMs) <= 1_000 && longRun.durationMs >= 1_800_000, `${label}: qualifying soak is shorter than 30 minutes or has inconsistent timestamps.`);
  const metrics = longRun.metrics ?? {};
  for (const field of ["capturedFrames", "admittedFrames", "droppedFrames", "decodeAttempts", "confirmed", "falseConfirmed", "staleEvents", "identitySwitchCount", "falseTrackCount", "cameraTrackEndings", "cameraRestarts", "sessionRestarts", "workerRestarts", "errors"]) {
    assert(nonNegativeInteger(metrics[field]), `${label}: soak metric '${field}' is missing or invalid.`);
  }
  assert(metrics.capturedFrames > 0 && metrics.admittedFrames > 0 && metrics.decodeAttempts > 0, `${label}: soak does not prove active camera/decode work.`);
  assert(metrics.admittedFrames <= metrics.capturedFrames && metrics.droppedFrames <= metrics.capturedFrames, `${label}: soak frame counters are inconsistent.`);
  assert(metrics.falseConfirmed === 0 && metrics.staleEvents === 0 && metrics.falseTrackCount === 0 && metrics.errors === 0, `${label}: soak correctness/error gate failed.`);
  assert(longRun.finalResources && Object.keys(longRun.finalResources).sort().join(",") === [...requiredFinalResourceKeys].sort().join(","), `${label}: final resource counter set is incomplete.`);
  assert(requiredFinalResourceKeys.every((field) => longRun.finalResources[field] === 0), `${label}: final controlled resources are not all zero.`);
  assert(Array.isArray(longRun.windows) && longRun.windows.length === 3, `${label}: first/middle/last performance windows are missing.`);
  assert(longRun.windows.map((entry) => entry.label).join(",") === "first-5-min,middle-5-min,last-5-min", `${label}: performance window order is invalid.`);
  for (const window of longRun.windows) {
    for (const field of ["decodeP50", "decodeP95", "effectiveFps", "frameDropRate"]) {
      assert(typeof window[field] === "number" && Number.isFinite(window[field]) && window[field] >= 0, `${label}/${window.label}: performance metric '${field}' is missing.`);
    }
    assert(window.decodeP95 >= window.decodeP50, `${label}/${window.label}: P95 is lower than P50.`);
  }
  assert(Array.isArray(longRun.activities) && longRun.activities.length >= 8, `${label}: active soak coverage is incomplete.`);
  const midpoint = started + longRun.durationMs / 2;
  for (const activity of ["basic", "multi-code", "moving", "negative"]) {
    const observations = longRun.activities.filter((entry) => entry.type === activity).map((entry) => Date.parse(entry.observedAt));
    assert(observations.some((value) => Number.isFinite(value) && value >= started && value < midpoint), `${label}: '${activity}' is missing from the first half.`);
    assert(observations.some((value) => Number.isFinite(value) && value >= midpoint && value <= ended), `${label}: '${activity}' is missing from the second half.`);
  }
  return longRun;
};
assert(Array.isArray(matrix.rows) && matrix.rows.length === requiredRows.length, "Physical Matrix must contain exactly eight release-required rows.");
assert(new Set(matrix.rows.map((row) => row.device)).size === requiredRows.length && requiredRows.every((device) => matrix.rows.some((row) => row.device === device)), "Physical Matrix required device rows are incomplete or duplicated.");
for (const row of matrix.rows) {
  assert(["PASS", "FAIL", "NOT_TESTED"].includes(row.status), `${row.device}: invalid release row status.`);
  assert(!/MOSTLY_PASS|SHOULD_WORK|EXPECTED_PASS|DEFERRED|UNKNOWN/.test(JSON.stringify(row)), `${row.device}: vague or deferred status is forbidden.`);
  if (row.status === "PASS") {
    assert(!JSON.stringify(row).includes("NOT_TESTED"), `${row.device}: PASS row retains NOT_TESTED fields.`);
    for (const field of ["tracking", "batch", "industrial", "soak"]) {
      assert(["PASS", "NOT_APPLICABLE"].includes(row[field]), `${row.device}: PASS row has incomplete '${field}' qualification.`);
    }
    if (row.surface === "web" && row.device !== "Desktop real webcam") {
      assert(["tracking", "batch", "industrial", "soak"].every((field) => row[field] === "PASS"), `${row.device}: release-required mobile Web row must PASS tracking, batch, industrial, and soak.`);
    }
    assert(row.evidenceId && row.evidenceId !== "NONE", `${row.device}: PASS is missing evidenceId.`);
    assert(row.falseConfirmedScans === 0, `${row.device}: PASS requires falseConfirmedScans=0.`);
    assert(row.os !== "NOT_TESTED" && row.browserOrApp !== "NOT_TESTED", `${row.device}: PASS has placeholder device identity.`);
    const evidencePath = resolveRepositoryPath(`${manifest.physicalEvidence.evidenceDirectory}/${row.evidenceId}.json`, `${row.device} evidence`);
    assert(fs.existsSync(evidencePath), `${row.device}: referenced Physical Evidence file is missing.`);
    const evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
    assert(evidence.productSourceCommit === identity.productSourceCommit && evidence.sourceTree === identity.sourceTree, `${row.device}: Physical Evidence Product Source identity mismatch.`);
    assert(evidence.candidateEvidenceCommit === identity.qualificationBaseCommit && commitExists(evidence.candidateEvidenceCommit), `${row.device}: candidateEvidenceCommit is not the declared qualification base.`);
    assert(evidence.sensitiveDataReviewed === true, `${row.device}: sensitive data review is not attested.`);
    const deviceModel = evidence.device?.model ?? evidence.device?.declaredModel;
    const osName = evidence.device?.operatingSystem?.name ?? evidence.device?.operatingSystem;
    const osVersion = evidence.device?.operatingSystem?.version ?? evidence.device?.operatingSystemVersion;
    assert(evidence.device?.realHardware === true && nonPlaceholder(evidence.device?.manufacturer) && nonPlaceholder(deviceModel) && nonPlaceholder(osName) && nonPlaceholder(osVersion), `${row.device}: real device/OS identity is incomplete.`);
    const cameraSettings = evidence.camera?.settings ?? {};
    assert(nonPlaceholder(evidence.camera?.id ?? evidence.camera?.label ?? evidence.camera?.model) && cameraSettings.width > 0 && cameraSettings.height > 0 && cameraSettings.frameRate > 0, `${row.device}: camera identity/settings are incomplete.`);
    const groundTruthTargets = evidence.groundTruth?.targets;
    assert(isSha256(evidence.groundTruth?.sha256) && Array.isArray(groundTruthTargets) && groundTruthTargets.length > 0, `${row.device}: Ground Truth identity/targets are missing.`);
    assert(Array.isArray(evidence.scenarioResults) && evidence.scenarioResults.length > 0, `${row.device}: scenario results are missing.`);
    assert(evidence.scenarioResults.every((entry) => ["PASS", "passed"].includes(entry.status) && entry.falseConfirmedScans === 0), `${row.device}: scenario results retain a failure or false confirmation.`);
    assert(evidence.falseConfirmedScans === 0, `${row.device}: false-positive gate failed.`);
    assert(!/simulat|emulat|spoof|placeholder/i.test(JSON.stringify(evidence.device ?? {})), `${row.device}: simulated/emulated/placeholder device identity is inadmissible.`);
    assert(evidence.privacy?.rawCameraVideoCommitted === false && evidence.networkIsolation?.localDecodeContinued === true && evidence.networkIsolation?.remoteDecodeUsed === false, `${row.device}: privacy/offline local-decode evidence is incomplete.`);
    if (row.surface === "web") {
      assert(nonPlaceholder(evidence.browser?.name) && nonPlaceholder(evidence.browser?.version), `${row.device}: browser identity is incomplete.`);
      assert(evidence.deployment?.id === manifest.provenance.deployment.id && evidence.deployment?.gitCommitSha === identity.productSourceCommit, `${row.device}: Web deployment identity mismatch.`);
      if (row.device !== "Desktop real webcam") {
        const scenarioIds = evidence.scenarioResults.map((entry) => entry.scenarioId);
        assert(scenarioIds.length === requiredWebScenarioIds.length && new Set(scenarioIds).size === requiredWebScenarioIds.length && requiredWebScenarioIds.every((id) => scenarioIds.includes(id)), `${row.device}: exact P1-P12+N1 result set is incomplete.`);
      }
    } else {
      assert(nonPlaceholder(evidence.app?.name) && nonPlaceholder(evidence.app?.version), `${row.device}: Native app identity is incomplete.`);
      assert(Array.isArray(evidence.supportedFormats) && evidence.supportedFormats.length === 8 && new Set(evidence.supportedFormats).size === 8, `${row.device}: Native all-eight-format evidence is incomplete.`);
      const expectedId = row.surface === "native-ios" ? "ios-source-package" : "android-aar";
      const expectedArtifact = manifest.artifacts.required.find((entry) => entry.id === expectedId);
      assert(row.artifactSha256 === expectedArtifact?.sha256, `${row.device}: Matrix Native artifact SHA-256 mismatch.`);
      assert(evidence.artifactSha256 === expectedArtifact?.sha256, `${row.device}: Native artifact SHA-256 mismatch.`);
    }
    if (row.tracking === "PASS") {
      for (const field of ["identitySwitchCount", "fragmentationCount", "falseTrackCount"]) assert(nonNegativeInteger(evidence.tracking?.[field]), `${row.device}: tracking metric '${field}' is missing.`);
      assert(evidence.tracking.falseTrackCount === 0, `${row.device}: falseTrackCount is non-zero.`);
    }
    if (row.batch === "PASS") {
      const batchModes = evidence.batch?.modes ?? [];
      assert(evidence.batch?.physicalInstanceSemantics === true && ["expected-count", "checklist", "duplicate-quantity"].every((mode) => batchModes.some((entry) => entry.mode === mode && entry.status === "PASS")), `${row.device}: physical-instance Batch evidence is incomplete.`);
    }
    if (row.industrial === "PASS") {
      const industrial = evidence.industrial?.scenarios ?? [];
      assert(["low-contrast", "perspective", "small-module", "glare", "damaged", "screen-display"].every((scenario) => industrial.some((entry) => entry.scenario === scenario && entry.status === "PASS")), `${row.device}: required Industrial Physical evidence is incomplete.`);
    }
    if (row.soak === "PASS" || evidence.longRun) verifyLongRun(evidence.longRun, row.device);
    qualifyingPhysicalEvidence.push({ row, evidence });
  }
}
const matrixAllPass = matrix.rows.every((row) => row.status === "PASS");
assert(matrix.summary && Object.keys(matrix.summary).sort().join(",") === ["longSession", "nativeAndroidPhysical", "nativeIosPhysical", "physicalFalsePositiveGate", "webPhysical"].sort().join(","), "Physical Matrix summary fields are incomplete.");
const summaryAllPass = Object.values(matrix.summary).every((value) => value === "PASS" || value === "GO");
assert(matrixAllPass === summaryAllPass, "Physical Matrix row and summary qualification states disagree.");
assert(!matrixAllPass, "Legacy Physical Matrix schema v1 is audit-only and cannot produce Physical GO; a new fail-closed schema/verifier is required.");
assert(manifest.physicalEvidence.status === (matrixAllPass ? "RC2_PHYSICAL_GO" : "RC2_PHYSICAL_NO_GO"), "Manifest Physical status does not match Matrix rows.");
if (!matrixAllPass) assert(manifest.physicalEvidence.blocker === "BLOCKED_EXTERNAL_PHYSICAL_HARDWARE", "Physical NO-GO blocker is missing.");

const signingPolicyFile = fileIdentity(manifest.signing?.policy, "signing policy");
const signingPolicy = parseJson(signingPolicyFile.bytes, "signing policy");
assert(signingPolicy.schemaVersion === "production-signing-policy-1", "Signing Policy schema mismatch.");
assert(["RC2_SIGNING_GO", "RC2_SIGNING_NO_GO"].includes(manifest.signing.status), "Manifest Signing status is not a recognized RC2 gate state.");
assert(manifest.signing.status === "RC2_SIGNING_NO_GO", "Production Signing Policy schema v1 is requirements-only and cannot produce Signing GO; verified signing-evidence schema v2 is required.");
assert(signingPolicy.status === manifest.signing.status, "Manifest Signing status does not match Signing Policy.");
assert(signingPolicy.blocker === manifest.signing.blocker, "Manifest Signing blocker does not match Signing Policy.");
assert(signingPolicy.developmentSigningMayNotSubstitute === true, "Development signing substitution must remain forbidden.");
for (const field of ["gitTagSigning", "githubRelease", "npm", "android", "apple"]) {
  assert(nonPlaceholder(signingPolicy[field]) && !/DEVELOPMENT|TEMPORARY|RANDOM/i.test(signingPolicy[field]), `Signing Policy '${field}' requirement is missing or inadmissible.`);
}
if (manifest.signing.status === "RC2_SIGNING_NO_GO") {
  assert(manifest.signing.blocker === "BLOCKED_EXTERNAL_RELEASE_CREDENTIALS", "Signing NO-GO blocker is missing.");
} else {
  assert(!manifest.signing.blocker && !signingPolicy.blocker, "Signing GO cannot retain a blocker.");
  const signingEvidenceFile = fileIdentity(manifest.signing.evidence, "production signing evidence");
  const signingEvidence = parseJson(signingEvidenceFile.bytes, "production signing evidence");
  assert(signingEvidence.schemaVersion === "production-signing-evidence-1", "Production Signing Evidence schema mismatch.");
  assert(signingEvidence.productSourceCommit === identity.productSourceCommit && signingEvidence.sourceTree === identity.sourceTree && signingEvidence.candidateTag === identity.candidateTag, "Production Signing Evidence source/candidate identity mismatch.");
  assert(signingEvidence.secretMaterialCommitted === false, "Production Signing Evidence reports committed secret material.");
  const gitSigning = signingEvidence.git;
  assert(gitSigning?.status === "PASS" && gitSigning.productionTag === "v2.0.0" && gitSigning.signatureVerified === true && nonPlaceholder(gitSigning.signer) && nonPlaceholder(gitSigning.publicVerificationIdentity) && nonPlaceholder(gitSigning.ownership) && nonPlaceholder(gitSigning.rotationPolicy) && nonPlaceholder(gitSigning.revocationRecoveryPolicy), "Production Git signing evidence is incomplete.");
  const githubSigning = signingEvidence.githubRelease;
  assert(githubSigning?.status === "PASS" && githubSigning.checksumsVerified === true && githubSigning.signatureVerified === true && nonPlaceholder(githubSigning.verificationInstructions), "GitHub Release checksum/signature evidence is incomplete.");
  const npmSigning = signingEvidence.npm;
  assert(npmSigning?.status === "PASS" && npmSigning.trustedPublishing === true && npmSigning.provenanceVerified === true && nonPlaceholder(npmSigning.publisherIdentity) && nonPlaceholder(npmSigning.packageOwnership), "npm trusted publishing/provenance evidence is incomplete.");
  const androidSigning = signingEvidence.android;
  assert(androidSigning?.status === "PASS" && nonPlaceholder(androidSigning.distributionPolicy) && (androidSigning.notPublished === true || androidSigning.signatureVerified === true), "Android production distribution/signing evidence is incomplete.");
  const appleSigning = signingEvidence.apple;
  assert(appleSigning?.status === "PASS" && nonPlaceholder(appleSigning.distributionModel) && appleSigning.signatureVerified === true, "Apple production distribution/signing evidence is incomplete.");
}

const deployment = manifest.provenance?.deployment;
assert(manifest.provenance?.status === "PASS_EXACT_SOURCE_DEPLOYMENT", "Deployment provenance status is not exact-source PASS.");
assert(deployment?.id === "dpl_4HLYL2TtuMNFEg9kDdBcNppRRDSo", "Deployment ID mismatch.");
assert(/^https:\/\//.test(deployment?.url ?? "") && deployment.gitCommitSha === identity.productSourceCommit && deployment.readyState === "READY", "Deployment source/readiness identity mismatch.");

assert(Array.isArray(manifest.legacyManifests) && manifest.legacyManifests.length === 2, "Legacy Manifest audit set must contain RC1 r1 and RC2 r1.");
for (const legacy of manifest.legacyManifests) {
  assert(legacy.classification === "LEGACY_MANIFEST_HASH_UNVERIFIED", `${legacy.path}: legacy classification must remain unverified.`);
  const legacyPath = resolveRepositoryPath(legacy.path, "legacy manifest");
  const legacyValue = parseLegacyJson(fs.readFileSync(legacyPath), `legacy manifest ${legacy.path}`);
  assert(classification(legacyValue, legacyPath)?.startsWith("LEGACY_MANIFEST_HASH_UNVERIFIED"), `${legacy.path}: legacy manifest no longer has the historical embedded-hash schema.`);
  assert(gitSucceeds("show-ref", "--verify", "--quiet", `refs/tags/${legacy.anchorTag}`), `${legacy.path}: historical anchor tag is missing.`);
  assert(isCommit(legacy.expectedTagTarget) && git("rev-parse", `refs/tags/${legacy.anchorTag}^{}`) === legacy.expectedTagTarget, `${legacy.path}: historical anchor tag target moved.`);
  assert(isCommit(legacy.expectedTagObject) && git("rev-parse", `refs/tags/${legacy.anchorTag}`) === legacy.expectedTagObject, `${legacy.path}: historical anchor tag object changed.`);
  assert(gitSucceeds("diff", "--quiet", legacy.anchorTag, "HEAD", "--", legacy.path), `${legacy.path}: historical Manifest changed after its anchor tag.`);
  console.log(`LEGACY_MANIFEST_HASH_UNVERIFIED ${legacy.path} anchor=${legacy.anchorTag}`);
}

const expectedPhysicalStatus = matrixAllPass ? "RC2_PHYSICAL_GO" : "RC2_PHYSICAL_NO_GO";
assert(manifest.overall?.software === "RC2_SOFTWARE_GO", "Software status is not RC2_SOFTWARE_GO.");
assert(manifest.overall?.manifestIntegrity === "RC2_MANIFEST_INTEGRITY_GO", "Manifest integrity status is not GO.");
assert(manifest.overall?.physical === expectedPhysicalStatus, "Overall Physical status is inconsistent.");
assert(manifest.overall?.signing === manifest.signing.status, "Overall Signing status is inconsistent.");
const expectedStable = matrixAllPass && manifest.signing.status === "RC2_SIGNING_GO" ? "V2_STABLE_RELEASE_GO" : "V2_STABLE_RELEASE_NO_GO";
assert(manifest.overall?.stable === expectedStable, "Overall Stable status is inconsistent with Physical/Signing gates.");
const expectedBlockers = [
  ...(matrixAllPass ? [] : ["BLOCKED_EXTERNAL_PHYSICAL_HARDWARE"]),
  ...(manifest.signing.status === "RC2_SIGNING_GO" ? [] : ["BLOCKED_EXTERNAL_RELEASE_CREDENTIALS"]),
].sort();
assert(Array.isArray(manifest.overall.blockers) && JSON.stringify([...manifest.overall.blockers].sort()) === JSON.stringify(expectedBlockers), "Overall blocker set is inconsistent.");

if (mode === "stable") {
  assert(matrixAllPass, "Stable release gate requires every Physical Matrix row to PASS.");
  assert(Object.values(matrix.summary ?? {}).every((value) => value === "PASS" || value === "GO"), "Stable release gate rejects non-PASS Physical Matrix summary fields.");
  assert(manifest.signing.status === "RC2_SIGNING_GO", "Stable release gate requires production Signing GO.");
  assert(manifest.overall.stable === "V2_STABLE_RELEASE_GO" && manifest.overall.blockers.length === 0, "Stable release gate requires zero blockers and Stable GO.");
  assert(qualifyingPhysicalEvidence.some(({ row, evidence }) => row.device !== "Desktop real webcam" && evidence.longRun?.durationMs >= 3_600_000), "Stable release gate requires a real >=60-minute Physical Mobile session with complete soak evidence.");
}

console.log(`${candidateBinding} ${identity.candidateTag}`);
console.log(`RC2_MANIFEST_INTEGRITY_GO digest=${actualDigest} source=${identity.productSourceCommit} mode=${mode}`);
