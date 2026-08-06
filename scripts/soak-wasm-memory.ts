import fs from "node:fs";
import path from "node:path";
import { createRgbaFrame, type NormalizedFrame } from "@scanly/core";
import { loadPixelBufferFromPath } from "@scanly/node";
import { createZxingCppWasmEngine } from "@scanly/engine-zxing-cpp-wasm";
import type { BarcodeFormat } from "@scanly/scenario-schema";

const root = path.resolve(__dirname, "..");
const argument = process.argv.find((item) => item.startsWith("--iterations="));
const iterations = argument ? Number(argument.split("=", 2)[1]) : 1_000;
if (!Number.isInteger(iterations) || iterations < 1 || iterations > 10_000) {
  throw new Error("iterations must be an integer from 1 to 10000");
}

async function main(): Promise<void> {
  const manifest = JSON.parse(await fs.promises.readFile(path.join(root, "fixtures", "alpha5", "manifest.json"), "utf8")) as {
    fixtures: Array<{ id: string; file: string; format?: BarcodeFormat; expectedPayload: string; expectedOutcome: string; difficultyTags: string[] }>;
  };
  const cases: Array<{ format: BarcodeFormat; payload: string; frame: NormalizedFrame }> = [];
  const qrPixels = await loadPixelBufferFromPath(path.join(root, "fixtures", "01-clear-url.png"));
  cases.push({ format: "qr_code", payload: "https://scanly.example/clear", frame: createRgbaFrame(qrPixels.data, qrPixels.width, qrPixels.height) });
  for (const format of ["data_matrix", "pdf417", "code_128", "ean_13", "ean_8", "upc_a", "upc_e"] as const) {
    const fixture = manifest.fixtures.find((entry) => entry.format === format && entry.expectedOutcome === "decode" && entry.difficultyTags.length === 1 && entry.difficultyTags[0] === "clear");
    if (!fixture) throw new Error(`Missing clear memory-soak fixture for ${format}.`);
    const pixels = await loadPixelBufferFromPath(path.join(root, fixture.file));
    cases.push({ format, payload: fixture.expectedPayload, frame: createRgbaFrame(pixels.data, pixels.width, pixels.height) });
  }
  const engine = createZxingCppWasmEngine();
  const coldStarted = performance.now();
  await engine.initialize();
  const coldInitializationMs = performance.now() - coldStarted;
  const warmStarted = performance.now();
  await engine.initialize();
  const warmInitializationMs = performance.now() - warmStarted;

  for (let index = 0; index < 25; index += 1) {
    const testCase = cases[index % cases.length];
    const outcome = await engine.decode(testCase.frame, { formats: [testCase.format], findMultiple: false });
    if (!outcome.ok) throw new Error(`WASM warm-up failed at iteration ${index}.`);
  }
  const warmed = engine.getMemoryObservation();
  global.gc?.();
  const processBefore = process.memoryUsage();
  const started = performance.now();
  for (let index = 0; index < iterations; index += 1) {
    const testCase = cases[index % cases.length];
    const outcome = await engine.decode(testCase.frame, { formats: [testCase.format], findMultiple: false });
    if (!outcome.ok || outcome.results[0].text !== testCase.payload || outcome.results[0].format !== testCase.format) {
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
    formats: cases.map(({ format }) => format),
    formatMaskChanges: Math.max(0, iterations - 1),
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
