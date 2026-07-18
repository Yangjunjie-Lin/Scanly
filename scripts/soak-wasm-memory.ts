import fs from "node:fs";
import path from "node:path";
import { createRgbaFrame } from "@scanly/core";
import { loadPixelBufferFromPath } from "@scanly/node";
import { createZxingCppWasmEngine } from "@scanly/engine-zxing-cpp-wasm";

const root = path.resolve(__dirname, "..");
const argument = process.argv.find((item) => item.startsWith("--iterations="));
const iterations = argument ? Number(argument.split("=", 2)[1]) : 1_000;
if (!Number.isInteger(iterations) || iterations < 1 || iterations > 10_000) {
  throw new Error("iterations must be an integer from 1 to 10000");
}

async function main(): Promise<void> {
  const pixels = await loadPixelBufferFromPath(path.join(root, "fixtures", "01-clear-url.png"));
  const frame = createRgbaFrame(pixels.data, pixels.width, pixels.height);
  const engine = createZxingCppWasmEngine();
  const coldStarted = performance.now();
  await engine.initialize();
  const coldInitializationMs = performance.now() - coldStarted;
  const warmStarted = performance.now();
  await engine.initialize();
  const warmInitializationMs = performance.now() - warmStarted;

  for (let index = 0; index < 25; index += 1) {
    const outcome = await engine.decode(frame, { formats: ["qr_code"], findMultiple: false });
    if (!outcome.ok) throw new Error(`WASM warm-up failed at iteration ${index}.`);
  }
  const warmed = engine.getMemoryObservation();
  global.gc?.();
  const processBefore = process.memoryUsage();
  const started = performance.now();
  for (let index = 0; index < iterations; index += 1) {
    const outcome = await engine.decode(frame, { formats: ["qr_code"], findMultiple: false });
    if (!outcome.ok || outcome.results[0].text !== "https://scanly.example/clear") {
      throw new Error(`WASM soak decode failed at iteration ${index}.`);
    }
  }
  const elapsedMs = performance.now() - started;
  const retained = engine.getMemoryObservation();
  if (retained.activeNativeResultCount !== 0 || retained.inputAllocationBytes !== 0) {
    throw new Error("WASM soak retained an input allocation or native result.");
  }
  if (retained.currentLinearMemoryBytes > warmed.currentLinearMemoryBytes + 64 * 1024 * 1024) {
    throw new Error("WASM linear memory grew beyond the 64 MiB post-warm bound.");
  }
  global.gc?.();
  const processAfter = process.memoryUsage();
  await engine.dispose();
  const disposed = engine.getMemoryObservation();
  if (disposed.currentLinearMemoryBytes !== 0) throw new Error("Disposed WASM engine reports retained current linear memory.");

  const report = {
    schemaVersion: "1.0",
    runtime: { node: process.version, platform: process.platform, arch: process.arch, gcExposed: typeof global.gc === "function" },
    iterations,
    coldInitializationMs,
    warmInitializationMs,
    elapsedMs,
    averageDecodeMs: elapsedMs / iterations,
    warmed,
    retained,
    disposed,
    processBefore,
    processAfter,
    interpretation: "WASM linear memory and native allocation counters are release gates; process memory is observational because allocator/JIT behavior is runtime-specific.",
  };
  const output = path.join(root, "benchmark-results", "wasm-memory-soak.json");
  await fs.promises.writeFile(output, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => { console.error(error); process.exit(1); });
