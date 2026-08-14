import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const expected = "2.0.0-beta.5";
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

console.log(`Version consistency passed for ${manifests.length} manifests at ${expected}.`);
