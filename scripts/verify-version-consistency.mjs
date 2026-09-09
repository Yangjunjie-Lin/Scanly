import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const rootManifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const expected = rootManifest.version;
if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(expected)) {
  throw new Error(`Root package version '${expected}' is not a stable SemVer.`);
}
const workspaceRoots = ["apps", "packages", "engines"];
const manifests = ["package.json"];

for (const workspaceRoot of workspaceRoots) {
  const absolute = path.join(root, workspaceRoot);
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    if (entry.isDirectory() && fs.existsSync(path.join(absolute, entry.name, "package.json"))) {
      manifests.push(path.posix.join(workspaceRoot, entry.name, "package.json"));
    }
  }
}

for (const relative of manifests) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
  if (manifest.version !== expected) throw new Error(`${relative}: version ${manifest.version} is not ${expected}.`);
  for (const section of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
    for (const [name, version] of Object.entries(manifest[section] ?? {})) {
      if (name.startsWith("@scanly/") && version !== expected) {
        throw new Error(`${relative}: ${section}.${name}=${version} is not ${expected}.`);
      }
    }
  }
}

const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
if (lock.version !== expected || lock.packages?.[""]?.version !== expected) {
  throw new Error(`package-lock.json root version is not ${expected}.`);
}
for (const relative of manifests) {
  const lockKey = relative === "package.json" ? "" : relative.replace(/\/package\.json$/, "");
  if (lock.packages?.[lockKey]?.version !== expected) {
    throw new Error(`package-lock.json workspace '${lockKey}' is not ${expected}.`);
  }
}

for (const relative of ["native/android/scanly-sdk/build.gradle.kts", "native/ios/Package.swift", "README.md", "CHANGELOG.md"]) {
  const content = fs.readFileSync(path.join(root, relative), "utf8");
  if (relative.endsWith("build.gradle.kts") && !content.includes(`version = \"${expected}\"`)) throw new Error(`${relative}: native Maven version is stale.`);
  if (relative === "README.md" && !content.includes(`SDK-${expected}-green`)) throw new Error("README Stable badge is stale.");
  if (relative === "CHANGELOG.md" && !content.includes(`## ${expected}`)) throw new Error("CHANGELOG is missing the Stable version.");
}
const stableRoot = expected === "2.0.0" ? "release/stable" : `release/stable/v${expected}`;
if (fs.existsSync(path.join(root, stableRoot))) {
  for (const relative of [`${stableRoot}/v${expected}-manifest.json`, `${stableRoot}/artifact-manifest.json`, `${stableRoot}/sbom.cdx.json`, `${stableRoot}/license-inventory.json`]) {
    const metadata = JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
    const metadataVersion = metadata.metadata?.component?.version ?? metadata.version ?? metadata.identity?.version;
    if (metadataVersion !== expected) throw new Error(`${relative}: Stable version metadata is stale.`);
  }
}

console.log(`Version consistency passed for ${manifests.length} manifests at ${expected}.`);
