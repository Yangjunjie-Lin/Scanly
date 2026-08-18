import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const rootManifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const canonicalRepository = "git+https://github.com/Yangjunjie-Lin/Scanly.git";
const canonicalHomepage = "https://github.com/Yangjunjie-Lin/Scanly#readme";
const canonicalBugs = "https://github.com/Yangjunjie-Lin/Scanly/issues";
const expectedPackages = new Set([
  "@scanly/parsers",
  "@scanly/scenario-schema",
  "@scanly/benchmark",
  "@scanly/core",
  "@scanly/engine-jsqr",
  "@scanly/engine-zxing-js",
  "@scanly/engine-zxing-cpp-wasm",
  "@scanly/browser",
  "@scanly/node",
  "@scanly/react",
]);

if (rootManifest.name !== "scanly" || rootManifest.private !== true) {
  throw new Error("The monorepo root must remain private package 'scanly'.");
}

const manifests = [];
for (const workspaceRoot of ["apps", "packages", "engines"]) {
  const directory = path.join(root, workspaceRoot);
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const manifestPath = path.join(directory, entry.name, "package.json");
    if (!entry.isDirectory() || !fs.existsSync(manifestPath)) continue;
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    if (manifest.private !== true) manifests.push({ manifest, manifestPath });
  }
}

const actualNames = new Set(manifests.map(({ manifest }) => manifest.name));
for (const name of expectedPackages) {
  if (!actualNames.has(name)) throw new Error(`Missing publishable package '${name}'.`);
}
for (const name of actualNames) {
  if (!expectedPackages.has(name)) throw new Error(`Unexpected publishable package '${name}'.`);
}

for (const { manifest, manifestPath } of manifests) {
  const relativeManifest = path.relative(root, manifestPath).replaceAll("\\", "/");
  const directory = path.posix.dirname(relativeManifest);
  const fail = (message) => { throw new Error(`${relativeManifest}: ${message}`); };

  if (manifest.version !== rootManifest.version) fail(`version must match root ${rootManifest.version}.`);
  if (manifest.license !== "MIT") fail("license must be MIT.");
  if (typeof manifest.description !== "string" || manifest.description.trim().length < 20) fail("description is missing or too short.");
  if (!Array.isArray(manifest.keywords) || manifest.keywords.length < 4 || manifest.keywords.some((value) => typeof value !== "string" || !value.trim())) fail("keywords must contain at least four non-empty values.");
  if (manifest.repository?.type !== "git" || manifest.repository?.url !== canonicalRepository) fail("repository must use the canonical Git URL.");
  if (manifest.repository?.directory !== directory) fail(`repository.directory must be '${directory}'.`);
  if (!fs.existsSync(path.join(root, manifest.repository.directory, "package.json"))) fail("repository.directory does not resolve to a package manifest.");
  if (manifest.homepage !== canonicalHomepage) fail("homepage must point to the canonical repository README.");
  if (manifest.bugs?.url !== canonicalBugs) fail("bugs.url must point to the canonical issue tracker.");
  if (!Array.isArray(manifest.files) || !manifest.files.includes("dist") || !manifest.files.includes("README.md")) fail("files must include dist and README.md.");
  if (!manifest.exports || typeof manifest.exports !== "object" || !("." in manifest.exports)) fail("exports must define the package root.");
  if (!fs.existsSync(path.join(path.dirname(manifestPath), "README.md"))) fail("README.md is missing.");
}

console.log(`Verified canonical metadata for ${manifests.length} publishable Scanly packages at version ${rootManifest.version}.`);
