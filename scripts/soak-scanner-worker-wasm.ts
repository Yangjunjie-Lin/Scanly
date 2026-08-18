import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";

const root = path.resolve(__dirname, "..");
const iterationArgument = process.argv.find((item) => item.startsWith("--iterations="));
const iterations = iterationArgument ? Number(iterationArgument.split("=", 2)[1]) : 1_000;
if (!Number.isInteger(iterations) || iterations < 1 || iterations > 10_000) {
  throw new Error("iterations must be an integer from 1 to 10000");
}

const fixture = path.join(root, "fixtures", "alpha5", "generated", "data-matrix-13.png");
const wasm = path.join(root, "engines", "zxing-cpp-wasm", "wasm", "zxing-cpp.wasm");
const expectedPayload = "SCANLY-DM-13";

type Assertion = { id: string; expected: unknown; observed: unknown; pass: boolean };
type ScannerStatistics = Record<string, number>;
type WorkerDebug = {
  created: number;
  terminated: number;
  decodePosted: number;
  workerDecodeCount: number;
  mainThreadDecodeCount: number;
  workerDegraded: boolean;
  workerRestartCount: number;
  lastPath: "worker" | "main-thread" | null;
};
type BrowserObservation = {
  warmup: { ok: boolean; engineId: string | null };
  decodedEngineEvents: number;
  unexpectedEvents: number;
  disposedFrames: number;
  beforeDispose: ScannerStatistics;
  afterDispose: ScannerStatistics;
  workerDebug: WorkerDebug | null;
};

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

const browserEntry = String.raw`
import {
  BrowserScannerFrameDecoder,
  DeterministicFrameSequenceSource,
  ScannerSession,
} from "./packages/browser/src/index.ts";
import { createRgbaFrame } from "./packages/core/src/index.ts";
import { getBuiltinScenario } from "./packages/scenario-schema/src/index.ts";

async function fixturePixels() {
  const response = await fetch("/fixture.png", { cache: "no-store" });
  if (!response.ok) throw new Error("Unable to load Scanner Worker/WASM Soak fixture.");
  const bitmap = await createImageBitmap(await response.blob());
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas 2D is unavailable.");
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  canvas.width = 0;
  canvas.height = 0;
  return image;
}

window.__runScanlyWorkerWasmSoak = async (iterations) => {
  const image = await fixturePixels();
  const scenario = getBuiltinScenario("fast");
  scenario.acceptedFormats = ["data_matrix"];
  scenario.multiCode = { ...scenario.multiCode, enabled: false, maxResults: 1 };
  scenario.semanticParsers = [];

  const decoder = new BrowserScannerFrameDecoder({ useWorker: true, scenario });
  const quality = {
    blurScore: 1,
    brightness: 0.5,
    contrast: 1,
    glareRatio: 0,
    edgeDensity: 1,
    underexposed: false,
    overexposed: false,
    blurred: false,
    glareDominated: false,
    usable: true,
  };
  const warmupFrame = createRgbaFrame(new Uint8ClampedArray(image.data), image.width, image.height, {
    id: "scanner-worker-wasm-warmup",
    timestampMs: Date.now(),
    sourceType: "camera",
    ownership: "owned",
  });
  const warmupOutcome = await decoder.decode(warmupFrame, {
    profile: "balanced",
    quality,
    signal: new AbortController().signal,
    generation: 0,
  });
  warmupFrame.dispose?.();
  if (!warmupOutcome.ok || warmupOutcome.primary.engine.id !== "zxing-cpp-wasm") {
    throw new Error("Worker/WASM warmup did not return the expected ZXing-C++ WASM result.");
  }

  let disposedFrames = 0;
  const source = new DeterministicFrameSequenceSource(function* () {
    for (let index = 0; index < iterations; index += 1) {
      yield createRgbaFrame(new Uint8ClampedArray(image.data), image.width, image.height, {
        id: "scanner-worker-wasm-" + index,
        timestampMs: Date.now() + index,
        sourceType: "camera",
        ownership: "owned",
        dispose: () => { disposedFrames += 1; },
      });
    }
  });
  const session = new ScannerSession({
    source,
    decoder,
    confirmation: { mode: "immediate" },
    repeatPolicy: { mode: "allow" },
    quality: {
      sampleTarget: 256,
      underexposedThreshold: 0,
      overexposedThreshold: 1,
      blurThreshold: 0,
      contrastThreshold: 0,
      glareThreshold: 1,
    },
    autoZoom: { enabled: false },
  });
  let decodedEngineEvents = 0;
  let unexpectedEvents = 0;
  session.onResult((event) => {
    if (event.barcode.text === ${JSON.stringify(expectedPayload)}
      && event.barcode.format === "data_matrix"
      && event.barcode.engineId === "zxing-cpp-wasm") decodedEngineEvents += 1;
    else unexpectedEvents += 1;
  });

  await session.start();
  await source.finished();
  const deadline = Date.now() + 30_000;
  while (session.getState() !== "stopped") {
    if (Date.now() >= deadline) throw new Error("Scanner Worker/WASM Soak session did not stop.");
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  const beforeDispose = session.getStatistics();
  await session.dispose();
  await decoder.dispose();
  const afterDispose = session.getStatistics();
  const workerDebug = window.__SCANLY_WORKER_DEBUG__ ? { ...window.__SCANLY_WORKER_DEBUG__ } : null;
  return {
    warmup: { ok: warmupOutcome.ok, engineId: warmupOutcome.ok ? warmupOutcome.primary.engine.id : null },
    decodedEngineEvents,
    unexpectedEvents,
    disposedFrames,
    beforeDispose,
    afterDispose,
    workerDebug,
  };
};
`;

