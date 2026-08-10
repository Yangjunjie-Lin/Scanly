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

const fixture = path.join(root, "fixtures", "50-multiple-three.png");
const wasm = path.join(root, "engines", "zxing-cpp-wasm", "wasm", "zxing-cpp.wasm");
const expectedPayloads = ["SCANLY_TRI_A", "SCANLY_TRI_B", "SCANLY_TRI_C"] as const;

type Assertion = { id: string; expected: unknown; observed: unknown; pass: boolean };
type NumericStatistics = Record<string, number>;
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
  warmup: {
    ok: boolean;
    resultCount: number;
    payloads: string[];
    wasmResultCount: number;
  };
  observationSetCount: number;
  multiResultObservationSetCount: number;
  completeObservationSetCount: number;
  wasmBackedObservationSetCount: number;
  trackingUpdateCount: number;
  totalObservationCount: number;
  missingGeometryObservationCount: number;
  unexpectedObservationCount: number;
  observedPayloads: string[];
  listenerErrors: string[];
  disposedFrames: number;
  peakTrackCount: number;
  tracksBeforeDispose: Array<{
    trackId: string;
    physicalInstanceId: string;
    payload: string;
    state: string;
    observationCount: number;
  }>;
  scannerBeforeDispose: NumericStatistics;
  scannerAfterDispose: NumericStatistics;
  trackerBeforeDispose: NumericStatistics;
  trackerAfterDispose: NumericStatistics;
  workerDebug: WorkerDebug | null;
};

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

