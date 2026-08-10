import { BatchController, type BatchControllerOptions } from "../../packages/browser/src/batch/index.js";
import { BarcodeTracker } from "../../packages/browser/src/tracking/barcode-tracker.js";
import type { BarcodeObservation, BarcodeTrack, BarcodeTrackerOptions } from "../../packages/browser/src/tracking/types.js";
import { TrackingEvaluator } from "./evaluator.js";
import type {
  PredictedTrackSnapshot,
  TrackingAssertion,
  TrackingBatchExpectation,
  TrackingLatencyMetrics,
  TrackingObservationFrame,
  TrackingScenarioReport,
  TrackingSequenceScenario,
} from "./types.js";

function percentile(values: readonly number[], quantile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * quantile) - 1))] ?? 0;
}

function assertion(id: string, pass: boolean, expected: unknown, observed: unknown, message: string): TrackingAssertion {
  return { id, pass, expected, observed, message };
}

/**
 * Counted deterministic multi-code boundary. It receives observation stimuli
 * only (never Ground Truth object IDs) and measures the real work required to
 * materialize the decoder-facing result set.
 */
class DeterministicObservationDriver {
  calls = 0;

  decode(frame: TrackingObservationFrame): { observations: BarcodeObservation[]; durationMs: number } {
    const startedAt = performance.now();
    this.calls += 1;
    const observations = frame.observations.map((entry) => {
      if (Object.prototype.hasOwnProperty.call(entry, "objectId")) {
        throw new Error("Tracking observation input must not contain Ground Truth object identity.");
      }
      return {
        payload: entry.payload,
        format: entry.format,
        geometry: {
          boundingBox: { ...entry.geometry.boundingBox },
          cornerPoints: entry.geometry.cornerPoints.map((point) => ({ ...point })),
          frameWidth: entry.geometry.frameWidth,
          frameHeight: entry.geometry.frameHeight,
        },
        confidence: entry.confidence,
      };
    });
    return { observations, durationMs: Math.max(0, performance.now() - startedAt) };
  }
}

function trackerOptions(scenario: TrackingSequenceScenario): BarcodeTrackerOptions {
  const options = scenario.trackerOptions;
  return {
    maxTracks: options?.maxTracks,
    maxObservations: options?.maxObservations,
    associationThreshold: options?.associationThreshold,
    confirmationObservations: options?.confirmationObservations,
    // The current public tracker uses one bounded missed-frame retention value.
    maxMissedFrames: options?.retirementFrames ?? options?.lostGraceFrames,
  };
}

function batchOptions(expectation: TrackingBatchExpectation): BatchControllerOptions {
  if (expectation.mode === "checklist") return { mode: expectation.mode, expected: expectation.expected };
  if (expectation.mode === "expected-count" || expectation.mode === "unique-physical-instance") {
    return { mode: expectation.mode, expectedCount: expectation.expectedCount };
  }
  return { mode: expectation.mode };
}

function snapshot(track: BarcodeTrack): PredictedTrackSnapshot {
  return {
    trackId: track.trackId,
    physicalInstanceId: track.physicalInstanceId,
    payload: track.payload,
    format: track.format,
    state: track.state,
    firstFrameId: track.firstFrameId,
    lastFrameId: track.lastFrameId,
    observationCount: track.observationCount,
    missedFrameCount: track.missedFrameCount,
    geometry: {
      boundingBox: { ...track.geometry.boundingBox },
      cornerPoints: track.geometry.cornerPoints.map((point) => ({ ...point })),
      frameWidth: track.geometry.frameWidth ?? 1,
      frameHeight: track.geometry.frameHeight ?? 1,
    },
  };
}

function assertBatch(expectation: TrackingBatchExpectation, observed: Record<string, unknown>): TrackingAssertion[] {
  const assertions = [
    assertion("batch-status", observed.status === expectation.status, expectation.status, observed.status, "Batch status must be derived from confirmed physical tracks."),
  ];
  if (expectation.mode === "expected-count" || expectation.mode === "unique-physical-instance") {
    const expectedObservedCount = expectation.confirmedPhysicalInstanceCount ?? expectation.expectedCount;
    assertions.push(assertion(
      "batch-confirmed-physical-count",
      Number(observed.confirmedPhysicalInstanceCount) === expectedObservedCount,
      expectedObservedCount,
      observed.confirmedPhysicalInstanceCount,
      "Expected-count completion must count distinct physical instances rather than decoder events.",
    ));
  } else if (expectation.mode === "checklist") {
    for (const [key, expected] of [
      ["matchedQuantity", expectation.matchedQuantity],
      ["missingQuantity", expectation.missingQuantity],
      ["unexpectedQuantity", expectation.unexpectedQuantity],
      ["duplicateQuantity", expectation.duplicateQuantity],
    ] as const) {
      assertions.push(assertion(
        `batch-${key}`,
        Number(observed[key]) === expected,
        expected,
        observed[key],
        `Checklist ${key} must match independent scenario truth.`,
      ));
    }
  }
  return assertions;
}

