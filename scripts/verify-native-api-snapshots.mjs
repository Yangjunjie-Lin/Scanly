import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const snapshotPath = path.join(root, "api-snapshots/native-api.json");
const sources = [
  "native/core/include/scanly/core.h",
  "native/ios/Sources/ScanlySDK/ScanlyTypes.swift",
  "native/ios/Sources/ScanlySDK/ScanlyDecoder.swift",
  "native/ios/Sources/ScanlySDK/ScanlyScannerSession.swift",
  "native/android/scanly-sdk/src/main/java/io/scanly/sdk/ScanlyTypes.kt",
  "native/android/scanly-sdk/src/main/java/io/scanly/sdk/ScanlyDecoder.kt",
  "native/android/scanly-sdk/src/main/java/io/scanly/sdk/ScanlyScannerSession.kt",
  "native/android/scanly-sdk/src/main/java/io/scanly/sdk/ScanlyCameraXAdapter.kt",
];

const hash = (value) => crypto.createHash("sha256").update(value.replaceAll("\r\n", "\n")).digest("hex");
const snapshot = {
  schemaVersion: "stable-native-api-snapshot-1",
  sdkVersion: "2.0.0",
  classification: "stable-breaking-changes-forbidden-with-explicit-compatibility-review",
  files: Object.fromEntries(sources.map((relative) => [relative, hash(fs.readFileSync(path.join(root, relative), "utf8"))])),
};

if (process.argv.includes("--update")) {
  fs.writeFileSync(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(`Updated ${path.relative(root, snapshotPath)}.`);
} else {
  if (!fs.existsSync(snapshotPath)) throw new Error("Native API snapshot is missing; run npm run native:api:update after review.");
  const expected = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
  if (JSON.stringify(expected) !== JSON.stringify(snapshot)) {
    const changed = sources.filter((relative) => expected.files?.[relative] !== snapshot.files[relative]);
    throw new Error(`Native API changed in: ${changed.join(", ")}. Review compatibility and run npm run native:api:update explicitly.`);
  }
  console.log("Native C/Swift/Kotlin API snapshot passed.");
}
