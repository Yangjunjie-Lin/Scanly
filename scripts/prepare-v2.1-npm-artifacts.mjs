import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const separator = arg.indexOf("=");
  assert.ok(arg.startsWith("--") && separator > 2, "Use --name=value arguments");
  return [arg.slice(2, separator), arg.slice(separator + 1)];
}));
const root = fs.realpathSync(path.resolve(args.root ?? "."));
const output = path.resolve(args.output ?? "release-dist/v2.1-npm");
const git = (...values) => execFileSync("git", values, { cwd: root, encoding: "utf8" }).trim();
const sourceCommit = git("rev-parse", "HEAD");
const sourceTree = git("rev-parse", "HEAD^{tree}");
assert.equal(sourceCommit, process.env.SOURCE_COMMIT);
assert.equal(git("status", "--porcelain", "--untracked-files=all"), "", "Product checkout must be clean");
assert.equal(process.env.GITHUB_ACTIONS, "true", "Detached provenance requires a real GitHub Actions runner");
assert.equal(process.env.GITHUB_REPOSITORY, "Yangjunjie-Lin/Scanly");
assert.equal(process.env.RUNNER_ENVIRONMENT, "github-hosted");
assert.ok(!process.env.NODE_AUTH_TOKEN && !process.env.NPM_TOKEN, "No npm credentials are used by this builder");
assert.ok(process.env.NPM_CLI_PATH && process.env.ACTIONS_ID_TOKEN_REQUEST_URL);
const npmRequire = createRequire(process.env.NPM_CLI_PATH);
const sigstore = npmRequire("sigstore");
const npa = npmRequire("npm-package-arg");
const npmVersion = execFileSync(process.execPath, [process.env.NPM_CLI_PATH, "--version"], { encoding: "utf8" }).trim();
assert.equal(npmVersion, "11.12.1");
const version = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
assert.equal(version, "2.1.0");
assert.ok(!fs.existsSync(output), "Never overwrite an existing artifact build");
fs.mkdirSync(path.join(output, "npm"), { recursive: true });
fs.mkdirSync(path.join(output, "provenance"));
const sha = (bytes, algorithm = "sha256") => crypto.createHash(algorithm).update(bytes).digest("hex");
const records = [];
const workflowRef = process.env.GITHUB_WORKFLOW_REF;
assert.ok(workflowRef?.startsWith("Yangjunjie-Lin/Scanly/.github/workflows/v2.1-artifact-qualification.yml@"));
const workflowPath = ".github/workflows/v2.1-artifact-qualification.yml";
const workflowGitRef = workflowRef.slice(workflowRef.indexOf("@") + 1);
const invocationId = `https://github.com/Yangjunjie-Lin/Scanly/actions/runs/${process.env.GITHUB_RUN_ID}/attempts/${process.env.GITHUB_RUN_ATTEMPT}`;

for (const folder of ["packages", "engines"]) {
  for (const entry of fs.readdirSync(path.join(root, folder), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const directory = path.join(root, folder, entry.name);
    const manifestPath = path.join(directory, "package.json");
    if (!entry.isDirectory() || !fs.existsSync(manifestPath)) continue;
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    if (manifest.private) continue;
    assert.equal(manifest.version, version);
    assert.equal(manifest.repository?.url, "git+https://github.com/Yangjunjie-Lin/Scanly.git");
    const [packed] = JSON.parse(execFileSync(process.execPath, [process.env.NPM_CLI_PATH, "pack", "--json", "--pack-destination", path.join(output, "npm")], { cwd: directory, encoding: "utf8" }));
    const bytes = fs.readFileSync(path.join(output, "npm", packed.filename));
    const purl = npa.toPurl(npa(`${manifest.name}@${version}`));
    // The workflow definition and checked-out product source are explicitly
    // different dependencies. Never spoof GITHUB_SHA or claim a different source.
    const statement = {
      _type: "https://in-toto.io/Statement/v1",
      subject: [{ name: purl, digest: { sha512: sha(bytes, "sha512") } }],
      predicateType: "https://slsa.dev/provenance/v1",
      predicate: {
        buildDefinition: {
          buildType: "https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1",
          externalParameters: { workflow: { ref: workflowGitRef, repository: "https://github.com/Yangjunjie-Lin/Scanly", path: workflowPath }, source_commit: sourceCommit },
          internalParameters: { github: { event_name: process.env.GITHUB_EVENT_NAME, repository_id: process.env.GITHUB_REPOSITORY_ID, repository_owner_id: process.env.GITHUB_REPOSITORY_OWNER_ID } },
          resolvedDependencies: [
            { uri: `git+https://github.com/Yangjunjie-Lin/Scanly@${sourceCommit}`, digest: { gitCommit: sourceCommit } },
            { uri: `git+https://github.com/Yangjunjie-Lin/Scanly@${workflowGitRef}`, digest: { gitCommit: process.env.GITHUB_SHA } },
          ],
        },
        runDetails: { builder: { id: "https://github.com/actions/runner/github-hosted" }, metadata: { invocationId } },
      },
    };
    const bundle = await sigstore.attest(Buffer.from(JSON.stringify(statement)), "application/vnd.in-toto+json");
    await sigstore.verify(bundle);
    const provenanceFile = `${packed.filename}.sigstore.json`;
    const serialized = JSON.stringify(bundle, null, 2) + "\n";
    fs.writeFileSync(path.join(output, "provenance", provenanceFile), serialized);
    records.push({ name: manifest.name, version, filename: packed.filename, size: bytes.length, sha256: sha(bytes), sha512: sha(bytes, "sha512"), integrity: packed.integrity, provenanceFile, provenanceSha256: sha(serialized), purl });
  }
}
assert.equal(records.length, 11);
assert.ok(records.some((record) => record.name === "@scanly/url-safety"));
const report = { schemaVersion: "scanly-v2.1-npm-build-1", version, sourceCommit, sourceTree, workflowDefinitionCommit: process.env.GITHUB_SHA, workflowRef, buildLabel: process.env.BUILD_LABEL, runId: Number(process.env.GITHUB_RUN_ID), runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT), invocationId, nodeVersion: process.version, npmVersion, repositoryDirty: false, published: false, artifacts: records.sort((a, b) => a.name.localeCompare(b.name)) };
fs.writeFileSync(path.join(output, "build.json"), JSON.stringify(report, null, 2) + "\n");
fs.writeFileSync(path.join(output, "checksums.sha256"), records.map((record) => `${record.sha256}  npm/${record.filename}`).sort().join("\n") + "\n");
console.log(`Prepared ${records.length} exact npm artifacts and verified detached Sigstore bundles; no package was published.`);
