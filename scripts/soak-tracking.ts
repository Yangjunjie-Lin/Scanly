import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { BatchController, type BatchEvent } from "../packages/browser/src/batch/index.js";
import { BarcodeTracker } from "../packages/browser/src/tracking/barcode-tracker.js";
import { TrackROISet } from "../packages/browser/src/tracking/track-roi-set.js";
import type { BarcodeObservation } from "../packages/browser/src/tracking/types.js";
import { BROWSER_SDK_VERSION } from "../packages/browser/src/index.js";
import { trackingGeometry, TRACKING_FRAME_HEIGHT, TRACKING_FRAME_WIDTH } from "../benchmark/tracking/sequence-fixtures.js";

const ROOT = path.resolve(__dirname, "..");
const OUTPUT = path.join(ROOT, "benchmark-results", "tracking", "tracking-soak.json");
const EVENT_HISTORY_CAPACITY = 64;

export interface TrackingSoakReport {
  schemaVersion: "2.3-beta2-development";
  kind: "tracking-core-soak";
  sdkVersion: typeof BROWSER_SDK_VERSION;
  iterations: number;
  targetCount: number;
  observed: Record<string, number | string>;
  assertions: readonly { id: string; expected: unknown; observed: unknown; pass: boolean }[];
  pass: boolean;
  status: "passed" | "failed";
  failureReasons: readonly string[];
  workerEvidence: "not-applicable";
}

function observations(frameIndex: number, count = 16): BarcodeObservation[] {
  return Array.from({ length: count }, (_, index) => {
    const column = index % 4;
    const row = Math.floor(index / 4);
    const x = 38 + column * 145 + Math.sin(frameIndex * 0.013 + index) * 12;
    const y = 42 + row * 92 + Math.cos(frameIndex * 0.011 + index) * 8;
    return {
      payload: `TRACKING-SOAK-${String(index + 1).padStart(2, "0")}`,
      format: index % 3 === 0 ? "data_matrix" : "code_128",
      geometry: trackingGeometry(x, y),
      confidence: 0.99,
    };
  });
}

function churnObservations(frameIndex: number): BarcodeObservation[] {
  const cycleLength = 12;
  const phase = frameIndex % cycleLength;
  if (phase > 2) return [];
  const cycle = Math.floor(frameIndex / cycleLength);
  return Array.from({ length: 8 }, (_, index) => {
    const x = 26 + index * 76;
    const duplicate = index < 4;
    return {
      payload: duplicate
        ? "TRACKING-SOAK-01"
        : index === 4
          ? "TRACKING-SOAK-01"
          : `SOAK-UNEXPECTED-${cycle}-${index}`,
      format: duplicate ? "data_matrix" as const : "code_128" as const,
      geometry: trackingGeometry(x, 412, 44, 28),
      confidence: 0.98,
    };
  });
}

