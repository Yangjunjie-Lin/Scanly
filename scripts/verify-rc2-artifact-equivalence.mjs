import fs from "node:fs";
import path from "node:path";
import { canonicalNpmTarballSha256, NPM_CANONICALIZATION_POLICY } from "./release-artifact-canonicalization.mjs";

const root = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const value = (name, fallback) => args.find((entry) => entry.startsWith(`${name}=`))?.slice(name.length + 1)
  ?? (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const artifactRoot = path.resolve(value("--artifact-root", process.env.RC2_ARTIFACT_ROOT ?? "release/rc2/artifacts"));
const manifestPath = path.resolve(root, value("--manifest", "release/rc2/artifact-manifest.v2.json"));
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

if (manifest.schemaVersion !== "rc2-artifact-manifest-2") throw new Error("RC2 Artifact Manifest v2 schema mismatch.");
if (JSON.stringify(manifest.npmCanonicalization) !== JSON.stringify(NPM_CANONICALIZATION_POLICY)) throw new Error("npm canonicalization policy mismatch.");
const expected = manifest.artifacts.filter((entry) => entry.platform === "npm");
const npmRoot = path.join(artifactRoot, "npm");
const actualNames = fs.readdirSync(npmRoot).filter((name) => name.endsWith(".tgz")).sort();
const expectedNames = expected.map((entry) => path.basename(entry.artifact)).sort();
if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) throw new Error("Rebuilt npm artifact filename set does not match the Candidate.");
for (const entry of expected) {
  const archive = path.join(npmRoot, path.basename(entry.artifact));
  const digest = canonicalNpmTarballSha256(archive);
  if (digest !== entry.canonicalContentSha256) throw new Error(`Canonical npm package content mismatch: ${entry.artifact}`);
}
console.log(`RC2_ARTIFACT_CANONICAL_EQUIVALENCE_GO packages=${expected.length} source=${manifest.productSourceCommit}`);
