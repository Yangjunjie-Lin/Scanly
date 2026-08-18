import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { TextDecoder } from "node:util";

const root = path.resolve(import.meta.dirname, "..");
const manifestArgument = process.argv[2] ?? "release/rc2/rc2-candidate-manifest.v2.json";
const manifestPath = path.resolve(root, manifestArgument);
const sidecarPath = path.resolve(root, process.argv[3] ?? `${manifestArgument}.sha256`);
const bytes = fs.readFileSync(manifestPath);

if (bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))) {
  throw new Error("Release manifest must not contain a UTF-8 BOM.");
}
if (bytes.includes(0x0d)) throw new Error("Release manifest must use LF line endings.");
if (bytes.at(-1) !== 0x0a) throw new Error("Release manifest must end with LF.");

let text;
try {
  text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
} catch {
  throw new Error("Release manifest is not valid UTF-8.");
}

const manifest = JSON.parse(text);
if (manifest.schemaVersion !== "rc2-final-candidate-manifest-2") {
  throw new Error("Detached digests may only be generated for manifest schema v2.");
}
if (Object.prototype.hasOwnProperty.call(manifest.identity ?? {}, "manifestSha256")) {
  throw new Error("Manifest schema v2 must not embed a self-referential digest.");
}

const digest = crypto.createHash("sha256").update(bytes).digest("hex");
fs.writeFileSync(sidecarPath, `${digest}  ${path.basename(manifestPath)}\n`, { encoding: "utf8" });
console.log(`Wrote ${path.relative(root, sidecarPath).replaceAll("\\", "/")} for raw SHA-256 ${digest}.`);
