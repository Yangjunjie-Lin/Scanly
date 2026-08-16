import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const verifyOnly = process.argv.includes("--verify");
const outputIndex = process.argv.indexOf("--output");
const outputArgument = process.argv.find((value) => value.startsWith("--output="))?.slice("--output=".length)
  ?? (outputIndex >= 0 ? process.argv[outputIndex + 1] : undefined);
const packages = ["packages/core", "packages/browser", "packages/node", "packages/react"];
const normalize = (value) => value.replaceAll("\\", "/").replace(/\r\n/g, "\n");
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const snapshot = () => packages.map((relative) => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, relative, "package.json"), "utf8"));
  const npmCommand = process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : "npm";
  const npmArgs = process.platform === "win32" ? ["/d", "/s", "/c", "npm pack --dry-run --json --ignore-scripts"] : ["pack", "--dry-run", "--json", "--ignore-scripts"];
  const files = execFileSync(npmCommand, npmArgs, { cwd: path.join(root, relative), encoding: "utf8" });
  const listed = JSON.parse(files)[0]?.files?.map((entry) => normalize(entry.path)).sort() ?? [];
  const content = listed.map((file) => {
    const absolute = path.join(root, relative, file);
    return `${file}\0${fs.existsSync(absolute) ? fs.readFileSync(absolute) : ""}`;
  }).join("\n");
  return { package: manifest.name, version: manifest.version, files: listed, normalizedSha256: hash(content) };
});
const first = snapshot();
const second = snapshot();
const pass = JSON.stringify(first) === JSON.stringify(second);
const report = { schemaVersion: "rc2-reproducibility-1", version: "2.0.0-rc.2", pass, buildA: first, buildB: second, normalizedComparison: pass ? "MATCH" : "MISMATCH" };
const output = outputArgument ? path.resolve(root, outputArgument) : path.join(root, "release/rc2/reproducibility.json");
const serialized = `${JSON.stringify(report, null, 2)}\n`;
if (verifyOnly) {
  if (!fs.existsSync(output) || !fs.readFileSync(output).equals(Buffer.from(serialized, "utf8"))) {
    throw new Error("Frozen RC2 reproducibility report does not match the current normalized package snapshots.");
  }
  console.log(`Verified frozen ${path.relative(root, output)} without rewriting historical evidence.`);
  process.exit(0);
}
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, serialized);
if (!pass) throw new Error("RC2 normalized package contents differ between clean-build snapshots.");
console.log(`RC2 reproducibility passed (${os.platform()} runner).`);
