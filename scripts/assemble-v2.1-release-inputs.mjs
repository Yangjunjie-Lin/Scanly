import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const root = process.cwd();
const source = process.argv.find((arg) => arg.startsWith("--source="))?.slice(9);
assert.match(source ?? "", /^[a-f0-9]{40}$/);
const target = "release/stable/v2.1.0";
assert.ok(!fs.existsSync(target), "Never overwrite an existing candidate or released record");
assert.notEqual(spawnSync("git", ["show-ref", "--verify", "--quiet", "refs/tags/v2.1.0"]).status, 0, "The release tag already exists");
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const tree = git("show", "-s", "--format=%T", source);
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const digest = (file, algorithm = "sha256") => crypto.createHash(algorithm).update(fs.readFileSync(file)).digest("hex");
const write = (name, data) => fs.writeFileSync(`${target}/${name}`, JSON.stringify(data, null, 2) + "\n");
const software = read("release-dist/v2.1-software-evidence.json");
const repro = read("release-dist/v2.1-npm-reproducibility.json");
const native = read("release-dist/v2.1-candidate/android-build-evidence.json");
const security = read("release-dist/v2.1-source-ci-evidence/development/url-safety-security.json");
const oidc = read("release-dist/v2.1-oidc-qualified/npm-oidc-qualification.json");
const deployment = read("release-dist/v2.1-deployment-evidence.json");
for (const data of [software, repro, native, security, deployment]) assert.equal(data.sourceCommit, source);
assert.equal(software.status, "PASS"); assert.equal(software.runs.length, 8);
assert.ok(software.runs.every((run) => run.headSha === source && run.conclusion === "success"));
assert.equal(repro.status, "PASS"); assert.equal(repro.rawBuildAEqualsBuildB, true); assert.equal(repro.packageCount, 11);
assert.equal(native.status, "GO"); assert.equal(native.normalizedBuildAEqualsBuildB, true);
assert.notEqual(native.cleanBuildA.runId, native.cleanBuildB.runId);
assert.equal(security.result, "URL_SAFETY_SECURITY_GO"); assert.equal(security.repositoryDirty, false);
assert.equal(oidc.existingTenAccepted, true); assert.equal(oidc.configurationModified, false);
assert.equal(deployment.readyState, "READY"); assert.equal(deployment.target, "production");
assert.ok(deployment.alias.includes("qr-decoder-theta.vercel.app"));
const npmCli = process.env.NPM_CLI_PATH;
assert.ok(npmCli, "NPM_CLI_PATH is required");
const runNpm = (...args) => execFileSync(process.execPath, [npmCli, ...args], { encoding: "utf8" }).trim();
const account = runNpm("whoami", "--fetch-retries=0", "--fetch-timeout=15000");
assert.equal(account, "yangjunjielin");
assert.equal(JSON.parse(runNpm("org", "ls", "scanly", "--json", "--fetch-retries=0", "--fetch-timeout=15000"))[account], "owner");
const probeTag = "60d17d680d457103be803e2e0f789320b1a00521";
assert.equal(git("cat-file", "-t", probeTag), "tag"); assert.equal(git("rev-parse", `${probeTag}^{}`), source);
const signature = execFileSync("git", ["-c", "gpg.ssh.allowedSignersFile=release-dist/v2.1-signing/allowed-signers", "verify-tag", probeTag], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
void signature;
const signingKeys = JSON.parse(execFileSync("gh", ["api", "user/ssh_signing_keys"], { encoding: "utf8" }));
const signingKey = signingKeys.find((key) => key.id === 1118906);
assert.ok(signingKey?.key && fs.readFileSync("release-dist/v2.1-signing/allowed-signers", "utf8").includes(signingKey.key));
const bootstrapArtifact = read("release-dist/v2.1-build-A/build.json").artifacts.find((artifact) => artifact.name === "@scanly/url-safety");
const bootstrapProof = repro.detachedProvenanceVerified.find((proof) => proof.package === "@scanly/url-safety");
assert.ok(bootstrapArtifact && bootstrapProof);
assert.equal(bootstrapArtifact.sha256, bootstrapProof.artifactSha256);
const requireNpm = createRequire(npmCli);
const { verifyProvenance } = requireNpm(path.join(path.dirname(requireNpm.resolve("libnpmpublish")), "provenance.js"));
const bundle = await verifyProvenance({ name: bootstrapArtifact.purl, digest: { sha512: bootstrapArtifact.sha512 } }, bootstrapProof.file);
await requireNpm("sigstore").verify(bundle, { certificateIssuer: "https://token.actions.githubusercontent.com", certificateIdentityURI: bootstrapProof.certificateIdentity });

fs.mkdirSync(`${target}/evidence`, { recursive: true });
fs.cpSync("release-dist/v2.1-candidate/artifacts", `${target}/artifacts`, { recursive: true, errorOnExist: true });
for (const name of ["sbom.cdx.json", "license-inventory.json", "android-build-evidence.json"]) fs.copyFileSync(`release-dist/v2.1-candidate/${name}`, `${target}/${name}`);
const evidenceFiles = {
  "software.json": "release-dist/v2.1-software-evidence.json",
  "security.json": "release-dist/v2.1-source-ci-evidence/development/url-safety-security.json",
  "url-safety-tests.json": "release-dist/v2.1-source-ci-evidence/development/url-safety-tests.json",
  "url-safety-benchmark.json": "release-dist/v2.1-source-ci-evidence/development/url-safety-benchmark.json",
  "npm-reproducibility.json": "release-dist/v2.1-npm-reproducibility.json",
  "npm-build-run.json": "release-dist/v2.1-npm-run-evidence.json",
  "native-build-a.json": "release-dist/v2.1-native-A-run.json",
  "native-build-b.json": "release-dist/v2.1-native-B-run.json",
  "npm-oidc-qualification.json": "release-dist/v2.1-oidc-qualified/npm-oidc-qualification.json",
  "deployment-input.json": "release-dist/v2.1-deployment-evidence.json",
  "allowed-signers": "release-dist/v2.1-signing/allowed-signers",
};
for (const [name, file] of Object.entries(evidenceFiles)) fs.copyFileSync(file, `${target}/evidence/${name}`);
fs.writeFileSync(`${target}/evidence/signing-probe.tag`, execFileSync("git", ["cat-file", "tag", probeTag]));
const signingEvidence = { scheme: "SSH_ED25519", githubAccount: "Yangjunjie-Lin", githubSigningKeyId: signingKey.id, publicKeyFingerprint: "SHA256:1odyhkHV3hKHFlE8QrELlBGMM/qlM5ftmiiVym/M6ck", publicKeyRegisteredAt: signingKey.created_at, localSmokeTest: { status: "PASS", annotatedTagObjectCreated: true, sshSignatureBlockPresent: true, temporaryTagDeleted: true, tagObject: probeTag } };
write("evidence/signing.json", { status: "PASS", sourceCommit: source, evidence: signingEvidence });
write("evidence/api-abi.json", { status: "PASS", sourceCommit: source, publicApi: { path: "api-snapshots/public-api.json", sha256: digest("api-snapshots/public-api.json") }, nativeApi: { path: "api-snapshots/native-api.json", sha256: digest("api-snapshots/native-api.json") }, nativeAbi: { path: "api-snapshots/native-abi.json", sha256: digest("api-snapshots/native-abi.json") } });
const publisherPackages = oidc.results.filter((entry) => entry.status === "OIDC_TOKEN_EXCHANGE_ACCEPTED").map((entry) => entry.package);
assert.equal(publisherPackages.length, 10);
const npmPublicationEvidence = {
  registry: "https://registry.npmjs.org/", account, organization: "scanly", organizationRole: "owner", trustedPublisherStatus: "AVAILABLE_WITH_QUALIFIED_BOOTSTRAP", trustedPublisherPackageCount: 10, trustedPublisherPackages: publisherPackages,
  repository: "Yangjunjie-Lin/Scanly", workflowFile: "stable-npm-publish.yml", secretValueRecorded: false, provenanceWorkflow: ".github/workflows/stable-npm-publish.yml", provenanceMechanism: "GITHUB_ACTIONS_OIDC", qualificationRun: oidc.runId,
  bootstrap: { package: "@scanly/url-safety", version: "2.1.0", sourceCommit: source, method: "INTERACTIVE_NPM_PROVENANCE_FILE", cliAuthenticatedAccount: account, interactiveTwoFactorRequired: true, npmCredentialSharedWithCI: false, provenanceVerified: true, signedReleaseTagRequired: true, placeholderVersionAllowed: false, artifactPath: `${target}/artifacts/npm/${bootstrapArtifact.filename}`, provenancePath: `${target}/artifacts/provenance/${bootstrapArtifact.provenanceFile}`, artifactSha256: bootstrapArtifact.sha256, artifactSha512: bootstrapArtifact.sha512, provenanceSha256: bootstrapArtifact.provenanceSha256 },
};
write("evidence/publication-credentials-input.json", { status: "PASS", sourceCommit: source, checkedAt: new Date().toISOString(), evidence: npmPublicationEvidence, publicationPerformed: false });
const gate = (file) => ({ status: "PASS", sourceCommit: source, path: `${target}/${file}`, sha256: digest(`${target}/${file}`) });
const qualification = { schemaVersion: "scanly-release-qualification-1", version: "2.1.0", sourceCommit: source, sourceTree: tree,
  gates: { software: gate("evidence/software.json"), apiAbi: gate("evidence/api-abi.json"), security: gate("evidence/security.json"), sbom: gate("sbom.cdx.json"), licenses: gate("license-inventory.json"), native: gate("android-build-evidence.json"), npmReproducibility: gate("evidence/npm-reproducibility.json"), signing: gate("evidence/signing.json"), publicationCredentials: gate("evidence/publication-credentials-input.json"), deployment: gate("evidence/deployment-input.json") },
  signingEvidence, npmPublicationEvidence, npmReproducibility: repro,
};
write("qualification-input.json", qualification);
console.log(`Prepared source-bound qualification inputs at ${target}. No signed release tag or publication was created.`);