export async function runTrackingScenario(scenario: TrackingSequenceScenario): Promise<TrackingScenarioReport> {
  const tracker = new BarcodeTracker(trackerOptions(scenario));
  const batch = scenario.expected.batch ? new BatchController(batchOptions(scenario.expected.batch)) : undefined;
  const evaluator = new TrackingEvaluator(scenario.groundTruthTracks);
  const trackingDurations: number[] = [];
  const decoderDurations: number[] = [];
  const totalDurations: number[] = [];
  const associationPairs: number[] = [];
  const decoder = new DeterministicObservationDriver();
  const trackTimeline: Array<{ frameIndex: number; tracks: readonly PredictedTrackSnapshot[] }> = [];
  const startedAt = performance.now();

  for (const frame of scenario.observationFrames) {
    const totalStarted = performance.now();
    const decoded = decoder.decode(frame);
    const trackingStarted = performance.now();
    const update = tracker.update(decoded.observations, { frameId: frame.frameIndex, timestamp: frame.timestampMs });
    const trackingMs = Math.max(0, performance.now() - trackingStarted);
    trackingDurations.push(trackingMs);
    decoderDurations.push(decoded.durationMs);
    totalDurations.push(Math.max(0, performance.now() - totalStarted));
    associationPairs.push(update.association.costMatrix.reduce((sum, row) => sum + row.length, 0));
    batch?.applyTrackerUpdate(update);
    const tracks = update.tracks.map(snapshot);
    trackTimeline.push({ frameIndex: frame.frameIndex, tracks });
    evaluator.evaluateFrame(frame.frameIndex, tracks);
  }

  const elapsedMs = Math.max(0.001, performance.now() - startedAt);
  const evaluation = evaluator.finish();
  const beforeDisposeStatistics = tracker.getStatistics();
  const maximumAssociationPairs = Math.max(0, ...associationPairs);
  const batchState = batch?.getState();
  const batchStatistics = batch?.getStatistics();
  const batchObserved = batchState && batchStatistics
    ? { ...batchStatistics, mode: batchState.mode, status: batchState.status, expectedCount: batchState.expectedCount }
    : undefined;

  tracker.dispose();
  batch?.clear();
  const finalStatistics = tracker.getStatistics();
  const observed = {
    ...evaluation.metrics,
    ...(batchObserved ? { batch: batchObserved } : {}),
    finalActiveTrackCount: finalStatistics.activeTrackCount,
    finalLostTrackCount: finalStatistics.lostTrackCount,
    finalPendingObservationCount: finalStatistics.pendingObservationCount,
    finalControlledMemory: finalStatistics.activeTrackCount + finalStatistics.lostTrackCount + finalStatistics.pendingObservationCount,
  };

  const expected = scenario.expected;
  const assertions: TrackingAssertion[] = [
    assertion("ground-truth-object-count", observed.groundTruthObjectCount === expected.groundTruthObjectCount, expected.groundTruthObjectCount, observed.groundTruthObjectCount, "Evaluator must load every independent ground-truth object."),
    assertion("minimum-confirmed-tracks", expected.minimumConfirmedTrackCount === undefined || observed.confirmedTrackCount >= expected.minimumConfirmedTrackCount, expected.minimumConfirmedTrackCount ?? "n/a", observed.confirmedTrackCount, "Enough physical tracks must reach confirmed state."),
    assertion("maximum-confirmed-tracks", expected.maximumConfirmedTrackCount === undefined || observed.confirmedTrackCount <= expected.maximumConfirmedTrackCount, expected.maximumConfirmedTrackCount ?? "n/a", observed.confirmedTrackCount, "Confirmed identities must not multiply beyond truth."),
    assertion("identity-switches", observed.identitySwitchCount <= expected.maximumIdentitySwitchCount, `<= ${expected.maximumIdentitySwitchCount}`, observed.identitySwitchCount, "Per-frame identity association must remain stable."),
    assertion("track-fragmentation", observed.trackFragmentationCount <= expected.maximumTrackFragmentationCount, `<= ${expected.maximumTrackFragmentationCount}`, observed.trackFragmentationCount, "A continuous physical object must not split into extra track IDs."),
    assertion("false-tracks", observed.falseTrackCount <= expected.maximumFalseTrackCount, `<= ${expected.maximumFalseTrackCount}`, observed.falseTrackCount, "No unmatched confirmed track may be created."),
    assertion("track-recall", observed.trackRecall >= expected.minimumTrackRecall, `>= ${expected.minimumTrackRecall}`, observed.trackRecall, "Visible ground-truth observations must be associated."),
    assertion("track-precision", observed.trackPrecision >= expected.minimumTrackPrecision, `>= ${expected.minimumTrackPrecision}`, observed.trackPrecision, "Predicted visible tracks must correspond to truth."),
    assertion("bounded-decoder-calls", scenario.observationFrames.length === decoder.calls, "one instrumented multi-code observation-driver call/frame", `${decoder.calls}/${scenario.observationFrames.length}`, "Tracking must not expand N targets into N full decode calls."),
    assertion("bounded-association-pairs", maximumAssociationPairs <= (scenario.trackerOptions?.maxTracks ?? 32) * (scenario.trackerOptions?.maxObservations ?? 32), `<= ${(scenario.trackerOptions?.maxTracks ?? 32) * (scenario.trackerOptions?.maxObservations ?? 32)}`, maximumAssociationPairs, "Association work must remain inside configured track/observation bounds."),
    assertion("active-tracks-disposed", observed.finalActiveTrackCount === 0, 0, observed.finalActiveTrackCount, "Dispose must clear active tracks."),
    assertion("lost-tracks-disposed", observed.finalLostTrackCount === 0, 0, observed.finalLostTrackCount, "Dispose must clear lost-track retention."),
    assertion("pending-observations-disposed", observed.finalPendingObservationCount === 0, 0, observed.finalPendingObservationCount, "Dispose must clear pending observations."),
    assertion("controlled-memory-disposed", observed.finalControlledMemory === 0, 0, observed.finalControlledMemory, "All benchmark-controlled tracking state must be released."),
  ];

  if (expected.samePayloadInstanceSeparation) {
    const histories = Object.values(evaluation.objectTrackHistory);
    const firstIds = histories.map((history) => history[0]).filter((id): id is string => id !== undefined);
    const separated = histories.every((history) => history.length === 1) && new Set(firstIds).size === expected.groundTruthObjectCount;
    assertions.push(assertion(
      "same-payload-physical-instance-separation",
      separated,
      `${expected.groundTruthObjectCount} distinct stable track IDs`,
      evaluation.objectTrackHistory,
      "Track ID must not equal payload identity.",
    ));
  }
  if (expected.batch && batchObserved) assertions.push(...assertBatch(expected.batch, batchObserved));

  const trackerMetrics = beforeDisposeStatistics;
  const metrics: TrackingLatencyMetrics = {
    decoderEvidence: "deterministic-observation-driver",
    associationP50Ms: trackerMetrics.associationP50Ms,
    associationP95Ms: trackerMetrics.associationP95Ms,
    trackingP50Ms: percentile(trackingDurations, 0.5),
    trackingP95Ms: percentile(trackingDurations, 0.95),
    decoderP50Ms: percentile(decoderDurations, 0.5),
    decoderP95Ms: percentile(decoderDurations, 0.95),
    totalFrameP50Ms: percentile(totalDurations, 0.5),
    totalFrameP95Ms: percentile(totalDurations, 0.95),
    effectiveFps: scenario.observationFrames.length / (elapsedMs / 1_000),
    decoderCalls: decoder.calls,
    decoderCallsPerFrame: scenario.observationFrames.length === 0 ? 0 : decoder.calls / scenario.observationFrames.length,
    maximumAssociationPairs,
  };
  const failureReasons = assertions.filter((entry) => !entry.pass).map((entry) => `${entry.id}: ${entry.message}`);
  return {
    id: scenario.id,
    category: scenario.category,
    description: scenario.description,
    expected,
    observed,
    assertions,
    pass: failureReasons.length === 0,
    failureReasons,
    metrics,
    frameEvaluations: evaluation.frameEvaluations,
    objectTrackHistory: evaluation.objectTrackHistory,
    trackTimeline,
  };
}
