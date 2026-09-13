import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { validateNpmBuildIdentity } from "./npm-provenance-identity.mjs";

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const separator = arg.indexOf("=");
  assert.ok(arg.startsWith("--") && separator > 2);
  return [arg.slice(2, separator), arg.slice(separator + 1)];
}));
for (const required of ["build-a", "build-b", "run-evidence", "npm-cli", "output"]) assert.ok(args[required], `Missing --${required}`);
const root = process.cwd();
const directories = [path.resolve(args["build-a"]), path.resolve(args["build-b"])];
assert.notEqual(directories[0], directories[1]);
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const hash = (bytes, algorithm = "sha256") => crypto.createHash(algorithm).update(bytes).digest("hex");
const reports = directories.map((directory) => read(path.join(directory, "build.json")));
const run = read(path.resolve(args["run-evidence"]));
assert.equal(run.conclusion, "success");
assert.equal(run.status, "completed");
const sourceCommit = reports[0].sourceCommit;
const sourceTree = execFileSync("git", ["show", "-s", "--format=%T", sourceCommit], { encoding: "utf8" }).trim();
const requireNpm = createRequire(path.resolve(args["npm-cli"]));
const sigstore = requireNpm("sigstore");
const npa = requireNpm("npm-package-arg");
const { verifyProvenance } = requireNpm(path.join(path.dirname(requireNpm.resolve("libnpmpublish")), "provenance.js"));
const names = new Set();
const maps = [];
const provenances = [];
const jobs = [];
for (let i = 0; i < reports.length; i++) {
  const report = reports[i];
  const label = i === 0 ? "A" : "B";
  assert.equal(report.schemaVersion, "scanly-v2.1-npm-build-1");
  assert.equal(report.version, "2.1.0");
  assert.equal(report.sourceCommit, sourceCommit);
  assert.equal(report.sourceTree, sourceTree);
  assert.equal(report.repositoryDirty, false);
  assert.equal(report.published, false);
  assert.equal(report.buildLabel, label);
  assert.equal(report.runId, run.databaseId);
  assert.equal(report.workflowDefinitionCommit, run.headSha);
  assert.equal(report.artifacts.length, 11);
  assert.ok(report.workflowRef.startsWith("Yangjunjie-Lin/Scanly/.github/workflows/v2.1-artifact-qualification.yml@"));
  const job = run.jobs.find((entry) => entry.name === `Clean npm build ${label}`);
  assert.equal(job?.conclusion, "success");
  assert.ok(job.databaseId);
  jobs.push(job.databaseId);
  const hashes = {};
  for (const artifact of report.artifacts) {
    for (const value of [artifact.filename, artifact.provenanceFile]) assert.equal(path.basename(value), value);
    const bytes = fs.readFileSync(path.join(directories[i], "npm", artifact.filename));
    assert.equal(bytes.length, artifact.size);
    assert.equal(hash(bytes), artifact.sha256);
    assert.equal(hash(bytes, "sha512"), artifact.sha512);
    assert.equal(artifact.version, "2.1.0");
    assert.equal(artifact.purl, npa.toPurl(npa(`${artifact.name}@2.1.0`)));
    assert.ok(artifact.name.startsWith("@scanly/"));
    assert.equal(hashes[artifact.filename], undefined, "Duplicate package artifact");
    hashes[artifact.filename] = artifact.sha256;
    const file = path.join(directories[i], "provenance", artifact.provenanceFile);
    assert.equal(hash(fs.readFileSync(file)), artifact.provenanceSha256);
    const bundle = await verifyProvenance({ name: artifact.purl, digest: { sha512: artifact.sha512 } }, file);
    await sigstore.verify(bundle, {
      certificateIssuer: "https://token.actions.githubusercontent.com",
      certificateIdentityURI: `https://github.com/${report.workflowRef}`,
    });
    const statement = JSON.parse(Buffer.from(bundle.dsseEnvelope.payload, "base64").toString("utf8"));
    assert.equal(statement.predicateType, "https://slsa.dev/provenance/v1");
    assert.equal(statement.predicate.buildDefinition.externalParameters.source_commit, sourceCommit);
    assert.ok(statement.predicate.buildDefinition.resolvedDependencies.some((dependency) => dependency.digest.gitCommit === sourceCommit));
    if (args["npm-compatible"] === "true") {
      validateNpmBuildIdentity(statement, { sourceCommit, workflowCommit: run.headSha, workflowRef: report.workflowRef.split("@")[1] });
    }
    if (args["frozen-artifacts"]) {
      const frozen = read(args["frozen-artifacts"]).artifacts.find((entry) => path.basename(entry.path) === artifact.filename);
      assert.ok(frozen, `Missing frozen artifact ${artifact.filename}`);
      assert.equal(frozen.sha256, artifact.sha256, "Fresh builds must match the frozen release bytes");
    }
    if (i === 0) { names.add(artifact.name); provenances.push({ package: artifact.name, file: path.relative(root, file).replaceAll("\\", "/"), sha256: artifact.provenanceSha256, artifactSha256: artifact.sha256, artifactSha512: artifact.sha512, certificateIdentity: `https://github.com/${report.workflowRef}`, verified: true }); }
  }
  maps.push(hashes);
}
assert.notEqual(jobs[0], jobs[1], "Independent GitHub-hosted build jobs are required");
assert.deepEqual(maps[0], maps[1]);
assert.equal(names.size, 11);
assert.ok(names.has("@scanly/url-safety"));
const result = { schemaVersion: "scanly-v2.1-npm-reproducibility-1", version: "2.1.0", sourceCommit, sourceTree, status: "PASS", independentBuildJobs: jobs, runId: run.databaseId, cleanBuildRunA: `https://github.com/Yangjunjie-Lin/Scanly/actions/runs/${run.databaseId}/job/${jobs[0]}`, cleanBuildRunB: `https://github.com/Yangjunjie-Lin/Scanly/actions/runs/${run.databaseId}/job/${jobs[1]}`, cleanBuildA: maps[0], cleanBuildB: maps[1], rawBuildAEqualsBuildB: true, detachedProvenanceVerified: provenances, packageCount: names.size, published: false };
const output = path.resolve(args.output);
assert.ok(!fs.existsSync(output), "Never overwrite qualification evidence");
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(result, null, 2) + "\n");
console.log("V2_1_NPM_ARTIFACT_REPRODUCIBILITY_GO: 11 byte-identical tarballs; 22 issuer/identity/subject-bound provenance bundles verified. No publication performed.");