async function bundles(): Promise<{ page: Uint8Array; worker: Uint8Array }> {
  const common = {
    bundle: true,
    format: "esm" as const,
    platform: "browser" as const,
    target: "es2022",
    write: false,
    sourcemap: false,
    tsconfig: path.join(root, "tsconfig.json"),
    define: { "process.env.NODE_ENV": '"production"' },
  };
  const [pageBuild, workerBuild] = await Promise.all([
    build({
      ...common,
      stdin: {
        contents: browserEntry,
        loader: "ts",
        resolveDir: root,
        sourcefile: "scanner-worker-wasm-soak-entry.ts",
      },
    }),
    build({
      ...common,
      entryPoints: [path.join(root, "packages", "browser", "src", "worker", "decode-worker.ts")],
    }),
  ]);
  const page = pageBuild.outputFiles?.[0]?.contents;
  const worker = workerBuild.outputFiles?.[0]?.contents;
  if (!page || !worker) throw new Error("Unable to bundle the Scanner Worker/WASM Soak runtime.");
  return { page, worker };
}

async function main(): Promise<void> {
  if (!fs.existsSync(fixture)) throw new Error(`Missing project-owned fixture: ${fixture}`);
  if (!fs.existsSync(wasm)) throw new Error(`Missing pinned ZXing-C++ WASM asset: ${wasm}`);
  const assets = await bundles();
  const fixtureBytes = await fs.promises.readFile(fixture);
  const wasmBytes = await fs.promises.readFile(wasm);
  const server = createServer((request, response) => {
    response.setHeader("Cache-Control", "no-store");
    if (request.url === "/") {
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.end('<!doctype html><meta charset="utf-8"><title>Scanner Worker/WASM Soak</title><script type="module" src="/soak.js"></script>');
      return;
    }
    if (request.url === "/soak.js") {
      response.setHeader("Content-Type", "text/javascript; charset=utf-8");
      response.end(assets.page);
      return;
    }
    if (request.url === "/decode-worker.js") {
      response.setHeader("Content-Type", "text/javascript; charset=utf-8");
      response.end(assets.worker);
      return;
    }
    if (request.url === "/fixture.png") {
      response.setHeader("Content-Type", "image/png");
      response.end(fixtureBytes);
      return;
    }
    if (request.url === "/wasm/zxing-cpp.wasm") {
      response.setHeader("Content-Type", "application/wasm");
      response.end(wasmBytes);
      return;
    }
    response.statusCode = 404;
    response.end("not found");
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Scanner Worker/WASM Soak server did not bind to TCP.");

  const browser = await chromium.launch({ headless: true });
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const startedAt = performance.now();
  let observed: BrowserObservation;
  try {
    const page = await browser.newPage();
    page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(`http://127.0.0.1:${address.port}/`, { waitUntil: "load" });
    await page.waitForFunction(() => typeof (window as unknown as { __runScanlyWorkerWasmSoak?: unknown }).__runScanlyWorkerWasmSoak === "function");
    observed = await page.evaluate(async (count) => {
      const run = (window as unknown as { __runScanlyWorkerWasmSoak: (value: number) => Promise<BrowserObservation> }).__runScanlyWorkerWasmSoak;
      return run(count);
    }, iterations);
  } finally {
    await browser.close();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
  const elapsedMs = performance.now() - startedAt;
  const final = observed.afterDispose;
  const running = observed.beforeDispose;
  const debug = observed.workerDebug;
  const assertions: Assertion[] = [
    { id: "worker-wasm-warmup", expected: "zxing-cpp-wasm", observed: observed.warmup.engineId, pass: observed.warmup.ok && observed.warmup.engineId === "zxing-cpp-wasm" },
    { id: "actual-worker-wasm-frames", expected: `>=${iterations}`, observed: final.workerWasmDecodeCount, pass: final.workerWasmDecodeCount >= iterations },
    { id: "zxing-cpp-wasm-public-results", expected: iterations, observed: observed.decodedEngineEvents, pass: observed.decodedEngineEvents === iterations },
    { id: "no-unexpected-public-results", expected: 0, observed: observed.unexpectedEvents, pass: observed.unexpectedEvents === 0 },
    { id: "persistent-worker-created-once", expected: 1, observed: final.workerCreatedCount, pass: final.workerCreatedCount === 1 },
    { id: "owned-worker-terminated-once", expected: 1, observed: final.workerTerminatedCount, pass: final.workerTerminatedCount === 1 },
    { id: "worker-debug-created-once", expected: 1, observed: debug?.created ?? null, pass: debug?.created === 1 },
    { id: "worker-debug-terminated-once", expected: 1, observed: debug?.terminated ?? null, pass: debug?.terminated === 1 },
    { id: "no-main-thread-fallback", expected: 0, observed: debug?.mainThreadDecodeCount ?? null, pass: debug?.mainThreadDecodeCount === 0 },
    { id: "one-active-worker-task", expected: "<=1", observed: final.peakActiveTaskCount, pass: final.peakActiveTaskCount <= 1 && final.peakActiveTaskCount >= 1 },
    { id: "worker-active-task-drained", expected: 0, observed: final.activeTaskCount, pass: final.activeTaskCount === 0 },
    { id: "scanner-pending-frame-drained", expected: 0, observed: final.pendingFrameCount, pass: final.pendingFrameCount === 0 },
    { id: "scanner-pending-frame-bounded", expected: "<=1", observed: final.peakPendingFrameCount, pass: final.peakPendingFrameCount <= 1 },
    { id: "scanner-active-decode-drained", expected: 0, observed: final.activeDecodeCount, pass: final.activeDecodeCount === 0 },
    { id: "wasm-input-allocation-released", expected: 0, observed: final.wasmInputAllocationBytes, pass: final.wasmInputAllocationBytes === 0 },
    { id: "wasm-native-results-released", expected: 0, observed: final.wasmActiveNativeResultCount, pass: final.wasmActiveNativeResultCount === 0 },
    { id: "wasm-native-boundary-observed", expected: `>=${iterations}`, observed: final.wasmReleasedNativeResultCount, pass: final.wasmReleasedNativeResultCount >= iterations },
    { id: "wasm-linear-memory-observed", expected: ">0", observed: running.wasmPeakLinearMemoryBytes, pass: running.wasmPeakLinearMemoryBytes > 0 },
    { id: "worker-realm-linear-memory-released", expected: 0, observed: final.currentWorkerMemory, pass: final.currentWorkerMemory === 0 },
    { id: "controlled-memory-final", expected: 0, observed: final.finalControlledMemory, pass: final.finalControlledMemory === 0 },
    { id: "no-stale-public-events", expected: 0, observed: final.staleEvents, pass: final.staleEvents === 0 },
    { id: "no-stale-results", expected: 0, observed: final.staleResultsDiscarded, pass: final.staleResultsDiscarded === 0 },
    { id: "all-owned-frames-released", expected: iterations, observed: observed.disposedFrames, pass: observed.disposedFrames === iterations },
    { id: "no-page-errors", expected: 0, observed: pageErrors.length, pass: pageErrors.length === 0 },
  ];
  const failureReasons = assertions.filter((assertion) => !assertion.pass).map((assertion) => assertion.id);
  const report = {
    schemaVersion: "2.0-beta1",
    kind: "scanner-worker-wasm-soak",
    tier: iterations >= 10_000 ? "extended" : "pull-request",
    workerEvidence: "actual-browser-worker",
    wasmEvidence: "actual-zxing-cpp-wasm",
    decoderOwnership: "soak-harness-owned-and-disposed",
    sourceCommit: git("rev-parse", "HEAD"),
    sourceTree: git("rev-parse", "HEAD^{tree}"),
    repositoryDirty: git("status", "--porcelain", "--untracked-files=all").length > 0,
    fixture: {
      file: path.relative(root, fixture).replaceAll("\\", "/"),
      provenance: "project-generated",
      expectedPayload,
      expectedFormat: "data_matrix",
    },
    expected: {
      minimumActualWorkerWasmFrames: iterations,
      workerCreatedCount: 1,
      workerTerminatedCount: 1,
      peakActiveTaskCountMaximum: 1,
      finalActiveTaskCount: 0,
      finalPendingFrameCount: 0,
      wasmInputAllocationBytesFinal: 0,
      wasmActiveNativeResultCountFinal: 0,
      staleEvents: 0,
    },
    observed: {
      iterations,
      warmupFrames: 1,
      elapsedMs,
      averageSessionFrameMs: elapsedMs / iterations,
      ...observed,
      consoleErrors,
      pageErrors,
    },
    assertions,
    pass: failureReasons.length === 0,
    failureReasons,
  };
  const output = path.join(root, "benchmark-results", "realtime", "worker-wasm-soak.json");
  await fs.promises.mkdir(path.dirname(output), { recursive: true });
  await fs.promises.writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (!report.pass) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
