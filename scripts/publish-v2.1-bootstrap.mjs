import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { validateNpmBuildIdentity } from "./npm-provenance-identity.mjs";

const root = process.cwd();
const tag = "v2.1.0";
const directory = "release/stable/v2.1.0";
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const npmCli = process.env.npm_execpath;
assert.ok(npmCli, "Run through npm run stable:bootstrap");
const runNpm = (...args) => execFileSync(process.execPath, [npmCli, ...args], { encoding: "utf8" }).trim();
assert.equal(git("cat-file", "-t", tag), "tag");
execFileSync("git", ["-c", `gpg.ssh.allowedSignersFile=${directory}/evidence/allowed-signers`, "verify-tag", tag], { stdio: "inherit" });
const manifestFile = `${directory}/${tag}-manifest.json`;
const taggedManifest = execFileSync("git", ["show", `${tag}:${manifestFile}`]);
assert.ok(taggedManifest.equals(fs.readFileSync(manifestFile)), "Working manifest differs from the signed tag");
execFileSync(process.execPath, ["scripts/verify-stable-manifest.mjs", "--require-go"], { stdio: "inherit", env: { ...process.env, STABLE_RELEASE_VERSION: "2.1.0" } });
const release = JSON.parse(execFileSync("gh", ["release", "view", tag, "--repo", "Yangjunjie-Lin/Scanly", "--json", "tagName,isDraft,isPrerelease,url"], { encoding: "utf8" }));
assert.equal(release.tagName, tag); assert.equal(release.isDraft, false); assert.equal(release.isPrerelease, false);
const credentials = JSON.parse(fs.readFileSync(`${directory}/publication-credentials.json`, "utf8"));
const bootstrap = credentials.channels.npmRegistry.evidence.bootstrap;
assert.equal(bootstrap.package, "@scanly/url-safety"); assert.equal(bootstrap.version, "2.1.0");
const artifactFile = path.resolve(root, bootstrap.artifactPath);
let provenanceFile = path.resolve(root, bootstrap.provenancePath);
const bytes = fs.readFileSync(artifactFile);
assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), bootstrap.artifactSha256);
assert.equal(crypto.createHash("sha512").update(bytes).digest("hex"), bootstrap.artifactSha512);
assert.equal(crypto.createHash("sha256").update(fs.readFileSync(provenanceFile)).digest("hex"), bootstrap.provenanceSha256);
const requireNpm = createRequire(npmCli);
const verifier = requireNpm(path.join(path.dirname(requireNpm.resolve("libnpmpublish")), "provenance.js"));
await verifier.verifyProvenance({ name: "pkg:npm/%40scanly/url-safety@2.1.0", digest: { sha512: bootstrap.artifactSha512 } }, provenanceFile);
// A Registry compatibility repair is additive. The tag-bound original bundle,
// tarball, manifest, and credential policy above remain independently checked.
const recoveryArg = process.argv.slice(2);
assert.ok(recoveryArg.length === 0 || (recoveryArg.length === 1 && recoveryArg[0] === "--qualified-provenance-recovery"), "Unknown bootstrap arguments");
if (recoveryArg.length) {
  const recovery = JSON.parse(fs.readFileSync(`${directory}/v2.1.0-provenance-recovery.json`, "utf8"));
  const hashFile = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
  assert.equal(recovery.schemaVersion, "scanly-v2.1-provenance-recovery-1");
  assert.equal(recovery.version, "2.1.0"); assert.equal(recovery.package, bootstrap.package);
  assert.equal(recovery.sourceCommit, bootstrap.sourceCommit);
  assert.equal(recovery.sourceTree, git("show", "-s", "--format=%T", bootstrap.sourceCommit));
  assert.deepEqual(recovery.artifact, { path: bootstrap.artifactPath, sha256: bootstrap.artifactSha256, sha512: bootstrap.artifactSha512 });
  assert.deepEqual(recovery.originalProvenance, { path: bootstrap.provenancePath, sha256: bootstrap.provenanceSha256, registryAccepted: false });
  assert.deepEqual(recovery.qualificationManifest, { path: manifestFile, sha256: hashFile(manifestFile) });
  assert.equal(recovery.npmCredentialsUsedByCI, false);
  assert.equal(recovery.replacementProvenance.path, `${directory}/publication-recovery/provenance-A/scanly-url-safety-2.1.0.tgz.sigstore.json`);
  provenanceFile = path.resolve(root, recovery.replacementProvenance.path);
  assert.equal(hashFile(provenanceFile), recovery.replacementProvenance.sha256);
  for (const evidence of recovery.evidence) {
    assert.ok(evidence.path.startsWith(`${directory}/publication-recovery/`) && !evidence.path.includes("..") && !evidence.path.includes("\\"));
    assert.equal(hashFile(evidence.path), evidence.sha256);
  }
  const run = JSON.parse(execFileSync("gh", ["run", "view", String(recovery.runId), "--repo", "Yangjunjie-Lin/Scanly", "--json", "headSha,status,conclusion,jobs,workflowName"], { encoding: "utf8" }));
  assert.equal(run.status, "completed"); assert.equal(run.conclusion, "success");
  assert.equal(run.workflowName, "v2.1 Artifact Qualification");
  assert.equal(run.headSha, recovery.workflowDefinitionCommit);
  assert.equal(new Set(recovery.independentBuildJobs).size, 2);
  const sigstore = requireNpm("sigstore");
  for (const [index, label] of ["A", "B"].entries()) {
    assert.ok(run.jobs.some((job) => job.name === `Clean npm build ${label}` && job.databaseId === recovery.independentBuildJobs[index] && job.conclusion === "success"));
    const bundleFile = `${directory}/publication-recovery/provenance-${label}/scanly-url-safety-2.1.0.tgz.sigstore.json`;
    const bundle = await verifier.verifyProvenance({ name: "pkg:npm/%40scanly/url-safety@2.1.0", digest: { sha512: bootstrap.artifactSha512 } }, bundleFile);
    assert.ok(recovery.workflowRef.startsWith("Yangjunjie-Lin/Scanly/.github/workflows/v2.1-artifact-qualification.yml@"));
    await sigstore.verify(bundle, { certificateIssuer: "https://token.actions.githubusercontent.com", certificateIdentityURI: `https://github.com/${recovery.workflowRef}` });
    const statement = JSON.parse(Buffer.from(bundle.dsseEnvelope.payload, "base64").toString("utf8"));
    validateNpmBuildIdentity(statement, { sourceCommit: recovery.sourceCommit, workflowCommit: run.headSha, workflowRef: recovery.workflowRef.split("@")[1] });
    assert.equal(statement.predicate.runDetails.metadata.invocationId, `https://github.com/Yangjunjie-Lin/Scanly/actions/runs/${recovery.runId}/attempts/${recovery.runAttempt}`);
  }
  console.log("Verified additive provenance recovery against the frozen artifact, live successful build run, and two independent signed bundles.");
} else {
  assert.fail("Original bundle is Registry-incompatible (E422). Generate and verify additive recovery evidence, then use --qualified-provenance-recovery. Do not retry authentication with the rejected bundle.");
}
assert.equal(runNpm("whoami"), "yangjunjielin");
const artifacts = JSON.parse(fs.readFileSync(`${directory}/artifact-manifest.json`, "utf8")).artifacts;
const parser = artifacts.find((artifact) => artifact.platform === "npm" && artifact.path.endsWith("scanly-parsers-2.1.0.tgz"));
assert.ok(parser);
const expectedParserIntegrity = `sha512-${crypto.createHash("sha512").update(fs.readFileSync(parser.path)).digest("base64")}`;
assert.equal(JSON.parse(runNpm("view", "@scanly/parsers@2.1.0", "dist.integrity", "--json")), expectedParserIntegrity, "Publish and verify the parser dependency first");
const expectedIntegrity = `sha512-${Buffer.from(bootstrap.artifactSha512, "hex").toString("base64")}`;
let existing;
try { existing = JSON.parse(runNpm("view", "@scanly/url-safety@2.1.0", "dist", "--json")); } catch { /* first publication */ }
if (!existing) {
  console.log("Publishing only @scanly/url-safety@2.1.0, with qualified exact bytes and verified CI provenance. npm may require interactive security-key confirmation.");
  execFileSync(process.execPath, [npmCli, "publish", artifactFile, "--access=public", "--tag=latest", `--provenance-file=${provenanceFile}`, "--browser=false"], { stdio: "inherit" });
}
const dist = JSON.parse(runNpm("view", "@scanly/url-safety@2.1.0", "dist", "--json"));
assert.equal(dist.integrity, expectedIntegrity);
assert.equal(dist.attestations?.provenance?.predicateType, "https://slsa.dev/provenance/v1");
assert.equal(JSON.parse(runNpm("view", "@scanly/url-safety", "dist-tags.latest", "--json")), "2.1.0");
console.log("V2_1_BOOTSTRAP_PUBLICATION_VERIFIED: exact registry integrity, latest tag, and provenance present.");
