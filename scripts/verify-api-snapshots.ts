import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const snapshotPath = path.join(root, "api-snapshots", "public-api.json");
const packageRoots = ["packages/core", "packages/browser", "packages/node", "packages/react", "packages/scenario-schema", "packages/parsers", "packages/benchmark", "engines/jsqr", "engines/zxing-js"];

function files(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? files(path.join(directory, entry.name)) : entry.name.endsWith(".d.ts") ? [path.join(directory, entry.name)] : []);
}

function hash(value: string): string { return crypto.createHash("sha256").update(value.replace(/\r\n/g, "\n")).digest("hex"); }

const packages = packageRoots.map((packageRoot) => {
  const dist = path.join(root, packageRoot, "dist");
  if (!fs.existsSync(dist)) throw new Error(`Missing declarations for ${packageRoot}; run npm run build:packages first.`);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, packageRoot, "package.json"), "utf8")) as { name: string; version: string; exports?: unknown; types?: string };
  return {
    packageName: manifest.name,
    packageVersion: manifest.version,
    exports: manifest.exports,
    types: manifest.types,
    declarationHashes: Object.fromEntries(files(dist).sort().map((file) => [path.relative(dist, file).replaceAll("\\", "/"), hash(fs.readFileSync(file, "utf8"))])),
  };
});
const snapshot = { schemaVersion: "2.0", packages };

function readableDiff(expected: typeof snapshot, actual: typeof snapshot): string[] {
  const lines: string[] = [];
  const names = new Set([...expected.packages.map((entry) => entry.packageName), ...actual.packages.map((entry) => entry.packageName)]);
  for (const name of [...names].sort()) {
    const before = expected.packages.find((entry) => entry.packageName === name);
    const after = actual.packages.find((entry) => entry.packageName === name);
    if (!before) { lines.push(`+ ${name}`); continue; }
    if (!after) { lines.push(`- ${name}`); continue; }
    for (const declaration of new Set([...Object.keys(before.declarationHashes), ...Object.keys(after.declarationHashes)])) {
      if (before.declarationHashes[declaration] !== after.declarationHashes[declaration]) lines.push(`~ ${name}: ${declaration}`);
    }
    if (JSON.stringify(before.exports) !== JSON.stringify(after.exports) || before.types !== after.types || before.packageVersion !== after.packageVersion) lines.push(`~ ${name}: package metadata`);
  }
  return lines;
}

if (process.argv.includes("--update")) {
  fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
  fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2) + "\n");
  console.log(`Updated ${snapshotPath}`);
} else {
  if (!fs.existsSync(snapshotPath)) throw new Error("Public API snapshot is missing; intentional API changes require npm run api:update.");
  const expected = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
  if (JSON.stringify(expected) !== JSON.stringify(snapshot)) {
    const details = expected.schemaVersion === "2.0" ? readableDiff(expected, snapshot) : ["~ snapshot schema upgraded to 2.0"];
    if (process.argv.includes("--diff")) { console.log(details.join("\n")); process.exit(0); }
    throw new Error(`Public API declarations changed:\n${details.join("\n")}\nReview the API diff and run npm run api:update only for an intentional Alpha API change.`);
  }
  console.log("Public API declaration snapshot passed.");
}
