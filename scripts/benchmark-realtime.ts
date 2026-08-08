import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import {
  createRgbaFrame,
  type NormalizedFrame,
  type ScanOutcome,
  type ScanResult,
} from "@scanly/core";
import {
  BROWSER_SDK_VERSION,
  DeterministicFrameSequenceSource,
  ScannerSession,
  type ScannerFrameDecoder,
  type ScannerSessionStatistics,
} from "@scanly/browser";
import {
  REALTIME_SCENARIO_DRIVERS,
  runRealtimeScenario,
  type RealtimeScenarioAssertion,
  type RealtimeScenarioReport,
} from "../benchmark/realtime/scenario-drivers.js";

const ROOT = path.resolve(__dirname, "..");
const OUTPUT = path.join(ROOT, "benchmark-results", "realtime", "sequence-results.json");
const WORKER_SOAK_OUTPUT = path.join(ROOT, "benchmark-results", "realtime", "worker-wasm-soak.json");
const requireWorkerWasm = process.argv.includes("--require-worker-wasm");
const allowMissingWorkerWasm = process.argv.includes("--allow-missing-worker-wasm");
const REQUIRED_REALTIME_SCENARIO_IDS = [
  "sequence-a-escalation",
  "sequence-b-repeat-50",
  "sequence-c-same-payload-two-entities",
  "sequence-d-blur-to-clear",
  "sequence-e-roi-motion",
  "sequence-f-lost-reentry",
  "sequence-g-underexposed-probe",
  "sequence-h-glare-recovery",
  "sequence-i-fast-confirm",
  "sequence-j-balanced-probe",
  "sequence-k-robust-bound",
  "sequence-l-pause-resume",
  "sequence-m-stop-restart",
  "sequence-n-cancellation",
  "sequence-o-frame-drop",
  "sequence-p-geometry-stable",
  "sequence-q-geometry-jitter",
  "sequence-r-invalid-frame",
  "sequence-s-worker-recovery",
  "sequence-t-disposal",
] as const;

interface SoakReport {
  schemaVersion: string;
  kind: string;
  sourceCommit: string;
  sourceTree: string;
  repositoryDirty: boolean;
  expected: Record<string, unknown>;
  observed: Record<string, unknown>;
  assertions: RealtimeScenarioAssertion[];
  pass: boolean;
  failureReasons: string[];
  workerEvidence?: "not-applicable";
  status?: "passed" | "failed" | "pending" | "skipped" | "unavailable";
}

interface AggregateAssertion {
  id: string;
  expected: unknown;
  observed: unknown;
  pass: boolean;
  sourceScenarioIds: string[];
}

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
}

function repositoryIdentity(): { sourceCommit: string; sourceTree: string; repositoryDirty: boolean } {
  return {
    sourceCommit: git("rev-parse", "HEAD"),
    sourceTree: git("rev-parse", "HEAD^{tree}"),
    repositoryDirty: git("status", "--porcelain", "--untracked-files=all").length > 0,
  };
}

function coreFrame(index: number, onDispose: () => void): NormalizedFrame {
  const width = 16;
  const height = 16;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let offset = 0; offset < data.length; offset += 4) {
    const value = ((offset / 4) + index) % 2 === 0 ? 20 : 235;
    data[offset] = value;
    data[offset + 1] = value;
    data[offset + 2] = value;
    data[offset + 3] = 255;
  }
  return createRgbaFrame(data, width, height, {
    id: `scanner-core-soak:${index}`,
    timestampMs: index + 1,
    sourceType: "camera",
    ownership: "owned",
    dispose: onDispose,
  });
}

