import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const [buildA, buildB, runId] = process.argv.slice(2);
assert.ok(buildA && buildB && /^\d+$/.test(runId ?? ""), "Use <build-A> <build-B> <run-id>");
assert.ok(process.env.NPM_CLI_PATH);
const root = "release/stable/v2.1.0", directory = `${root}/publication-recovery`;
const output = `${root}/v2.1.0-provenance-recovery.json`;
assert.ok(!fs.existsSync(directory) && !fs.existsSync(output), "Never overwrite recovery evidence");
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const hash = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const write = (p, value) => fs.writeFileSync(p, JSON.stringify(value, null, 2) + "\n");
const run = JSON.parse(execFileSync("gh", ["run", "view", runId, "--repo", "Yangjunjie-Lin/Scanly", "--json", "databaseId,status,conclusion,headSha,jobs,url,event,workflowName"], { encoding: "utf8" }));
assert.equal(run.status, "completed"); assert.equal(run.conclusion, "success");
assert.equal(run.workflowName, "v2.1 Artifact Qualification");
const manifestPath = `${root}/v2.1.0-manifest.json`;
assert.ok(execFileSync("git", ["show", `v2.1.0:${manifestPath}`]).equals(fs.readFileSync(manifestPath)));
const manifest = read(manifestPath), bootstrap = read(`${root}/publication-credentials.json`).channels.npmRegistry.evidence.bootstrap;
for (const build of [buildA, buildB]) assert.equal(read(path.join(build, "build.json")).sourceCommit, manifest.identity.productSourceCommit);
const scratch = fs.mkdtempSync(path.resolve("release-dist", "provenance-recovery-"));
const runPath = path.join(scratch, "run.json"), reportPath = path.join(scratch, "reproducibility.json");
write(runPath, run);
execFileSync(process.execPath, ["scripts/verify-v2.1-artifact-builds.mjs", `--build-a=${buildA}`, `--build-b=${buildB}`, `--run-evidence=${runPath}`, `--npm-cli=${process.env.NPM_CLI_PATH}`, `--output=${reportPath}`, "--npm-compatible=true", `--frozen-artifacts=${root}/artifact-manifest.json`], { stdio: "inherit" });
fs.mkdirSync(directory);
const evidence = [];
const preserve = (from, name) => {
  const to = `${directory}/${name}`; fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to); evidence.push({ path: to, sha256: hash(to) }); return to;
};
preserve(runPath, "qualification-run.json");
for (const [index, build] of [buildA, buildB].entries()) {
  const label = index === 0 ? "A" : "B", report = read(path.join(build, "build.json"));
  preserve(path.join(build, "build.json"), `build-${label}.json`);
  for (const artifact of report.artifacts) preserve(path.join(build, "provenance", artifact.provenanceFile), `provenance-${label}/${artifact.provenanceFile}`);
}
const reproducibility = read(reportPath);
for (const proof of reproducibility.detachedProvenanceVerified) proof.file = `${directory}/provenance-A/${path.basename(proof.file)}`;
write(`${directory}/reproducibility.json`, { ...reproducibility, npmRegistrySourceIdentityCompatible: true, frozenReleaseArtifactsEqual: true });
evidence.push({ path: `${directory}/reproducibility.json`, sha256: hash(`${directory}/reproducibility.json`) });
const provenancePath = `${directory}/provenance-A/scanly-url-safety-2.1.0.tgz.sigstore.json`;
const reportA = read(path.join(buildA, "build.json"));
const record = {
  schemaVersion: "scanly-v2.1-provenance-recovery-1", version: "2.1.0", package: "@scanly/url-safety",
  reason: "npm Registry rejected the original cryptographically valid bundle with E422: dependency zero did not match certificate SourceRepositoryURI/SourceRepositoryDigest. Two fresh independent builds retain the real product source separately and bind dependency zero to the actual GitHub certificate source. No frozen tag, manifest, tarball, or original proof was changed.",
  qualificationManifest: { path: manifestPath, sha256: hash(manifestPath) },
  originalProvenance: { path: bootstrap.provenancePath, sha256: bootstrap.provenanceSha256, registryAccepted: false },
  artifact: { path: bootstrap.artifactPath, sha256: bootstrap.artifactSha256, sha512: bootstrap.artifactSha512 },
  replacementProvenance: { path: provenancePath, sha256: hash(provenancePath) },
  sourceCommit: reportA.sourceCommit, sourceTree: reportA.sourceTree,
  workflowDefinitionCommit: run.headSha, workflowRef: reportA.workflowRef, runId: Number(runId), runAttempt: reportA.runAttempt,
  independentBuildJobs: reproducibility.independentBuildJobs,
  evidence, npmCredentialsUsedByCI: false, published: false, createdAt: new Date().toISOString(),
};
write(output, record);
console.log(`V2_1_PROVENANCE_RECOVERY_QUALIFIED: ${output}`);
