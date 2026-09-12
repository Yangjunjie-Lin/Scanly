import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const rootManifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const version = process.env.STABLE_RELEASE_VERSION ?? rootManifest.version;
if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) throw new Error(`Stable version '${version}' is not a release SemVer.`);
const stableRelativeRoot = version === "2.0.0" ? "release/stable" : `release/stable/v${version}`;
const stableRoot = process.env.STABLE_OUTPUT_ROOT ? path.resolve(root, process.env.STABLE_OUTPUT_ROOT) : path.join(root, stableRelativeRoot);
const values = Object.fromEntries(process.argv.slice(2).map((argument) => {
  const equals = argument.indexOf("=");
  if (!argument.startsWith("--") || equals < 3) throw new Error(`Invalid argument '${argument}'.`);
  return [argument.slice(2, equals), argument.slice(equals + 1)];
}));
const directoryA = path.resolve(root, values["build-a-dir"] ?? "");
const directoryB = path.resolve(root, values["build-b-dir"] ?? "");
if (!values["build-a-dir"] || !values["build-b-dir"] || directoryA === directoryB) throw new Error("Distinct --build-a-dir and --build-b-dir are required.");

const comparedFiles = [
  "artifact-manifest.json",
  "sbom.cdx.json",
  "license-inventory.json",
  "physical-validation-status.json",
  "release-policy.json",
  "signing-manifest.json",
  "publication-credentials.json",
  "deployment.json",
  "reproducibility.json",
  `v${version}-manifest.json`,
  `v${version}-manifest.json.sha256`,
  "checksums.sha256",
  "artifacts/ios/Package.swift",
  "artifacts/native/scanly-core.h",
];
if (version === "2.1.0") {
  comparedFiles.push("qualification-input.json", "artifacts/provenance/scanly-url-safety-2.1.0.tgz.sigstore.json");
  const visit = (directory) => fs.readdirSync(path.join(directoryA, directory), { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? visit(`${directory}/${entry.name}`) : [`${directory}/${entry.name}`]);
  comparedFiles.push(...visit("evidence").sort());
}
const npmArtifacts = fs.readdirSync(path.join(directoryA, "artifacts", "npm"), { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".tgz"))
  .map((entry) => `artifacts/npm/${entry.name}`)
  .sort();
const expectedNpmCount = version === "2.0.0" || version === "2.0.1" ? 10 : 11;
if (npmArtifacts.length !== expectedNpmCount) throw new Error(`Expected ${expectedNpmCount} clean-build npm artifacts, found ${npmArtifacts.length}.`);
comparedFiles.push(...npmArtifacts);
const digest = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
for (const relative of comparedFiles) {
  const fileA = path.join(directoryA, relative);
  const fileB = path.join(directoryB, relative);
  if (!fs.existsSync(fileA) || !fs.existsSync(fileB)) throw new Error(`${relative}: clean-build output is missing.`);
  if (digest(fileA) !== digest(fileB)) throw new Error(`${relative}: clean-build metadata output differs.`);
}

const evidencePath = path.join(stableRoot, "android-build-evidence.json");
const evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
evidence.metadataCleanBuilds = {
  status: "GO",
  cleanBuildAEqualsBuildB: true,
  generator: "scripts/generate-stable-release-manifest.mjs",
  comparison: "EXACT_FILE_BYTES_MATCH",
  comparedFiles,
};
fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(`STABLE_METADATA_REPRODUCIBILITY_GO files=${comparedFiles.length}`);
