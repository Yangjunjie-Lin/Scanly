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

  const fixture = path.join(root, "fixtures", "alpha5", "generated", "data-matrix-01.png");
  if (!fs.existsSync(fixture)) throw new Error("Alpha.5 Data Matrix fixture is missing for installed-package decode verification.");
  const decodeProbe = `
    import { copyFileSync } from "node:fs";
    import { PUBLIC_BARCODE_FORMATS, normalizeRetailBarcode } from "@scanly/core";
    import { createNodeCaptureRouter, loadNormalizedFrameFromPath } from "@scanly/node";
    import { createZxingCppWasmEngine } from "@scanly/engine-zxing-cpp-wasm";
    if (!PUBLIC_BARCODE_FORMATS.includes("data_matrix")) throw new Error("data_matrix missing from PUBLIC_BARCODE_FORMATS");
    if (typeof normalizeRetailBarcode !== "function") throw new Error("normalizeRetailBarcode missing");
    const router = createNodeCaptureRouter();
    if (!router) throw new Error("createNodeCaptureRouter failed");
    copyFileSync(${JSON.stringify(fixture)}, "probe-data-matrix.png");
    const engine = createZxingCppWasmEngine();
    await engine.initialize();
    try {
      const frame = await loadNormalizedFrameFromPath("probe-data-matrix.png", "tarball-probe");
      const outcome = await engine.decode(frame, { formats: ["data_matrix"] });
      if (!outcome.ok || outcome.results[0]?.format !== "data_matrix") throw new Error("installed package failed to decode Data Matrix");
      if (!outcome.results[0]?.rawBytes?.byteLength) throw new Error("installed package omitted raw bytes");
    } finally {
      await engine.dispose();
    }
  `;
  execFileSync(process.execPath, ["--input-type=module", "--eval", decodeProbe], { cwd: temporary, stdio: "pipe" });
  console.log(`Tarball verification passed for ${workspaces.length} publishable packages (${tarballs.length} installed tarballs), including Alpha.5 multi-symbology decode.`);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
