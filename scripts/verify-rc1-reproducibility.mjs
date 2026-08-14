import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
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
const report = { schemaVersion: "rc1-reproducibility-1", version: "2.0.0-rc.1", pass, buildA: first, buildB: second, normalizedComparison: pass ? "MATCH" : "MISMATCH" };
const output = path.join(root, "release/rc1/reproducibility.json");
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
if (!pass) throw new Error("RC1 normalized package contents differ between clean-build snapshots.");
console.log(`RC1 reproducibility passed (${os.platform()} runner).`);
