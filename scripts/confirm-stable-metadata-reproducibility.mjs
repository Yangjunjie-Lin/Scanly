import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const stableRoot = path.join(root, "release", "stable");
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
  "v2.0.0-manifest.json",
  "v2.0.0-manifest.json.sha256",
  "checksums.sha256",
  "artifacts/ios/Package.swift",
  "artifacts/native/scanly-core.h",
];
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
