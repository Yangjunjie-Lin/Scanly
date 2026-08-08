import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRgbaFrame, type NormalizedFrame, type ScanOutcome, type ScanResult } from "@scanly/core";
import {
  DeterministicFrameSequenceSource,
  ScannerSession,
  type ScannerFrameDecoder,
} from "@scanly/browser";

const root = path.resolve(__dirname, "..");
const argument = process.argv.find((item) => item.startsWith("--iterations="));
const iterations = argument ? Number(argument.split("=", 2)[1]) : 10_000;
if (!Number.isInteger(iterations) || iterations < 1 || iterations > 100_000) {
  throw new Error("iterations must be an integer from 1 to 100000");
}

type Assertion = { id: string; expected: unknown; observed: unknown; pass: boolean };

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function makeFrame(index: number, onDispose: () => void): NormalizedFrame {
  const data = new Uint8ClampedArray(16 * 16 * 4);
  for (let offset = 0; offset < data.length; offset += 4) {
    const value = ((offset >> 2) + index) % 2 === 0 ? 24 : 224;
    data[offset] = value;
    data[offset + 1] = value;
    data[offset + 2] = value;
    data[offset + 3] = 255;
  }
  return createRgbaFrame(data, 16, 16, {
    id: `scanner-core-soak-${index}`,
    timestampMs: index + 1,
    sourceType: "camera",
    ownership: "owned",
    dispose: onDispose,
  });
}

function coreResult(frameId: string): ScanResult {
  return {
    format: "qr_code",
    rawText: "CORE-SOAK",
    cornerPoints: [{ x: 3, y: 3 }, { x: 11, y: 3 }, { x: 11, y: 11 }, { x: 3, y: 11 }],
    engine: { id: "jsqr", version: "core-soak" },
    preprocessingPath: [],
    frameId,
    structuredPayload: null,
    validation: { valid: true, validatorIds: [], messages: [] },
    warnings: [],
    timing: { totalMs: 0 },
  };
}

async function waitForStopped(session: ScannerSession): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (session.getState() !== "stopped") {
    if (Date.now() >= deadline) throw new Error(`Scanner Core Soak did not stop (state=${session.getState()}).`);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}

async function main(): Promise<void> {
  let disposedFrames = 0;
  let decodeCalls = 0;
  let roiRequests = 0;
  let temporalStatePeak = 0;
  const source = new DeterministicFrameSequenceSource(function* () {
    for (let index = 0; index < iterations; index += 1) {
      yield makeFrame(index, () => { disposedFrames += 1; });
    }
  });
  const decoder: ScannerFrameDecoder = {
    async decode(frame, request): Promise<ScanOutcome> {
      decodeCalls += 1;
      if (request.roi) roiRequests += 1;
      const result = coreResult(frame.id);
      return {
        ok: true,
        results: [result],
        primary: result,
        frameId: frame.id,
        scenarioId: "scanner-core-soak",
        attemptCount: 1,
        timing: { totalMs: 0 },
      };
    },
    cancel() {},
    dispose() {},
    getStatistics: () => ({
      workerCreatedCount: 0,
      workerTerminatedCount: 0,
      activeTaskCount: 0,
      peakActiveTaskCount: 0,
    }),
  };
  const session = new ScannerSession({
    source,
    decoder,
    quality: {
      sampleTarget: 256,
      underexposedThreshold: 0,
      overexposedThreshold: 1,
      blurThreshold: 0,
      contrastThreshold: 0,
      glareThreshold: 1,
    },
    confirmation: { mode: "immediate" },
    repeatPolicy: { mode: "once-per-session" },
    roi: { timeoutMs: Math.max(2_500, iterations + 10) },
  });
  session.onDiagnostics((diagnostic) => {
    if (diagnostic.event?.type === "emitted" || diagnostic.event?.type === "suppressed") {
      temporalStatePeak = Math.max(temporalStatePeak, session.getStatistics().finalControlledMemory);
    }
  });

  const startedAt = performance.now();
  await session.start();
  await source.finished();
  await waitForStopped(session);
  const beforeDispose = session.getStatistics();
  await session.dispose();
  const afterDispose = session.getStatistics();
  const elapsedMs = performance.now() - startedAt;

  const assertions: Assertion[] = [
    { id: "captured-frames", expected: iterations, observed: beforeDispose.capturedFrames, pass: beforeDispose.capturedFrames === iterations },
    { id: "admitted-frames", expected: iterations, observed: beforeDispose.admittedFrames, pass: beforeDispose.admittedFrames === iterations },
    { id: "core-decode-calls", expected: iterations, observed: decodeCalls, pass: decodeCalls === iterations },
    { id: "core-decode-successes", expected: iterations, observed: afterDispose.decodeSuccesses, pass: afterDispose.decodeSuccesses === iterations },
    { id: "temporal-confirmation-exercised", expected: 1, observed: afterDispose.confirmedEvents, pass: afterDispose.confirmedEvents >= 1 },
    { id: "once-session-repeat-suppression-exercised", expected: Math.max(0, iterations - 1), observed: afterDispose.suppressedRepeats, pass: afterDispose.suppressedRepeats === Math.max(0, iterations - 1) },
    { id: "roi-follow-up-requests", expected: Math.max(0, iterations - 1), observed: roiRequests, pass: roiRequests === Math.max(0, iterations - 1) },
    { id: "temporal-state-observed-before-stop", expected: "> 0", observed: temporalStatePeak, pass: temporalStatePeak > 0 },
    { id: "owned-frames-released", expected: iterations, observed: disposedFrames, pass: disposedFrames === iterations },
    { id: "active-decodes-drained", expected: 0, observed: afterDispose.activeDecodeCount, pass: afterDispose.activeDecodeCount === 0 },
    { id: "pending-frames-drained", expected: 0, observed: afterDispose.pendingFrameCount, pass: afterDispose.pendingFrameCount === 0 },
    { id: "controlled-memory-released", expected: 0, observed: afterDispose.finalControlledMemory, pass: afterDispose.finalControlledMemory === 0 },
    { id: "no-stale-public-events", expected: 0, observed: afterDispose.staleEvents, pass: afterDispose.staleEvents === 0 },
    { id: "worker-evidence-not-faked", expected: 0, observed: afterDispose.workerCreatedCount, pass: afterDispose.workerCreatedCount === 0 },
  ];
  const failureReasons = assertions.filter((assertion) => !assertion.pass).map((assertion) => assertion.id);
  const report = {
    schemaVersion: "2.0-beta1",
    kind: "scanner-core-soak",
    sourceCommit: git("rev-parse", "HEAD"),
    sourceTree: git("rev-parse", "HEAD^{tree}"),
    repositoryDirty: git("status", "--porcelain", "--untracked-files=all").length > 0,
    workerEvidence: "not-applicable",
    expected: {
      frames: iterations,
      activeDecodeCountFinal: 0,
      pendingFrameCountFinal: 0,
      finalControlledMemory: 0,
      staleEvents: 0,
    },
    observed: {
      ...afterDispose,
      decodeCalls,
      decodeSuccesses: afterDispose.decodeSuccesses,
      roiRequests,
      temporalStatePeak,
      disposedFrames,
      elapsedMs,
      averageCoreFrameMs: elapsedMs / iterations,
    },
    assertions,
    pass: failureReasons.length === 0,
    failureReasons,
  };

  const output = path.join(root, "benchmark-results", "realtime", "core-soak.json");
  await fs.promises.mkdir(path.dirname(output), { recursive: true });
  await fs.promises.writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (!report.pass) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
