import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const verifyOnly = process.argv.includes("--verify");
const sourceCommit = process.env.RC2_SOURCE_COMMIT ?? execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const sourceTree = process.env.RC2_SOURCE_TREE ?? execFileSync("git", ["rev-parse", "HEAD^{tree}"], { cwd: root, encoding: "utf8" }).trim();
const artifactRoot = process.env.RC2_ARTIFACT_ROOT ? path.resolve(process.env.RC2_ARTIFACT_ROOT) : path.join(root, "release/rc2/artifacts");
const files = [];
const visit = (directory) => {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) visit(absolute);
    else files.push(path.relative(artifactRoot, absolute));
  }
};
visit(artifactRoot);
const artifacts = files.sort().map((relative) => {
  const absolute = path.join(artifactRoot, relative);
  const data = fs.readFileSync(absolute);
  const normalized = relative.replaceAll("\\", "/");
  const platform = normalized.startsWith("android/") ? "android" : normalized.startsWith("ios/") ? "ios" : normalized.startsWith("native/") ? "native-core" : "npm";
  return { artifact: normalized, platform, sha256: crypto.createHash("sha256").update(data).digest("hex"), size: data.length, status: "built" };
});
const manifest = {
  schemaVersion: "rc2-artifact-manifest-1",
  sourceCommit,
  sourceTree,
  version: "2.0.0-rc.2",
  buildWorkflow: process.env.GITHUB_WORKFLOW ?? "local",
  buildRun: process.env.GITHUB_RUN_ID ?? "local",
  toolchain: { node: process.version, runner: process.env.RUNNER_OS ?? process.platform },
  artifacts,
  signing: "SIGNING_NOT_YET_PRODUCTION",
};
const output = process.env.RC2_ARTIFACT_MANIFEST_OUTPUT ? path.resolve(process.env.RC2_ARTIFACT_MANIFEST_OUTPUT) : path.join(root, "release/rc2/artifact-manifest.json");
if (verifyOnly) {
  const frozen = JSON.parse(fs.readFileSync(output, "utf8"));
  if (frozen.schemaVersion !== "rc2-artifact-manifest-1" || frozen.version !== "2.0.0-rc.2") {
    throw new Error("Frozen RC2 Artifact Manifest identity is invalid.");
  }
  if (frozen.sourceCommit !== sourceCommit || frozen.sourceTree !== sourceTree) {
    throw new Error("Frozen RC2 Artifact Manifest source identity does not match the requested Product Source.");
  }
  const comparable = (entries) => entries.map(({ artifact, platform, sha256, size, status }) => ({ artifact, platform, sha256, size, status }));
  if (JSON.stringify(comparable(frozen.artifacts)) !== JSON.stringify(comparable(artifacts))) {
    throw new Error("Rebuilt RC2 artifact hashes, sizes, or paths do not match the frozen Artifact Manifest.");
  }
  console.log(`Verified ${artifacts.length} frozen RC2 artifact identities without rewriting historical evidence.`);
  process.exit(0);
}
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${path.relative(root, output)} with ${artifacts.length} artifacts.`);