const browserEntry = String.raw`
import {
  BarcodeTracker,
  BrowserScannerFrameDecoder,
  DeterministicFrameSequenceSource,
  ScannerSession,
} from "./packages/browser/src/index.ts";
import { createRgbaFrame } from "./packages/core/src/index.ts";
import { getBuiltinScenario } from "./packages/scenario-schema/src/index.ts";

const EXPECTED_PAYLOADS = ${JSON.stringify(expectedPayloads)};

async function fixturePixels() {
  const response = await fetch("/fixture.png", { cache: "no-store" });
  if (!response.ok) throw new Error("Unable to load Tracking Worker/WASM Soak fixture.");
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

function exactPayloadSet(observations) {
  const actual = [...new Set(observations.map((observation) => observation.barcode.text))].sort();
  const expected = [...EXPECTED_PAYLOADS].sort();
  return actual.length === expected.length && actual.every((payload, index) => payload === expected[index]);
}

window.__runScanlyTrackingWorkerWasmSoak = async (iterations) => {
  const image = await fixturePixels();
  const scenario = getBuiltinScenario("balanced");
  scenario.acceptedFormats = ["qr_code"];
  scenario.multiCode = {
    ...scenario.multiCode,
    enabled: true,
    maxResults: EXPECTED_PAYLOADS.length,
    deduplication: "payload-format-spatial",
  };
  scenario.validation = [];
  scenario.semanticParsers = [];

  const decoder = new BrowserScannerFrameDecoder({ useWorker: true, scenario });
  // Tracking needs one complete, full-frame observation set. This adapter only
  // pins that evidence profile; decoding still goes through the real browser
  // decoder, its persistent DecodeWorkerClient, and ZXing-C++ WASM.
  const fullFrameBalancedDecoder = {
    decode(frame, request) {
      return decoder.decode(frame, { ...request, profile: "balanced", roi: undefined });
    },
    cancel() { decoder.cancel(); },
    dispose() { return decoder.dispose(); },
    getStatistics() { return decoder.getStatistics(); },
  };
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
    id: "tracking-worker-wasm-warmup",
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
  const warmupResults = warmupOutcome.ok ? warmupOutcome.results : [];
  const warmup = {
    ok: warmupOutcome.ok && exactPayloadSet(warmupResults.map((result) => ({ barcode: { text: result.rawText } }))),
    resultCount: warmupResults.length,
    payloads: warmupResults.map((result) => result.rawText).sort(),
    wasmResultCount: warmupResults.filter((result) => result.engine.id === "zxing-cpp-wasm").length,
  };
  if (!warmup.ok || warmup.wasmResultCount < 1) {
    await decoder.dispose();
    throw new Error("Tracking Worker/WASM warmup did not preserve the complete three-code ZXing-C++ WASM result set.");
  }

  let disposedFrames = 0;
  const source = new DeterministicFrameSequenceSource(function* () {
    for (let index = 0; index < iterations; index += 1) {
      yield createRgbaFrame(new Uint8ClampedArray(image.data), image.width, image.height, {
        id: "tracking-worker-wasm-" + index,
        timestampMs: Date.now() + index,
        sourceType: "camera",
        ownership: "owned",
        dispose: () => { disposedFrames += 1; },
      });
    }
  });
  const tracker = new BarcodeTracker({
    confirmationObservations: 1,
    maxTracks: EXPECTED_PAYLOADS.length,
    maxObservations: 8,
    maxMissedFrames: 2,
  });
  const session = new ScannerSession({
    source,
    decoder: fullFrameBalancedDecoder,
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

  let observationSetCount = 0;
  let multiResultObservationSetCount = 0;
  let completeObservationSetCount = 0;
  let wasmBackedObservationSetCount = 0;
  let trackingUpdateCount = 0;
  let totalObservationCount = 0;
  let missingGeometryObservationCount = 0;
  let unexpectedObservationCount = 0;
  let peakTrackCount = 0;
  const observedPayloads = new Set();
  const listenerErrors = [];
  session.onObservations((set) => {
    try {
      observationSetCount += 1;
      totalObservationCount += set.observations.length;
      if (set.observations.length > 1) multiResultObservationSetCount += 1;
      if (exactPayloadSet(set.observations)) completeObservationSetCount += 1;
      if (set.observations.some((observation) => observation.barcode.engineId === "zxing-cpp-wasm")) {
        wasmBackedObservationSetCount += 1;
      }
      for (const observation of set.observations) {
        observedPayloads.add(observation.barcode.text);
        if (!EXPECTED_PAYLOADS.includes(observation.barcode.text)) unexpectedObservationCount += 1;
      }
      const trackingObservations = set.observations.flatMap((observation) => {
        if (!observation.geometry) {
          missingGeometryObservationCount += 1;
          return [];
        }
        return [{
          payload: observation.barcode.text,
          format: observation.barcode.format,
          geometry: observation.geometry,
        }];
      });
      const update = tracker.observeFrame(trackingObservations, { frameId: set.frameId, timestamp: set.timestamp });
      trackingUpdateCount += 1;
      peakTrackCount = Math.max(peakTrackCount, update.tracks.length);
    } catch (error) {
      listenerErrors.push(error instanceof Error ? error.message : String(error));
    }
  });

  await session.start();
  await source.finished();
  const deadline = Date.now() + 30_000;
  while (session.getState() !== "stopped") {
    if (Date.now() >= deadline) throw new Error("Tracking Worker/WASM Soak session did not stop.");
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  const scannerBeforeDispose = session.getStatistics();
  const trackerBeforeDispose = tracker.getStatistics();
  const tracksBeforeDispose = tracker.getTracks().map((track) => ({
    trackId: track.trackId,
    physicalInstanceId: track.physicalInstanceId,
    payload: track.payload,
    state: track.state,
    observationCount: track.observationCount,
  }));
  await session.dispose();
  await decoder.dispose();
  tracker.dispose();
  const scannerAfterDispose = session.getStatistics();
  const trackerAfterDispose = tracker.getStatistics();
  const workerDebug = window.__SCANLY_WORKER_DEBUG__ ? { ...window.__SCANLY_WORKER_DEBUG__ } : null;

  return {
    warmup,
    observationSetCount,
    multiResultObservationSetCount,
    completeObservationSetCount,
    wasmBackedObservationSetCount,
    trackingUpdateCount,
    totalObservationCount,
    missingGeometryObservationCount,
    unexpectedObservationCount,
    observedPayloads: [...observedPayloads].sort(),
    listenerErrors,
    disposedFrames,
    peakTrackCount,
    tracksBeforeDispose,
    scannerBeforeDispose,
    scannerAfterDispose,
    trackerBeforeDispose,
    trackerAfterDispose,
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
        sourcefile: "tracking-worker-wasm-soak-entry.ts",
      },
    }),
    build({
      ...common,
      entryPoints: [path.join(root, "packages", "browser", "src", "worker", "decode-worker.ts")],
    }),
  ]);
  const page = pageBuild.outputFiles?.[0]?.contents;
  const worker = workerBuild.outputFiles?.[0]?.contents;
  if (!page || !worker) throw new Error("Unable to bundle the Tracking Worker/WASM Soak runtime.");
  return { page, worker };
}

function sameStrings(actual: readonly string[], expected: readonly string[]): boolean {
  const left = [...actual].sort();
  const right = [...expected].sort();
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

async function main(): Promise<void> {
  if (!fs.existsSync(fixture)) throw new Error(`Missing project-generated multi-code fixture: ${fixture}`);
  if (!fs.existsSync(wasm)) throw new Error(`Missing pinned ZXing-C++ WASM asset: ${wasm}`);
  const assets = await bundles();
  const fixtureBytes = await fs.promises.readFile(fixture);
  const wasmBytes = await fs.promises.readFile(wasm);
  const server = createServer((request, response) => {
    response.setHeader("Cache-Control", "no-store");
    if (request.url === "/") {
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.end('<!doctype html><meta charset="utf-8"><title>Tracking Worker/WASM Soak</title><script type="module" src="/soak.js"></script>');
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
  if (!address || typeof address === "string") throw new Error("Tracking Worker/WASM Soak server did not bind to TCP.");

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
    await page.waitForFunction(() => typeof (window as unknown as { __runScanlyTrackingWorkerWasmSoak?: unknown }).__runScanlyTrackingWorkerWasmSoak === "function");
    observed = await page.evaluate(async (count) => {
      const run = (window as unknown as {
        __runScanlyTrackingWorkerWasmSoak: (value: number) => Promise<BrowserObservation>;
      }).__runScanlyTrackingWorkerWasmSoak;
      return run(count);
    }, iterations);
  } finally {
    await browser.close();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }

  const elapsedMs = performance.now() - startedAt;
  const finalScanner = observed.scannerAfterDispose;
  const runningScanner = observed.scannerBeforeDispose;
  const finalTracker = observed.trackerAfterDispose;
  const runningTracker = observed.trackerBeforeDispose;
  const debug = observed.workerDebug;
  const expectedDecodeCount = iterations + 1; // one explicit warmup plus session frames
  const finalControlledMemory = finalScanner.finalControlledMemory
    + finalTracker.activeTrackCount
    + finalTracker.lostTrackCount
    + finalTracker.pendingObservationCount;
  const trackPayloads = observed.tracksBeforeDispose.map((track) => track.payload);
  const distinctTrackIds = new Set(observed.tracksBeforeDispose.map((track) => track.trackId)).size;
  const distinctPhysicalInstanceIds = new Set(observed.tracksBeforeDispose.map((track) => track.physicalInstanceId)).size;
  const assertions: Assertion[] = [
    { id: "worker-wasm-multicode-warmup", expected: { resultCount: 3, payloads: expectedPayloads, minimumWasmResults: 1 }, observed: observed.warmup, pass: observed.warmup.ok && observed.warmup.resultCount === expectedPayloads.length && observed.warmup.wasmResultCount >= 1 },
    { id: "all-session-frames-admitted", expected: iterations, observed: runningScanner.admittedFrames, pass: runningScanner.admittedFrames === iterations },
    { id: "one-observation-set-per-frame", expected: iterations, observed: observed.observationSetCount, pass: observed.observationSetCount === iterations },
    { id: "multi-result-path-preserved", expected: iterations, observed: observed.multiResultObservationSetCount, pass: observed.multiResultObservationSetCount === iterations },
    { id: "complete-ground-truth-payload-set", expected: iterations, observed: observed.completeObservationSetCount, pass: observed.completeObservationSetCount === iterations },
    { id: "wasm-backed-observation-sets", expected: iterations, observed: observed.wasmBackedObservationSetCount, pass: observed.wasmBackedObservationSetCount === iterations },
    { id: "observation-set-fed-to-tracker", expected: iterations, observed: observed.trackingUpdateCount, pass: observed.trackingUpdateCount === iterations },
    { id: "all-three-results-observed-per-frame", expected: iterations * expectedPayloads.length, observed: observed.totalObservationCount, pass: observed.totalObservationCount === iterations * expectedPayloads.length },
    { id: "no-missing-tracking-geometry", expected: 0, observed: observed.missingGeometryObservationCount, pass: observed.missingGeometryObservationCount === 0 },
    { id: "no-unexpected-observations", expected: 0, observed: observed.unexpectedObservationCount, pass: observed.unexpectedObservationCount === 0 && sameStrings(observed.observedPayloads, expectedPayloads) },
    { id: "no-observation-listener-errors", expected: 0, observed: observed.listenerErrors, pass: observed.listenerErrors.length === 0 },
    { id: "bounded-tracks", expected: expectedPayloads.length, observed: { peak: observed.peakTrackCount, final: runningTracker.activeTrackCount }, pass: observed.peakTrackCount === expectedPayloads.length && runningTracker.activeTrackCount === expectedPayloads.length },
    { id: "stable-track-payloads", expected: expectedPayloads, observed: trackPayloads, pass: sameStrings(trackPayloads, expectedPayloads) && observed.tracksBeforeDispose.every((track) => track.state === "confirmed" && track.observationCount === iterations) },
    { id: "distinct-track-identities", expected: expectedPayloads.length, observed: { trackIds: distinctTrackIds, physicalInstanceIds: distinctPhysicalInstanceIds }, pass: distinctTrackIds === expectedPayloads.length && distinctPhysicalInstanceIds === expectedPayloads.length },
    { id: "actual-worker-wasm-decodes", expected: expectedDecodeCount, observed: finalScanner.workerWasmDecodeCount, pass: finalScanner.workerWasmDecodeCount === expectedDecodeCount },
    { id: "persistent-worker-created-once", expected: 1, observed: finalScanner.workerCreatedCount, pass: finalScanner.workerCreatedCount === 1 },
    { id: "owned-worker-terminated-once", expected: 1, observed: finalScanner.workerTerminatedCount, pass: finalScanner.workerTerminatedCount === 1 },
    { id: "worker-debug-created-once", expected: 1, observed: debug?.created ?? null, pass: debug?.created === 1 },
    { id: "worker-debug-terminated-once", expected: 1, observed: debug?.terminated ?? null, pass: debug?.terminated === 1 },
    { id: "worker-debug-decodes", expected: expectedDecodeCount, observed: debug?.workerDecodeCount ?? null, pass: debug?.workerDecodeCount === expectedDecodeCount && debug.decodePosted === expectedDecodeCount },
    { id: "no-main-thread-fallback", expected: 0, observed: debug?.mainThreadDecodeCount ?? null, pass: debug?.mainThreadDecodeCount === 0 },
    { id: "one-active-worker-task", expected: "1", observed: finalScanner.peakActiveTaskCount, pass: finalScanner.peakActiveTaskCount === 1 },
    { id: "worker-active-task-drained", expected: 0, observed: finalScanner.activeTaskCount, pass: finalScanner.activeTaskCount === 0 },
    { id: "scanner-active-decode-drained", expected: 0, observed: finalScanner.activeDecodeCount, pass: finalScanner.activeDecodeCount === 0 },
    { id: "scanner-pending-frame-drained", expected: 0, observed: finalScanner.pendingFrameCount, pass: finalScanner.pendingFrameCount === 0 },
    { id: "scanner-pending-frame-bounded", expected: "<=1", observed: finalScanner.peakPendingFrameCount, pass: finalScanner.peakPendingFrameCount <= 1 },
    { id: "tracker-active-state-drained", expected: 0, observed: finalTracker.activeTrackCount, pass: finalTracker.activeTrackCount === 0 },
    { id: "tracker-lost-state-drained", expected: 0, observed: finalTracker.lostTrackCount, pass: finalTracker.lostTrackCount === 0 },
    { id: "tracker-pending-observations-drained", expected: 0, observed: finalTracker.pendingObservationCount, pass: finalTracker.pendingObservationCount === 0 },
    { id: "wasm-input-allocation-released", expected: 0, observed: finalScanner.wasmInputAllocationBytes, pass: finalScanner.wasmInputAllocationBytes === 0 },
    { id: "wasm-native-results-released", expected: 0, observed: finalScanner.wasmActiveNativeResultCount, pass: finalScanner.wasmActiveNativeResultCount === 0 },
    { id: "wasm-native-boundary-observed", expected: `>=${expectedDecodeCount}`, observed: finalScanner.wasmReleasedNativeResultCount, pass: finalScanner.wasmReleasedNativeResultCount >= expectedDecodeCount },
    { id: "wasm-linear-memory-observed", expected: ">0", observed: runningScanner.wasmPeakLinearMemoryBytes, pass: runningScanner.wasmPeakLinearMemoryBytes > 0 },
    { id: "worker-realm-linear-memory-released", expected: 0, observed: finalScanner.currentWorkerMemory, pass: finalScanner.currentWorkerMemory === 0 },
    { id: "controlled-memory-final", expected: 0, observed: finalControlledMemory, pass: finalControlledMemory === 0 },
    { id: "no-stale-public-events", expected: 0, observed: finalScanner.staleEvents, pass: finalScanner.staleEvents === 0 },
    { id: "no-stale-results", expected: 0, observed: finalScanner.staleResultsDiscarded, pass: finalScanner.staleResultsDiscarded === 0 },
    { id: "all-owned-frames-released", expected: iterations, observed: observed.disposedFrames, pass: observed.disposedFrames === iterations },
    { id: "no-page-errors", expected: 0, observed: pageErrors, pass: pageErrors.length === 0 },
    { id: "no-console-errors", expected: 0, observed: consoleErrors, pass: consoleErrors.length === 0 },
  ];
  const failureReasons = assertions.filter((assertion) => !assertion.pass).map((assertion) => assertion.id);
  const report = {
    schemaVersion: "2.0-beta2",
    kind: "tracking-worker-wasm-soak",
    tier: iterations >= 10_000 ? "extended" : iterations >= 1_000 ? "pull-request" : "development-smoke",
    workerEvidence: "actual-browser-worker",
    wasmEvidence: "actual-zxing-cpp-wasm",
    multiCodeEvidence: "scanner-observation-set-to-barcode-tracker",
    decoderOwnership: "soak-harness-owned-and-disposed",
    sourceCommit: git("rev-parse", "HEAD"),
    sourceTree: git("rev-parse", "HEAD^{tree}"),
    repositoryDirty: git("status", "--porcelain", "--untracked-files=all").length > 0,
    fixture: {
      file: path.relative(root, fixture).replaceAll("\\", "/"),
      provenance: "project-generated",
      expectedPayloads,
      expectedFormat: "qr_code",
      expectedResultCount: expectedPayloads.length,
    },
    expected: {
      actualWorkerWasmDecodeCount: expectedDecodeCount,
      completeMultiCodeObservationSets: iterations,
      stableTrackCount: expectedPayloads.length,
      workerCreatedCount: 1,
      workerTerminatedCount: 1,
      peakActiveTaskCountMaximum: 1,
      finalActiveTaskCount: 0,
      finalPendingFrameCount: 0,
      finalActiveTrackCount: 0,
      finalLostTrackCount: 0,
      finalPendingObservationCount: 0,
      wasmInputAllocationBytesFinal: 0,
      wasmActiveNativeResultCountFinal: 0,
      staleEvents: 0,
      finalControlledMemory: 0,
    },
    observed: {
      iterations,
      warmupFrames: 1,
      elapsedMs,
      averageSessionFrameMs: elapsedMs / iterations,
      effectiveFps: iterations * 1_000 / elapsedMs,
      finalControlledMemory,
      ...observed,
      consoleErrors,
      pageErrors,
    },
    assertions,
    pass: failureReasons.length === 0,
    failureReasons,
  };
  const output = path.join(root, "benchmark-results", "tracking", "worker-wasm-soak.json");
  await fs.promises.mkdir(path.dirname(output), { recursive: true });
  await fs.promises.writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (!report.pass) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
