import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const canonical = "release/stable/v2.1.0";
const qualificationFile = `${canonical}/qualification-input.json`;
const qualification = JSON.parse(fs.readFileSync(qualificationFile, "utf8"));
const deployment = JSON.parse(fs.readFileSync(`${canonical}/evidence/deployment-input.json`, "utf8"));
assert.equal(qualification.version, "2.1.0");
assert.equal(deployment.sourceCommit, qualification.sourceCommit);
const env = { ...process.env, STABLE_RELEASE_VERSION: "2.1.0", STABLE_SOURCE_COMMIT: qualification.sourceCommit, STABLE_SOURCE_TREE: qualification.sourceTree, STABLE_QUALIFICATION_RECORD: qualificationFile, STABLE_DEPLOYMENT_ID: deployment.id, STABLE_DEPLOYMENT_URL: `https://${deployment.url}`, STABLE_PRODUCTION_ALIAS: "https://qr-decoder-theta.vercel.app", STABLE_DEPLOYMENT_COMMIT: deployment.sourceCommit };
delete env.STABLE_OUTPUT_ROOT;
const base = fs.mkdtempSync(path.join(root, "release-dist", "v2.1-metadata-"));
const hash = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const generate = (output) => execFileSync(process.execPath, ["scripts/generate-stable-release-manifest.mjs"], { env: { ...env, ...(output ? { STABLE_OUTPUT_ROOT: path.relative(root, output) } : {}) }, stdio: "inherit" });
const build = (label) => {
  const output = path.join(base, label);
  fs.mkdirSync(output);
  for (const directory of ["artifacts", "evidence"]) fs.cpSync(`${canonical}/${directory}`, path.join(output, directory), { recursive: true, errorOnExist: true });
  for (const file of ["qualification-input.json", "android-build-evidence.json"]) fs.copyFileSync(`${canonical}/${file}`, path.join(output, file));
  generate(output);
  return output;
};
const confirm = (a, b) => execFileSync(process.execPath, ["scripts/confirm-stable-metadata-reproducibility.mjs", `--build-a-dir=${a}`, `--build-b-dir=${b}`], { env, stdio: "inherit" });
const preliminaryA = build("preliminary-A");
const preliminaryB = build("preliminary-B");
confirm(preliminaryA, preliminaryB);
qualification.gates.native.sha256 = hash(`${canonical}/android-build-evidence.json`);
fs.writeFileSync(qualificationFile, JSON.stringify(qualification, null, 2) + "\n");
generate();
const finalA = build("final-A");
const finalB = build("final-B");
confirm(finalA, finalB);
assert.equal(qualification.gates.native.sha256, hash(`${canonical}/android-build-evidence.json`), "Final metadata confirmation unexpectedly changed the bound Native evidence");
generate();
const evidence = JSON.parse(fs.readFileSync(`${canonical}/android-build-evidence.json`, "utf8"));
for (const file of evidence.metadataCleanBuilds.comparedFiles) {
  assert.equal(hash(path.join(finalA, file)), hash(path.join(finalB, file)), `Final builds differ: ${file}`);
  assert.equal(hash(path.join(finalA, file)), hash(`${canonical}/${file}`), `Selected canonical metadata differs: ${file}`);
}
execFileSync(process.execPath, ["scripts/verify-stable-manifest.mjs", "--require-go"], { env, stdio: "inherit" });
console.log(`V2_1_FINAL_METADATA_REPRODUCIBILITY_GO: both final GO outputs and selected canonical bytes match (${evidence.metadataCleanBuilds.comparedFiles.length} files). Independent build directories: ${base}`);
