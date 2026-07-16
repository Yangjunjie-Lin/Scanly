import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { build, type BuildOptions } from "esbuild";

const root = path.resolve(__dirname, "..");
const entries = [
  { id: "jsqr-engine-only", source: 'export * from "@scanly/engine-jsqr";' },
  { id: "zxing-js-engine-only", source: 'export * from "@scanly/engine-zxing-js";' },
  { id: "browser-jsqr", source: 'export * from "@scanly/browser"; export * from "@scanly/engine-jsqr";' },
  { id: "browser-jsqr-zxing-js", source: 'export * from "@scanly/browser"; export * from "@scanly/engine-jsqr"; export * from "@scanly/engine-zxing-js";' },
  { id: "react-adapter", source: 'export * from "@scanly/react";' },
  { id: "browser-worker", entryPoint: path.join(root, "packages", "browser", "src", "worker", "decode-worker.ts") },
] as const;

async function bundle(entry: typeof entries[number], minify: boolean) {
  const common: BuildOptions = {
    absWorkingDir: root,
    bundle: true,
    format: "esm",
    platform: "browser",
    target: ["es2022"],
    minify,
    treeShaking: true,
    write: false,
    metafile: true,
    sourcemap: false,
  };
  const result = await build("source" in entry
    ? { ...common, stdin: { contents: entry.source, resolveDir: root, sourcefile: `${entry.id}.ts`, loader: "ts" } }
    : { ...common, entryPoints: [entry.entryPoint] });
  const bytes = Buffer.concat(result.outputFiles?.map((file) => Buffer.from(file.contents)) ?? []);
  return {
    bytes: bytes.byteLength,
    gzipBytes: zlib.gzipSync(bytes, { level: 9 }).byteLength,
    brotliBytes: zlib.brotliCompressSync(bytes, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } }).byteLength,
    chunks: result.outputFiles?.map((file) => ({ file: path.basename(file.path), bytes: file.contents.byteLength })) ?? [],
  };
}

async function main() {
  const report = {
    schemaVersion: "1.0",
    generatedAt: new Date().toISOString(),
    methodology: "esbuild ESM browser bundles; package footprint is reported separately by the engine comparison.",
    entries: [] as Array<Record<string, unknown>>,
  };
  for (const entry of entries) {
    const [unminified, minified] = await Promise.all([bundle(entry, false), bundle(entry, true)]);
    report.entries.push({
      id: entry.id,
      treeShaken: true,
      unminifiedBundleBytes: unminified.bytes,
      minifiedBundleBytes: minified.bytes,
      gzipBytes: minified.gzipBytes,
      brotliBytes: minified.brotliBytes,
      chunks: minified.chunks,
      chunkKind: entry.id === "browser-worker" ? "worker" : entry.id.includes("engine") ? "engine" : "entry",
    });
  }
  const output = process.argv.includes("--canonical")
    ? path.join(root, "benchmark-results", "bundle-cost.json")
    : path.join(root, "benchmark-results", "ci", "bundle-cost.json");
  await fs.promises.mkdir(path.dirname(output), { recursive: true });
  await fs.promises.writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Wrote ${output}`);
}

main().catch((error) => { console.error(error); process.exit(1); });