function coreSoakResult(frameId: string): ScanResult {
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

async function waitForStopped(session: ScannerSession, label: string): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (session.getState() !== "stopped") {
    if (Date.now() >= deadline) throw new Error(`${label} did not stop (state=${session.getState()}).`);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}

function soakAssertion(id: string, pass: boolean, expected: unknown, observed: unknown, message: string): RealtimeScenarioAssertion {
  return { id, pass, expected, observed, message };
}

async function runCoreSoak(identity: ReturnType<typeof repositoryIdentity>, frames = 10_000): Promise<SoakReport> {
  let disposedFrames = 0;
  let decodeCalls = 0;
  let roiRequests = 0;
  let temporalStatePeak = 0;
  const source = new DeterministicFrameSequenceSource(function* () {
    for (let index = 0; index < frames; index += 1) yield coreFrame(index, () => { disposedFrames += 1; });
  });
  const decoder: ScannerFrameDecoder = {
    async decode(frame, request): Promise<ScanOutcome> {
      decodeCalls += 1;
      if (request.roi) roiRequests += 1;
      const result = coreSoakResult(frame.id);
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
    getStatistics: () => ({ workerCreatedCount: 0, workerTerminatedCount: 0, activeTaskCount: 0, peakActiveTaskCount: 0 }),
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
    roi: { timeoutMs: Math.max(2_500, frames + 10) },
    scheduler: { initialDecodeFps: 1_000, minimumDecodeFps: 1_000, maximumDecodeFps: 1_000 },
  });
  session.onDiagnostics((diagnostic) => {
    if (diagnostic.event?.type === "emitted" || diagnostic.event?.type === "suppressed") {
      temporalStatePeak = Math.max(temporalStatePeak, session.getStatistics().finalControlledMemory);
    }
  });
  const startedAt = performance.now();
  await session.start();
  await source.finished();
  await waitForStopped(session, "Scanner Core Soak");
  await session.dispose();
  const observed = session.getStatistics();
  const elapsedMs = performance.now() - startedAt;
  const assertions = [
    soakAssertion("captured-frames", observed.capturedFrames === frames, frames, observed.capturedFrames, "Core soak must capture every generated frame."),
    soakAssertion("admitted-frames", observed.admittedFrames === frames, frames, observed.admittedFrames, "Core soak must exercise every frame through the scheduler."),
    soakAssertion("decode-calls", decodeCalls === frames, frames, decodeCalls, "Fake/core decoder must execute once per admitted frame."),
    soakAssertion("decode-successes", observed.decodeSuccesses === frames, frames, observed.decodeSuccesses, "Core soak must exercise the temporal path with successful observations."),
    soakAssertion("temporal-confirmation-exercised", observed.confirmedEvents >= 1, ">= 1", observed.confirmedEvents, "Core soak must populate and confirm a temporal candidate."),
    soakAssertion("once-session-repeat-suppression-exercised", observed.suppressedRepeats === Math.max(0, frames - 1), Math.max(0, frames - 1), observed.suppressedRepeats, "Core soak must exercise repeat suppression after the first emission."),
    soakAssertion("roi-follow-up-requests", roiRequests === Math.max(0, frames - 1), Math.max(0, frames - 1), roiRequests, "Core soak must issue ROI-bearing requests after the first geometry result."),
    soakAssertion("temporal-state-observed-before-stop", temporalStatePeak > 0, "> 0", temporalStatePeak, "Core soak must observe nonzero temporal state before lifecycle cleanup."),
    soakAssertion("owned-frames-released", disposedFrames === frames, frames, disposedFrames, "Every owned frame must be released."),
    soakAssertion("active-decodes-drained", observed.activeDecodeCount === 0, 0, observed.activeDecodeCount, "Core soak must drain active decode state."),
    soakAssertion("pending-frames-drained", observed.pendingFrameCount === 0, 0, observed.pendingFrameCount, "Core soak must drain pending frame state."),
    soakAssertion("controlled-memory-released", observed.finalControlledMemory === 0, 0, observed.finalControlledMemory, "Core soak must release controlled memory."),
    soakAssertion("no-stale-public-events", observed.staleEvents === 0, 0, observed.staleEvents, "Core soak must emit no stale public event."),
    soakAssertion("worker-evidence-not-applicable", observed.workerCreatedCount === 0, 0, observed.workerCreatedCount, "A fake decoder cannot count as persistent Worker evidence."),
  ];
  const failureReasons = assertions.filter((entry) => !entry.pass).map((entry) => `${entry.id}: ${entry.message}`);
  return {
    schemaVersion: "2.0-beta1",
    kind: "scanner-core-soak",
    ...identity,
    workerEvidence: "not-applicable",
    expected: {
      frames,
      workerEvidence: "not-applicable",
      activeDecodeCountFinal: 0,
      pendingFrameCountFinal: 0,
      finalControlledMemory: 0,
      staleEvents: 0,
    },
    observed: { ...observed, decodeCalls, roiRequests, temporalStatePeak, disposedFrames, elapsedMs, averageCoreFrameMs: elapsedMs / frames },
    assertions,
    pass: failureReasons.length === 0,
    status: failureReasons.length === 0 ? "passed" : "failed",
    failureReasons,
  };
}

async function loadWorkerWasmSoak(identity: ReturnType<typeof repositoryIdentity>): Promise<SoakReport> {
  try {
    const report = JSON.parse(await fs.readFile(WORKER_SOAK_OUTPUT, "utf8")) as SoakReport;
    const assertions = Array.isArray(report.assertions) ? [...report.assertions] : [];
    const observation = report.observed as { iterations?: unknown; afterDispose?: Record<string, unknown> };
    const final = observation.afterDispose ?? {};
    const iterations = Number(observation.iterations ?? 0);
    const workerCreatedCount = Number(final.workerCreatedCount ?? 0);
    const workerTerminatedCount = Number(final.workerTerminatedCount ?? 0);
    const workerWasmDecodeCount = Number(final.workerWasmDecodeCount ?? 0);
    const peakActiveTaskCount = Number(final.peakActiveTaskCount ?? 0);
    const activeTaskCount = Number(final.activeTaskCount ?? 0);
    const pendingFrameCount = Number(final.pendingFrameCount ?? 0);
    const activeDecodeCount = Number(final.activeDecodeCount ?? 0);
    const wasmInputAllocationBytes = Number(final.wasmInputAllocationBytes ?? 0);
    const wasmActiveNativeResultCount = Number(final.wasmActiveNativeResultCount ?? 0);
    const finalControlledMemory = Number(final.finalControlledMemory ?? 0);
    const staleEvents = Number(final.staleEvents ?? 0);
    assertions.push(
      soakAssertion("worker-soak-schema", report.schemaVersion === "2.0-beta1", "2.0-beta1", report.schemaVersion, "Worker/WASM report schema must match realtime evidence."),
      soakAssertion("worker-soak-kind", report.kind === "scanner-worker-wasm-soak", "scanner-worker-wasm-soak", report.kind, "Worker/WASM report kind must be explicit."),
      soakAssertion("worker-soak-source-commit", report.sourceCommit === identity.sourceCommit, identity.sourceCommit, report.sourceCommit, "Worker/WASM evidence must come from the exact source commit."),
      soakAssertion("worker-soak-source-tree", report.sourceTree === identity.sourceTree, identity.sourceTree, report.sourceTree, "Worker/WASM evidence must come from the exact source tree."),
      soakAssertion("worker-soak-repository-state", report.repositoryDirty === identity.repositoryDirty, identity.repositoryDirty, report.repositoryDirty, "Worker/WASM evidence and sequence evidence must share the same clean/dirty repository state."),
      soakAssertion("worker-soak-real-frame-count", iterations >= 1_000 && workerWasmDecodeCount >= iterations, ">= 1000 actual Worker/WASM frames", { iterations, workerWasmDecodeCount }, "The aggregate report must independently verify the real Worker/WASM execution count."),
      soakAssertion("worker-soak-persistent-worker", workerCreatedCount === 1 && workerTerminatedCount === 1, { created: 1, terminated: 1 }, { created: workerCreatedCount, terminated: workerTerminatedCount }, "Worker evidence requires exactly one persistent Worker and one owned termination."),
      soakAssertion("worker-soak-active-task-bound", peakActiveTaskCount >= 1 && peakActiveTaskCount <= 1 && activeTaskCount === 0, { peak: 1, final: 0 }, { peak: peakActiveTaskCount, final: activeTaskCount }, "Worker tasks must remain single-active and drain after disposal."),
      soakAssertion("worker-soak-scanner-drained", pendingFrameCount === 0 && activeDecodeCount === 0, { pending: 0, activeDecode: 0 }, { pending: pendingFrameCount, activeDecode: activeDecodeCount }, "Scanner scheduler state must drain after Worker/WASM soak disposal."),
      soakAssertion("worker-soak-wasm-resources-drained", wasmInputAllocationBytes === 0 && wasmActiveNativeResultCount === 0 && finalControlledMemory === 0, { inputBytes: 0, nativeResults: 0, controlledMemory: 0 }, { inputBytes: wasmInputAllocationBytes, nativeResults: wasmActiveNativeResultCount, controlledMemory: finalControlledMemory }, "Live WASM/native and controlled resources must be zero after disposal."),
      soakAssertion("worker-soak-no-stale-events", staleEvents === 0, 0, staleEvents, "Worker/WASM soak must emit no stale public event."),
    );
    const failureReasons = assertions.filter((entry) => !entry.pass).map((entry) => `${entry.id}: ${entry.message}`);
    return {
      ...report,
      assertions,
      pass: report.pass === true && failureReasons.length === 0,
      status: report.pass === true && failureReasons.length === 0 ? "passed" : "failed",
      failureReasons: [...(report.failureReasons ?? []), ...failureReasons],
    };
  } catch (error) {
    const unavailable = error instanceof Error ? error.message : String(error);
    return {
      schemaVersion: "2.0-beta1",
      kind: "scanner-worker-wasm-soak",
      ...identity,
      expected: { minimumActualWorkerWasmFrames: 1_000, workerCreatedCount: 1, workerTerminatedCount: 1 },
      observed: { evidenceFile: path.relative(ROOT, WORKER_SOAK_OUTPUT).replaceAll("\\", "/"), unavailable },
      assertions: [soakAssertion("worker-wasm-evidence-available", false, "passed exact-source Worker/WASM report", "unavailable", "Worker/WASM evidence is produced by its dedicated real-browser soak gate.")],
      pass: false,
      status: "unavailable",
      failureReasons: ["worker-wasm-evidence-available: dedicated Worker/WASM report is unavailable"],
    };
  }
}

function scenarioById(reports: readonly RealtimeScenarioReport[], id: string): RealtimeScenarioReport {
  const report = reports.find((entry) => entry.id === id);
  if (!report) throw new Error(`Missing realtime scenario report: ${id}`);
  return report;
}

function aggregateGates(reports: readonly RealtimeScenarioReport[], coreSoak: SoakReport, workerWasmSoak: SoakReport) {
  const once = scenarioById(reports, "sequence-b-repeat-50");
  const physical = scenarioById(reports, "sequence-c-same-payload-two-entities");
  const pressure = scenarioById(reports, "sequence-o-frame-drop");
  const falseConfirmedScans = reports.reduce((sum, report) => sum + report.observed.falseConfirmedScans, 0);
  const staleEvents = reports.reduce((sum, report) => sum + report.metrics.staleEvents, 0);
  const duplicateEventsUnderOncePerSession = Math.max(0, once.observed.emittedEvents.length - once.expected.emittedEvents.length);
  const physicalInstanceIds = new Set(physical.observed.physicalInstanceIds).size;
  const peakPendingFrameCount = Math.max(...reports.map((report) => report.metrics.peakPendingFrameCount));
  const observedIds = reports.map((report) => report.id);
  const exactScenarioSet = observedIds.length === REQUIRED_REALTIME_SCENARIO_IDS.length
    && REQUIRED_REALTIME_SCENARIO_IDS.every((id) => observedIds.includes(id))
    && observedIds.every((id) => REQUIRED_REALTIME_SCENARIO_IDS.includes(id as typeof REQUIRED_REALTIME_SCENARIO_IDS[number]));
  const gate = (id: string, expected: unknown, observed: unknown, pass: boolean, sourceScenarioIds: string[]): AggregateAssertion => ({ id, expected, observed, pass, sourceScenarioIds });
  const scenarioIds = [...REQUIRED_REALTIME_SCENARIO_IDS];
  const integrationAssertions: AggregateAssertion[] = [
    gate("required-scenario-set", REQUIRED_REALTIME_SCENARIO_IDS, observedIds, exactScenarioSet, scenarioIds),
    gate("all-scenario-assertions", true, reports.every((report) => report.pass), exactScenarioSet && reports.every((report) => report.pass), scenarioIds),
    gate("false-confirmed-scans", 0, falseConfirmedScans, falseConfirmedScans === 0, scenarioIds),
    gate("stale-public-events", 0, staleEvents, staleEvents === 0, scenarioIds),
    gate("once-session-duplicates", 0, duplicateEventsUnderOncePerSession, duplicateEventsUnderOncePerSession === 0, [once.id]),
    gate("same-payload-physical-instances", physical.expected.physicalInstanceCount, physicalInstanceIds, physicalInstanceIds === physical.expected.physicalInstanceCount, [physical.id]),
    gate("backpressure-frame-drops", `>= ${pressure.expected.minimumDroppedFrames ?? 0}`, pressure.metrics.droppedFrames, pressure.metrics.droppedFrames >= (pressure.expected.minimumDroppedFrames ?? 0), [pressure.id]),
    gate("pending-frame-queue-bound", "<= 1", peakPendingFrameCount, peakPendingFrameCount <= 1, scenarioIds),
    gate("scanner-core-soak", true, coreSoak.pass, coreSoak.pass, ["scanner-core-soak"]),
  ];
  const workerAssertion = gate("scanner-worker-wasm-soak", true, workerWasmSoak.pass, workerWasmSoak.pass, ["scanner-worker-wasm-soak"]);
  const assertions = [...integrationAssertions, workerAssertion];
  const integrationPass = integrationAssertions.every((entry) => entry.pass);
  const pass = assertions.every((entry) => entry.pass);
  return {
    assertions,
    summary: {
      falseConfirmedScans,
      staleEvents,
      duplicateEventsUnderOncePerSession,
      samePayloadPhysicalInstanceCount: physicalInstanceIds,
      frameDropScenarioDrops: pressure.metrics.droppedFrames,
      peakPendingFrameCount,
    },
    integrationPass,
    pass,
  };
}

async function main(): Promise<void> {
  if (requireWorkerWasm && allowMissingWorkerWasm) throw new Error("Worker/WASM evidence cannot be both required and optional.");
  const identity = repositoryIdentity();
  const scenarios: RealtimeScenarioReport[] = [];
  for (const driver of REALTIME_SCENARIO_DRIVERS) {
    const report = await runRealtimeScenario(driver);
    scenarios.push(report);
    console.log(`${report.pass ? "PASS" : "FAIL"} ${report.id}`);
    for (const failure of report.failureReasons) console.error(`  ${failure}`);
  }
  const coreSoak = await runCoreSoak(identity);
  const workerWasmSoak = await loadWorkerWasmSoak(identity);
  const aggregate = aggregateGates(scenarios, coreSoak, workerWasmSoak);
  const report = {
    schemaVersion: "2.0-beta1",
    ...identity,
    sdkVersion: BROWSER_SDK_VERSION,
    scenarioCount: scenarios.length,
    scenarios,
    coreSoak,
    workerWasmSoak,
    aggregateGates: aggregate,
  };
  await fs.mkdir(path.dirname(OUTPUT), { recursive: true });
  await fs.writeFile(OUTPUT, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    schemaVersion: report.schemaVersion,
    sourceCommit: report.sourceCommit,
    sourceTree: report.sourceTree,
    repositoryDirty: report.repositoryDirty,
    scenarioCount: report.scenarioCount,
    scenariosPassed: scenarios.filter((entry) => entry.pass).length,
    coreSoak: coreSoak.status,
    workerWasmSoak: workerWasmSoak.status,
    aggregateGates: aggregate,
  }, null, 2));
  const requiredPass = allowMissingWorkerWasm ? aggregate.integrationPass : aggregate.pass;
  const exactSourcePass = !requireWorkerWasm || (!identity.repositoryDirty && workerWasmSoak.repositoryDirty === false);
  if (!requiredPass || !exactSourcePass) throw new Error(allowMissingWorkerWasm
    ? "Realtime Scanner scenario/core integration gates failed."
    : requireWorkerWasm && !exactSourcePass
      ? "Exact-source Worker/WASM evidence requires a clean repository for both producer and aggregate report."
      : "Realtime Scanner complete aggregate gates, including Worker/WASM evidence, failed.");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
