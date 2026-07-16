import fs from "node:fs";
import path from "node:path";
import { decodePixelBufferWithNodeEngines as decodePixelBuffer } from "@scanly/node";
import { loadPixelBufferFromPath } from "@scanly/node";

const root = path.resolve(__dirname, "..");
const argument = process.argv.find((item) => item.startsWith("--iterations="));
const iterations = argument ? Number(argument.split("=", 2)[1]) : 200;
if (!Number.isInteger(iterations) || iterations < 1 || iterations > 10_000) throw new Error("iterations must be an integer from 1 to 10000");

async function main(): Promise<void> {
  const pixels = await loadPixelBufferFromPath(path.join(root, "fixtures/51-gamma-ish.png"));
  global.gc?.();
  const before = process.memoryUsage();
  const started = Date.now();
  for (let index = 0; index < iterations; index++) {
    const outcome = await decodePixelBuffer(pixels, { config: { findMultiple: false, maxCandidates: 2, maxAttempts: 18, decoders: { order: ["jsqr"], execution: "sequential" } } });
    if (!outcome.ok || outcome.primary.payload !== "SCANLY_GAMMA_01") throw new Error(`Soak decode failed at iteration ${index}.`);
  }
  global.gc?.();
  const after = process.memoryUsage();
  const report = {
    schemaVersion: "1.0",
    runtime: { node: process.version, platform: process.platform, arch: process.arch, gcExposed: typeof global.gc === "function" },
    iterations,
    elapsedMs: Date.now() - started,
    before,
    after,
    delta: Object.fromEntries(Object.keys(before).map((key) => [key, after[key as keyof NodeJS.MemoryUsage] - before[key as keyof NodeJS.MemoryUsage]])),
    interpretation: "Observational local utility only. Allocator/JIT behavior makes a single heap delta unsuitable as a universal CI leak threshold.",
  };
  const output = path.join(root, "benchmark-results", "memory-soak.json");
  await fs.promises.writeFile(output, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => { console.error(error); process.exit(1); });
