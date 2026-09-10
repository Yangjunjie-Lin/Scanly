import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const lock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));
const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim();
const components = Object.entries(lock.packages as Record<string, { name?: string; version?: string; link?: boolean; license?: string; integrity?: string }>)
  .filter(([name, entry]) => name.includes("node_modules/") && !entry.link)
  .map(([location, entry]) => {
    const name = entry.name ?? location.slice(location.lastIndexOf("node_modules/") + "node_modules/".length);
    const installedPath = path.join(root, location, "package.json");
    const installed = fs.existsSync(installedPath) ? JSON.parse(fs.readFileSync(installedPath, "utf8")) : undefined;
    const license = entry.license ?? (installed?.version === entry.version ? installed.license : undefined);
    assert.ok(typeof license === "string" && license && !/NOASSERTION|UNKNOWN/i.test(license), `Unresolved license: ${name}@${entry.version}`);
    assert.ok(entry.version, `Unresolved version: ${name}`);
    return { name, version: entry.version, license, purl: `pkg:npm/${encodeURIComponent(name)}@${entry.version}`, location, integrity: entry.integrity };
  }).sort((a, b) => `${a.name}@${a.version}:${a.location}`.localeCompare(`${b.name}@${b.version}:${b.location}`));
const identity = { version: lock.version, sourceCommit: git("rev-parse", "HEAD"), sourceTree: git("rev-parse", "HEAD^{tree}"), repositoryDirty: !!git("status", "--porcelain"), packageLockSha256: createHash("sha256").update(fs.readFileSync("package-lock.json")).digest("hex") };
const unique = [...new Map(components.map((entry) => [entry.purl, entry])).values()];
const output = "benchmark-results/development/url-safety-sbom.cdx.json";
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify({ bomFormat: "CycloneDX", specVersion: "1.5", serialNumber: `urn:uuid:${randomUUID()}`, version: 1, metadata: { component: { type: "application", name: "scanly", version: lock.version }, properties: Object.entries(identity).map(([name, value]) => ({ name: `scanly:${name}`, value: String(value) })) }, components: unique.map((entry) => ({ type: "library", "bom-ref": entry.purl, name: entry.name, version: entry.version, purl: entry.purl, licenses: [{ expression: entry.license }] })) }, null, 2) + "\n");
fs.writeFileSync("benchmark-results/development/url-safety-licenses.json", JSON.stringify({ ...identity, status: "NPM_LICENSE_GO", unknownLicenseCount: 0, components, limitation: "Lockfile npm inventory including optional platforms. Native/Maven transitive build artifacts require separate release qualification." }, null, 2) + "\n");
console.log(`NPM_SBOM_GO / NPM_LICENSE_GO: ${unique.length} unique components; zero unknown licenses. Native release inventory is separate.`);
