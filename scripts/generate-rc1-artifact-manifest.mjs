import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const sourceCommit = process.env.RC1_SOURCE_COMMIT ?? execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const sourceTree = process.env.RC1_SOURCE_TREE ?? execFileSync("git", ["rev-parse", "HEAD^{tree}"], { cwd: root, encoding: "utf8" }).trim();
const artifactRoot = path.join(root, "release/rc1/artifacts");
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
const artifacts = files.map((relative) => {
  const absolute = path.join(artifactRoot, relative);
  const data = fs.readFileSync(absolute);
  const normalized = relative.replaceAll("\\", "/");
  const platform = normalized.startsWith("android/") ? "android" : normalized.startsWith("ios/") ? "ios" : normalized.startsWith("native/") ? "native-core" : "npm";
  return { artifact: normalized, platform, sha256: crypto.createHash("sha256").update(data).digest("hex"), size: data.length, status: "built" };
});
const manifest = { schemaVersion: "rc1-artifact-manifest-1", sourceCommit, sourceTree, version: "2.0.0-rc.1", buildWorkflow: process.env.GITHUB_WORKFLOW ?? "local", buildRun: process.env.GITHUB_RUN_ID ?? "local", toolchain: { node: process.version, runner: process.env.RUNNER_OS ?? process.platform }, artifacts, signing: "SIGNING_NOT_YET_PRODUCTION" };
const output = path.join(root, "release/rc1/artifact-manifest.json");
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${path.relative(root, output)} with ${artifacts.length} artifacts.`);
