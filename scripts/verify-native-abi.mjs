import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const headerPath = path.join(root, "native/core/include/scanly/core.h");
const snapshotPath = path.join(root, "api-snapshots/native-abi.json");
const header = fs.readFileSync(headerPath, "utf8").replaceAll("\r\n", "\n");
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const abiVersion = Number(header.match(/SCANLY_ABI_VERSION\s*=\s*(\d+)/)?.[1] ?? 0);
if (!abiVersion) throw new Error("SCANLY_ABI_VERSION is missing from the C header.");

const exportedSymbols = [...header.matchAll(/SCANLY_CORE_API[\s\S]*?\b(scanly_[a-z0-9_]+)\s*\(/g)]
  .map((match) => match[1]).filter((value, index, values) => values.indexOf(value) === index).sort();
const enumValues = Object.fromEntries([...header.matchAll(/\b(SCANLY_[A-Z0-9_]+)\s*=\s*([^,}\n]+)/g)]
  .map((match) => [match[1], match[2].trim()]));
const structHashes = Object.fromEntries([...header.matchAll(/typedef\s+struct\s+(scanly_[a-z0-9_]+_t)\s*\{([\s\S]*?)\}\s*\1\s*;/g)]
  .map((match) => [match[1], hash(match[2].replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").trim())]));

const snapshot = {
  schemaVersion: "rc2-native-abi-snapshot-1",
  sdkVersion: "2.0.0-rc.2",
  abiVersion,
  exportedSymbols,
  enumValues,
  structHashes,
};

if (process.argv.includes("--update")) {
  fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
  fs.writeFileSync(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(`Updated ${path.relative(root, snapshotPath)}.`);
  process.exit(0);
}
if (!fs.existsSync(snapshotPath)) throw new Error("C ABI snapshot is missing; run npm run native:abi:update after review.");
const expected = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
if (JSON.stringify(expected) !== JSON.stringify(snapshot)) {
  const removed = (expected.exportedSymbols ?? []).filter((value) => !exportedSymbols.includes(value));
  const changedEnums = Object.keys(expected.enumValues ?? {}).filter((key) => expected.enumValues[key] !== enumValues[key]);
  const changedStructs = Object.keys(expected.structHashes ?? {}).filter((key) => expected.structHashes[key] !== structHashes[key]);
  throw new Error(`C ABI compatibility failure: removed symbols=${removed.join(",") || "none"}; changed enums=${changedEnums.join(",") || "none"}; changed structs=${changedStructs.join(",") || "none"}.`);
}
console.log("C ABI snapshot passed.");
