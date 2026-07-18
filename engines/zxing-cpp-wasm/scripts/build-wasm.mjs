import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const source = require.resolve("zxing-wasm/reader/zxing_reader.wasm");
const destination = path.join(root, "wasm", "zxing-cpp.wasm");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const bytes = fs.readFileSync(source);
const expectedStandardSha256 = "6a858c01e076bab3a1bd413e4f2cf5e5e45f819a0d9441d83c66993bc48ed38f";
if (sha256(bytes) !== expectedStandardSha256) {
  throw new Error(`Pinned zxing-wasm reader hash mismatch: expected ${expectedStandardSha256}, received ${sha256(bytes)}.`);
}
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.copyFileSync(source, destination);

const metadataPath = path.join(root, "wasm", "metadata.json");
const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
metadata.assets.standard = { ...metadata.assets.standard, available: true, sha256: sha256(bytes), bytes: bytes.byteLength, simd: false };
const simdPath = path.join(root, "wasm", "zxing-cpp-simd.wasm");
if (fs.existsSync(simdPath)) {
  const simd = fs.readFileSync(simdPath);
  metadata.assets.simd = { ...metadata.assets.simd, available: true, sha256: sha256(simd), bytes: simd.byteLength, simd: true };
} else {
  metadata.assets.simd = { file: "zxing-cpp-simd.wasm", available: false, sha256: null, bytes: 0, simd: true };
}
fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
console.log(`Installed pinned reader WASM (${bytes.byteLength} bytes, sha256 ${sha256(bytes)}).`);
