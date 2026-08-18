import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const metadata = JSON.parse(fs.readFileSync(path.join(root, "wasm", "metadata.json"), "utf8"));
const runtimeMetadata = fs.readFileSync(path.join(root, "src", "metadata.ts"), "utf8");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
for (const [variant, asset] of Object.entries(metadata.assets)) {
  const file = path.join(root, "wasm", asset.file);
  if (!asset.available) {
    if (fs.existsSync(file)) throw new Error(`${variant} is marked unavailable but its asset exists.`);
    continue;
  }
  if (!fs.existsSync(file)) throw new Error(`Missing ${variant} WASM asset.`);
  const bytes = fs.readFileSync(file);
  if (!WebAssembly.validate(bytes)) throw new Error(`${variant} asset is not valid WebAssembly.`);
  if (bytes.byteLength !== asset.bytes || sha256(bytes) !== asset.sha256) throw new Error(`${variant} asset metadata mismatch.`);
  if (!runtimeMetadata.includes(asset.sha256) || !runtimeMetadata.includes(String(asset.bytes).replace(/\B(?=(\d{3})+(?!\d))/g, "_"))) {
    throw new Error(`${variant} runtime metadata is not synchronized with wasm/metadata.json.`);
  }
}
for (const required of metadata.licenseFiles) if (!fs.existsSync(path.join(root, required))) throw new Error(`Missing ${required}.`);
console.log("ZXing-C++ WASM metadata and hashes verified.");