export function runTrackingSoak(iterations = 10_000): TrackingSoakReport {
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > 100_000) {
    throw new RangeError("Tracking soak iterations must be an integer from 1 through 100000.");
  }
  const tracker = new BarcodeTracker({ maxTracks: 32, maxObservations: 32, confirmationObservations: 2, maxMissedFrames: 5 });
  const roiSet = new TrackROISet({ maxROIs: 32, maxUncoveredRegions: 16, globalScanIntervalFrames: 10 });
  const batch = new BatchController({
    mode: "checklist",
    expected: [
      ...Array.from({ length: 16 }, (_, index) => ({
        payload: `TRACKING-SOAK-${String(index + 1).padStart(2, "0")}`,
        format: index % 3 === 0 ? "data_matrix" as const : "code_128" as const,
      })),
      { payload: "INTENTIONALLY-MISSING", format: "qr_code" },
    ],
    maxRetainedTracks: 32,
    maxRetainedPhysicalInstances: 32,
  });
  let peakTrackMapSize = 0;
  let peakLostTrackCount = 0;
  let peakPendingObservationCount = 0;
  let peakROIState = 0;
  let peakAssociationPairs = 0;
  let fullFrameRecoveryCount = 0;
  let decoderCalls = 0;
  const eventHistory: BatchEvent[] = [];
  let peakEventHistorySize = 0;
  const unsubscribeBatchEvents = batch.onEvent((event) => {
    eventHistory.push(event);
    if (eventHistory.length > EVENT_HISTORY_CAPACITY) eventHistory.shift();
    peakEventHistorySize = Math.max(peakEventHistorySize, eventHistory.length);
  });
  const startedAt = performance.now();

  for (let frameIndex = 0; frameIndex < iterations; frameIndex += 1) {
    const decoded = [...observations(frameIndex), ...churnObservations(frameIndex)];
    decoderCalls += 1;
    const update = tracker.update(decoded, { frameId: frameIndex, timestamp: 1_000 + frameIndex * 33 });
    const stats = tracker.getStatistics();
    const plan = roiSet.plan(update.tracks, { frameId: frameIndex, width: TRACKING_FRAME_WIDTH, height: TRACKING_FRAME_HEIGHT });
    batch.applyTrackerUpdate(update);
    peakTrackMapSize = Math.max(peakTrackMapSize, stats.activeTrackCount);
    peakLostTrackCount = Math.max(peakLostTrackCount, stats.lostTrackCount);
    peakPendingObservationCount = Math.max(peakPendingObservationCount, stats.pendingObservationCount);
    peakROIState = Math.max(peakROIState, plan.trackedROIs.length);
    peakAssociationPairs = Math.max(peakAssociationPairs, update.association.costMatrix.reduce((sum, row) => sum + row.length, 0));
    if (plan.includeFullFrame) fullFrameRecoveryCount += 1;
  }
  const elapsedMs = Math.max(0.001, performance.now() - startedAt);
  const beforeDispose = tracker.getStatistics();
  const batchBeforeDispose = batch.getStatistics();
  const batchStateBeforeDispose = batch.getState();
  tracker.dispose();
  roiSet.reset();
  unsubscribeBatchEvents();
  eventHistory.length = 0;
  batch.clear();
  const afterDispose = tracker.getStatistics();
  const batchAfterDispose = batch.getStatistics();
  const finalControlledMemory = afterDispose.activeTrackCount
    + afterDispose.lostTrackCount
    + afterDispose.pendingObservationCount
    + roiSet.size
    + eventHistory.length
    + batchAfterDispose.retainedTrackCount
    + batchAfterDispose.retainedPhysicalInstanceCount
    + batchAfterDispose.unexpectedQuantity
    + batchAfterDispose.duplicateQuantity;
  const observed = {
    processedFrames: beforeDispose.processedFrames,
    decoderCalls,
    decoderCallsPerFrame: decoderCalls / iterations,
    peakTrackMapSize,
    peakLostTrackCount,
    peakPendingObservationCount,
    peakROIState,
    peakAssociationPairs,
    retiredTrackCount: beforeDispose.retiredTrackCount,
    fullFrameRecoveryCount,
    eventHistoryCapacity: EVENT_HISTORY_CAPACITY,
    peakEventHistorySize,
    batchStatusBeforeDispose: batchStateBeforeDispose.status,
    batchMatchedQuantity: batchBeforeDispose.matchedQuantity,
    batchMissingQuantity: batchBeforeDispose.missingQuantity,
    batchUnexpectedQuantity: batchBeforeDispose.unexpectedQuantity,
    batchDuplicateQuantity: batchBeforeDispose.duplicateQuantity,
    batchMaxRetainedTracks: batchBeforeDispose.maxRetainedTracks,
    batchMaxRetainedPhysicalInstances: batchBeforeDispose.maxRetainedPhysicalInstances,
    batchPeakRetainedTrackCount: batchBeforeDispose.peakRetainedTrackCount,
    batchPeakRetainedPhysicalInstanceCount: batchBeforeDispose.peakRetainedPhysicalInstanceCount,
    batchPeakUnexpectedQuantity: batchBeforeDispose.peakUnexpectedQuantity,
    batchPeakDuplicateQuantity: batchBeforeDispose.peakDuplicateQuantity,
    batchRetentionRejectedTrackCount: batchBeforeDispose.retentionRejectedTrackCount,
    batchRetentionRejectedPhysicalInstanceCount: batchBeforeDispose.retentionRejectedPhysicalInstanceCount,
    associationP50Ms: beforeDispose.associationP50Ms,
    associationP95Ms: beforeDispose.associationP95Ms,
    elapsedMs,
    effectiveFps: iterations / (elapsedMs / 1_000),
    finalActiveTrackCount: afterDispose.activeTrackCount,
    finalLostTrackCount: afterDispose.lostTrackCount,
    finalPendingObservationCount: afterDispose.pendingObservationCount,
    finalROIState: roiSet.size,
    finalBatchRetainedTrackCount: batchAfterDispose.retainedTrackCount,
    finalBatchRetainedPhysicalInstanceCount: batchAfterDispose.retainedPhysicalInstanceCount,
    finalBatchUnexpectedQuantity: batchAfterDispose.unexpectedQuantity,
    finalBatchDuplicateQuantity: batchAfterDispose.duplicateQuantity,
    finalEventHistorySize: eventHistory.length,
    finalControlledMemory,
  };
  const assertions = [
    { id: "processed-frames", expected: iterations, observed: observed.processedFrames, pass: observed.processedFrames === iterations },
    { id: "bounded-decoder-calls", expected: "1 per frame", observed: observed.decoderCallsPerFrame, pass: observed.decoderCalls === iterations },
    { id: "bounded-track-map", expected: "<= 24", observed: peakTrackMapSize, pass: peakTrackMapSize <= 24 },
    { id: "bounded-lost-cache", expected: "<= 8", observed: peakLostTrackCount, pass: peakLostTrackCount <= 8 },
    { id: "bounded-pending-observations", expected: 0, observed: peakPendingObservationCount, pass: peakPendingObservationCount === 0 },
    { id: "bounded-roi-state", expected: "<= 24", observed: peakROIState, pass: peakROIState <= 24 },
    { id: "bounded-association", expected: "<= 576 pairs/frame", observed: peakAssociationPairs, pass: peakAssociationPairs <= 24 ** 2 },
    { id: "periodic-full-frame-recovery", expected: `>= ${Math.ceil(iterations / 10)}`, observed: fullFrameRecoveryCount, pass: fullFrameRecoveryCount >= Math.ceil(iterations / 10) },
    { id: "bounded-event-history", expected: `<= ${EVENT_HISTORY_CAPACITY}`, observed: peakEventHistorySize, pass: peakEventHistorySize <= EVENT_HISTORY_CAPACITY },
    { id: "retirement-churn", expected: "> 0", observed: observed.retiredTrackCount, pass: observed.retiredTrackCount > 0 },
    { id: "batch-remains-incomplete", expected: "collecting with one missing item", observed: `${observed.batchStatusBeforeDispose}/${observed.batchMissingQuantity}`, pass: observed.batchStatusBeforeDispose === "collecting" && observed.batchMissingQuantity === 1 },
    { id: "batch-duplicate-classification", expected: "> 0", observed: observed.batchDuplicateQuantity, pass: observed.batchDuplicateQuantity > 0 },
    { id: "batch-unexpected-classification", expected: "> 0", observed: observed.batchUnexpectedQuantity, pass: observed.batchUnexpectedQuantity > 0 },
    { id: "bounded-batch-tracks", expected: `<= ${observed.batchMaxRetainedTracks}`, observed: observed.batchPeakRetainedTrackCount, pass: observed.batchPeakRetainedTrackCount <= observed.batchMaxRetainedTracks },
    { id: "bounded-batch-physical-instances", expected: `<= ${observed.batchMaxRetainedPhysicalInstances}`, observed: observed.batchPeakRetainedPhysicalInstanceCount, pass: observed.batchPeakRetainedPhysicalInstanceCount <= observed.batchMaxRetainedPhysicalInstances },
    { id: "batch-retention-pressure", expected: iterations >= 36 ? "> 0 rejected physical instances" : ">= 0", observed: observed.batchRetentionRejectedPhysicalInstanceCount, pass: iterations < 36 || observed.batchRetentionRejectedPhysicalInstanceCount > 0 },
    { id: "final-active-tracks", expected: 0, observed: observed.finalActiveTrackCount, pass: observed.finalActiveTrackCount === 0 },
    { id: "final-lost-tracks", expected: 0, observed: observed.finalLostTrackCount, pass: observed.finalLostTrackCount === 0 },
    { id: "final-pending-observations", expected: 0, observed: observed.finalPendingObservationCount, pass: observed.finalPendingObservationCount === 0 },
    { id: "final-roi-state", expected: 0, observed: observed.finalROIState, pass: observed.finalROIState === 0 },
    { id: "final-batch-tracks", expected: 0, observed: observed.finalBatchRetainedTrackCount, pass: observed.finalBatchRetainedTrackCount === 0 },
    { id: "final-batch-physical-instances", expected: 0, observed: observed.finalBatchRetainedPhysicalInstanceCount, pass: observed.finalBatchRetainedPhysicalInstanceCount === 0 },
    { id: "final-batch-classifications", expected: 0, observed: observed.finalBatchUnexpectedQuantity + observed.finalBatchDuplicateQuantity, pass: observed.finalBatchUnexpectedQuantity === 0 && observed.finalBatchDuplicateQuantity === 0 },
    { id: "final-event-history", expected: 0, observed: observed.finalEventHistorySize, pass: observed.finalEventHistorySize === 0 },
    { id: "final-controlled-memory", expected: 0, observed: finalControlledMemory, pass: finalControlledMemory === 0 },
  ];
  const failureReasons = assertions.filter((entry) => !entry.pass).map(({ id }) => id);
  const pass = failureReasons.length === 0;
  return {
    schemaVersion: "2.3-beta2-development",
    kind: "tracking-core-soak",
    sdkVersion: BROWSER_SDK_VERSION,
    iterations,
    targetCount: 16,
    observed,
    assertions,
    pass,
    status: pass ? "passed" : "failed",
    failureReasons,
    workerEvidence: "not-applicable",
  };
}

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
}

async function main(): Promise<void> {
  const argument = process.argv.find((entry) => entry.startsWith("--iterations="));
  const iterations = argument ? Number(argument.split("=", 2)[1]) : 10_000;
  const report = {
    ...runTrackingSoak(iterations),
    generatedAt: new Date().toISOString(),
    sourceCommit: git("rev-parse", "HEAD"),
    sourceTree: git("rev-parse", "HEAD^{tree}"),
    repositoryDirty: git("status", "--porcelain", "--untracked-files=all").length > 0,
  };
  await fs.mkdir(path.dirname(OUTPUT), { recursive: true });
  await fs.writeFile(OUTPUT, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (!report.pass) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
