import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const manifestPath = path.join(root, "fixtures/native/manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const requiredFormats = new Set(["qr_code", "data_matrix", "pdf417", "code_128", "ean_13", "ean_8", "upc_a", "upc_e"]);

if (manifest.schemaVersion !== "beta5-native-fixtures-1") throw new Error("Native fixture schema mismatch.");
if (manifest.cornerOrder !== "top-left-top-right-bottom-right-bottom-left") throw new Error("Native corner ordering changed.");
if (manifest.geometryTolerancePixels !== 2) throw new Error("Native geometry tolerance must remain 2 px.");
if (!Array.isArray(manifest.fixtures) || manifest.fixtures.length !== 9) throw new Error("Native fixture suite must contain exactly 9 fixtures.");
if (!manifest.fixtures.some((fixture) => fixture.expectedResultCount > 1)) throw new Error("Native fixture suite lacks multi-result coverage.");

for (const fixture of manifest.fixtures) {
  const file = path.join(root, fixture.file);
  const bytes = fs.readFileSync(file);
  if (bytes.length !== fixture.rowStride * fixture.height) throw new Error(`${fixture.id}: Y8 byte length/layout mismatch.`);
  if (fixture.coordinateSpace !== "original-input-top-left-origin") throw new Error(`${fixture.id}: coordinate space mismatch.`);
  if (fixture.expectedResultCount !== fixture.requiredResults.length) throw new Error(`${fixture.id}: expected count/result list mismatch.`);
  for (const expected of fixture.requiredResults) requiredFormats.delete(expected.format);
}
if (requiredFormats.size) throw new Error(`Native fixtures miss formats: ${[...requiredFormats].join(", ")}`);

const checks = [
  ["iOS API snapshot", "api-snapshots/native-ios.txt", ["ScanlyDecoder", "ScanlyScannerSession", "ScanlyCameraAdapter", "ScanlyError"]],
  ["Android API snapshot", "api-snapshots/native-android.txt", ["ScanlyDecoder", "ScanlyScannerSession", "ScanlyCameraXAdapter", "ScanlyErrorCode"]],
  ["C ABI", "native/core/include/scanly/core.h", ["scanly_context_create", "scanly_context_destroy", "scanly_decode_y_plane", "scanly_result_set_destroy"]],
];
for (const [label, relative, symbols] of checks) {
  const content = fs.readFileSync(path.join(root, relative), "utf8");
  for (const symbol of symbols) if (!content.includes(symbol)) throw new Error(`${label} is missing ${symbol}.`);
  const digest = crypto.createHash("sha256").update(content.replaceAll("\r\n", "\n")).digest("hex");
  console.log(`${label}: ${digest}`);
}

console.log("Native fixture, geometry, ownership/API boundary contracts passed.");
