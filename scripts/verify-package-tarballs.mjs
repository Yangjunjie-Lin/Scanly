import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const packageRoots = ["packages", "engines"];
const workspaces = packageRoots.flatMap((folder) => fs.readdirSync(path.join(root, folder), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(root, folder, entry.name, "package.json")))
  .map((entry) => path.join(root, folder, entry.name)))
  .filter((directory) => JSON.parse(fs.readFileSync(path.join(directory, "package.json"), "utf8")).private !== true);
const runNpm = (args, options) => execFileSync("npm", args, { ...options, shell: process.platform === "win32" });
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "scanly-pack-"));

try {
  const tarballs = [];
  const expectedExports = [];
  for (const directory of workspaces) {
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, "package.json"), "utf8"));
    const dryRun = JSON.parse(runNpm(["pack", "--dry-run", "--json"], { cwd: directory, encoding: "utf8" }))[0];
    const files = dryRun.files.map((entry) => entry.path);
    if (files.some((file) => /(^|\/)(fixtures|coverage|tests|\.env)(\/|$)/.test(file))) throw new Error(`${manifest.name} tarball contains repository-only files.`);
    if (!files.includes("dist/index.js") || !files.includes("dist/index.d.ts")) throw new Error(`${manifest.name} tarball is missing its root JS/declaration entry.`);
    if (manifest.name === "@scanly/browser" && !files.includes("dist/worker/decode-worker.js")) throw new Error("@scanly/browser tarball is missing the Worker asset.");
    if (manifest.name === "@scanly/engine-zxing-cpp-wasm") {
      for (const required of ["wasm/zxing-cpp.wasm", "wasm/metadata.json", "NOTICE", "LICENSE", "LICENSE-ZXING-WASM", "LICENSE-ZXING-CPP"]) {
        if (!files.includes(required)) throw new Error(`@scanly/engine-zxing-cpp-wasm tarball is missing ${required}.`);
      }
    }
    const packed = JSON.parse(runNpm(["pack", "--json", "--pack-destination", temporary], { cwd: directory, encoding: "utf8" }))[0];
    tarballs.push(path.join(temporary, packed.filename));
    const importableExports = Object.entries(manifest.exports ?? { ".": {} })
      .filter(([, target]) => {
        if (typeof target === "string") return target.endsWith(".js");
        const selected = target?.import;
        return typeof selected === "string" ? selected.endsWith(".js") : typeof selected?.default === "string" && selected.default.endsWith(".js");
      })
      .map(([entry]) => entry);
    expectedExports.push([manifest.name, importableExports]);
  }

  fs.writeFileSync(path.join(temporary, "package.json"), JSON.stringify({ private: true, type: "module" }));
  runNpm(["install", "--ignore-scripts", "--no-audit", "--no-fund", "--no-package-lock", ...tarballs], { cwd: temporary, stdio: "pipe" });
  const probe = expectedExports.flatMap(([name, exports]) => exports.map((entry) => entry === "." ? name : `${name}${entry.slice(1)}`));
  execFileSync(process.execPath, ["--input-type=module", "--eval", `for (const id of ${JSON.stringify(probe)}) await import(id);`], { cwd: temporary, stdio: "pipe" });
  console.log(`Tarball verification passed for ${workspaces.length} publishable packages (${tarballs.length} installed tarballs).`);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
