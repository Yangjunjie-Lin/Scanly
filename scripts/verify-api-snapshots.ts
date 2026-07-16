import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const snapshotPath = path.join(root, "api-snapshots", "public-api.json");
const packageRoots = ["packages/core", "packages/browser", "packages/node", "packages/react", "packages/scenario-schema", "engines/jsqr", "engines/zxing-js"];

function files(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? files(path.join(directory, entry.name)) : entry.name.endsWith(".d.ts") ? [path.join(directory, entry.name)] : []);
}

function hash(value: string): string { return crypto.createHash("sha256").update(value.replace(/\r\n/g, "\n")).digest("hex"); }

const declarations = Object.fromEntries(packageRoots.flatMap((packageRoot) => {
  const dist = path.join(root, packageRoot, "dist");
  if (!fs.existsSync(dist)) throw new Error(`Missing declarations for ${packageRoot}; run npm run build:packages first.`);
  return files(dist).sort().map((file) => [path.relative(root, file).replaceAll("\\", "/"), hash(fs.readFileSync(file, "utf8"))]);
}));
const exports = Object.fromEntries(packageRoots.map((packageRoot) => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, packageRoot, "package.json"), "utf8")) as { name: string; version: string; exports?: unknown; types?: string };
  return [manifest.name, { version: manifest.version, exports: manifest.exports, types: manifest.types }];
}));
const snapshot = { schemaVersion: "1.0", declarations, exports };

if (process.argv.includes("--update")) {
  fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
  fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2) + "\n");
  console.log(`Updated ${snapshotPath}`);
} else {
  if (!fs.existsSync(snapshotPath)) throw new Error("Public API snapshot is missing; intentional API changes require npm run api:update.");
  const expected = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
  if (JSON.stringify(expected) !== JSON.stringify(snapshot)) throw new Error("Public API declarations changed. Review the API diff and run npm run api:update only for an intentional Alpha API change.");
  console.log("Public API declaration snapshot passed.");
}
