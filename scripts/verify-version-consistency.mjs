import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const expected = "2.0.0-rc.2";
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

const lock = fs.readFileSync(path.join(root, "package-lock.json"), "utf8");
if (lock.includes("2.0.0-beta.4")) throw new Error("package-lock.json retains a Beta 4 workspace version.");

for (const relative of ["native/android/scanly-sdk/build.gradle.kts", "native/ios/Package.swift", "README.md", "CHANGELOG.md"]) {
  const content = fs.readFileSync(path.join(root, relative), "utf8");
  if (relative.endsWith("build.gradle.kts") && !content.includes(`version = \"${expected}\"`)) throw new Error(`${relative}: native Maven version is stale.`);
  if (relative === "README.md" && !content.includes("SDK-2.0.0--rc.2")) throw new Error("README RC badge is stale.");
  if (relative === "CHANGELOG.md" && !content.includes(expected)) throw new Error("CHANGELOG is missing the RC2 version.");
}
for (const relative of ["release/rc2/dependency-freeze.json", "release/rc2/license-inventory.json", "release/rc2/rc2-candidate-manifest.template.json"]) {
  const metadata = JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
  if (metadata.version !== expected && metadata.identity?.version !== expected) throw new Error(`${relative}: RC2 version metadata is stale.`);
}

console.log(`Version consistency passed for ${manifests.length} manifests at ${expected}.`);
