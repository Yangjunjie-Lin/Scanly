import {
  BatchController,
  type BatchControllerOptions,
  type BatchEvent,
  type BatchState,
  type BatchStatistics,
} from "../../packages/browser/src/batch/index.js";
import { BarcodeTracker } from "../../packages/browser/src/tracking/barcode-tracker.js";
import type { BarcodeObservation, BarcodeTrack, BarcodeTrackerOptions } from "../../packages/browser/src/tracking/types.js";
import { TrackingEvaluator } from "./evaluator.js";
import type {
  PredictedTrackSnapshot,
  TrackingAssertion,
  TrackingBatchEventTimelineEntry,
  TrackingBatchExpectation,
  TrackingLatencyMetrics,
  TrackingObservationFrame,
  TrackingScenarioReport,
  TrackingSequenceScenario,
  TrackingTrackTransitionTimelineEntry,
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
    maxMissedFrames: options?.maxMissedFrames,
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

function timelineEntry(
  event: BatchEvent,
  sequence: number,
  frameIndex: number,
  timestampMs: number,
): TrackingBatchEventTimelineEntry {
  const track = "track" in event ? event.track : undefined;
  const state = "state" in event ? event.state : undefined;
  return {
    sequence,
    frameIndex,
    timestampMs,
    type: event.type,
    ...(track ? {
      trackId: track.trackId,
      physicalInstanceId: track.physicalInstanceId,
      payload: track.payload,
      format: track.format,
    } : {}),
    ...(state ? { status: state.status } : {}),
  };
}

function sortedDetails<T extends Record<string, unknown>>(entries: readonly T[]): T[] {
  return [...entries].sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

function equivalentDetails(left: readonly Record<string, unknown>[], right: readonly Record<string, unknown>[]): boolean {
  return JSON.stringify(sortedDetails(left)) === JSON.stringify(sortedDetails(right));
}

function batchEvidence(
  state: BatchState,
  statistics: BatchStatistics,
  objectTrackHistory: Readonly<Record<string, readonly string[]>>,
): Record<string, unknown> {
  const objectByTrackId = new Map<string, string>();
  for (const [objectId, trackIds] of Object.entries(objectTrackHistory)) {
    for (const trackId of trackIds) objectByTrackId.set(trackId, objectId);
  }
  const classify = (kind: "matched" | "unexpected" | "duplicate", track: BarcodeTrack) => ({
    kind,
    objectId: objectByTrackId.get(track.trackId) ?? "unmatched-ground-truth-object",
    payload: track.payload,
    format: track.format,
    trackId: track.trackId,
    physicalInstanceId: track.physicalInstanceId,
  });
  return {
    ...statistics,
    mode: state.mode,
    status: state.status,
    expectedCount: state.expectedCount,
    matched: state.matched.map((entry) => classify("matched", entry.track)),
    missing: state.missing.map((entry) => ({
      payload: entry.item.payload,
      ...(entry.item.format ? { format: entry.item.format } : {}),
      quantity: entry.quantity,
    })),
    unexpected: state.unexpected.map((track) => classify("unexpected", track)),
    duplicate: state.duplicate.map((track) => classify("duplicate", track)),
  };
}

function assertBatch(
  expectation: TrackingBatchExpectation,
  observed: Record<string, unknown>,
  eventTimeline: readonly TrackingBatchEventTimelineEntry[],
): TrackingAssertion[] {
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
    const observedClassifications = [
      ...(observed.matched as Record<string, unknown>[] ?? []),
      ...(observed.unexpected as Record<string, unknown>[] ?? []),
      ...(observed.duplicate as Record<string, unknown>[] ?? []),
    ];
    const expectedClassifications = [
      ...expectation.matched.map((entry) => ({ kind: "matched", ...entry })),
      ...expectation.unexpected.map((entry) => ({ kind: "unexpected", ...entry })),
      ...expectation.duplicate.map((entry) => ({ kind: "duplicate", ...entry })),
    ];
    const classificationIdentity = observedClassifications.map(({ kind, objectId, payload, format }) => ({ kind, objectId, payload, format }));
    assertions.push(assertion(
      "batch-classification-details",
      equivalentDetails(classificationIdentity, expectedClassifications),
      expectedClassifications,
      classificationIdentity,
      "Every matched, unexpected, and duplicate object must preserve payload, format, and Ground Truth identity.",
    ));
    const physicalEvidence = observedClassifications.map(({ objectId, trackId, physicalInstanceId }) => ({ objectId, trackId, physicalInstanceId }));
    const physicalIds = physicalEvidence.map(({ physicalInstanceId }) => String(physicalInstanceId ?? ""));
    const trackIds = physicalEvidence.map(({ trackId }) => String(trackId ?? ""));
    const validPhysicalEvidence = physicalEvidence.every(({ objectId }) => objectId !== "unmatched-ground-truth-object")
      && physicalIds.every(Boolean)
      && trackIds.every(Boolean)
      && new Set(physicalIds).size === physicalIds.length;
    assertions.push(assertion(
      "batch-classification-physical-instances",
      validPhysicalEvidence,
      "one distinct, non-empty physicalInstanceId tied to each Ground Truth object",
      physicalEvidence,
      "Checklist classifications must be physical-instance evidence rather than payload-only counts.",
    ));
    const observedMissing = observed.missing as Record<string, unknown>[] ?? [];
    assertions.push(assertion(
      "batch-missing-details",
      equivalentDetails(observedMissing, expectation.missing.map((entry) => ({ ...entry }))),
      expectation.missing,
      observedMissing,
      "Missing checklist evidence must retain payload, optional format, and quantity.",
    ));
    const classificationEventType = { matched: "item-matched", unexpected: "unexpected-item", duplicate: "duplicate-item" } as const;
    const classificationEvents = eventTimeline.filter((event) =>
      event.type === "item-matched" || event.type === "unexpected-item" || event.type === "duplicate-item",
    );
    const eventEvidenceComplete = classificationEvents.length === observedClassifications.length
      && observedClassifications.every((entry) => eventTimeline.some((event) =>
        event.type === classificationEventType[entry.kind as keyof typeof classificationEventType]
        && event.physicalInstanceId === entry.physicalInstanceId
        && event.payload === entry.payload
        && event.format === entry.format,
      ));
    assertions.push(assertion(
      "batch-classification-event-timeline",
      eventEvidenceComplete,
      "one payload/format/physical-instance event for every classification",
      classificationEvents,
      "The event timeline must be traceable to the final checklist classification set.",
    ));
  }
  const completionEventCount = eventTimeline.filter((event) => event.type === "batch-completed").length;
  const expectedCompletionEventCount = expectation.status === "complete" ? 1 : 0;
  assertions.push(assertion(
    "batch-completion-event-count",
    completionEventCount === expectedCompletionEventCount,
    expectedCompletionEventCount,
    completionEventCount,
    "Completion must be emitted exactly once and only for a complete batch.",
  ));
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
  const transitionTimeline: TrackingTrackTransitionTimelineEntry[] = [];
  const batchEventTimeline: TrackingBatchEventTimelineEntry[] = [];
  let currentFrameIndex = -1;
  let currentTimestampMs = 0;
  batch?.onEvent((event) => batchEventTimeline.push(timelineEntry(
    event,
    batchEventTimeline.length,
    currentFrameIndex,
    currentTimestampMs,
  )));
  const startedAt = performance.now();

  for (const frame of scenario.observationFrames) {
    currentFrameIndex = frame.frameIndex;
    currentTimestampMs = frame.timestampMs;
    const totalStarted = performance.now();
    const decoded = decoder.decode(frame);
    const trackingStarted = performance.now();
    const update = tracker.update(decoded.observations, { frameId: frame.frameIndex, timestamp: frame.timestampMs });
    for (const [type, tracks] of [
      ["new", update.newTracks],
      ["lost", update.lostTracks],
      ["restored", update.restoredTracks],
      ["retired", update.retiredTracks],
    ] as const) {
      for (const track of tracks) {
        transitionTimeline.push({
          sequence: transitionTimeline.length,
          frameIndex: frame.frameIndex,
          timestampMs: frame.timestampMs,
          type,
          trackId: track.trackId,
          physicalInstanceId: track.physicalInstanceId,
          payload: track.payload,
          format: track.format,
          state: track.state,
        });
      }
    }
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
    ? batchEvidence(batchState, batchStatistics, evaluation.objectTrackHistory)
    : undefined;

  tracker.dispose();
  batch?.clear();
  const finalStatistics = tracker.getStatistics();
  const finalBatchStatistics = batch?.getStatistics();
  const finalBatchRetainedTrackCount = finalBatchStatistics?.retainedTrackCount ?? 0;
  const finalBatchRetainedPhysicalInstanceCount = finalBatchStatistics?.retainedPhysicalInstanceCount ?? 0;
  const observed = {
    ...evaluation.metrics,
    ...(batchObserved ? { batch: batchObserved } : {}),
    finalActiveTrackCount: finalStatistics.activeTrackCount,
    finalLostTrackCount: finalStatistics.lostTrackCount,
    finalPendingObservationCount: finalStatistics.pendingObservationCount,
    finalBatchRetainedTrackCount,
    finalBatchRetainedPhysicalInstanceCount,
    finalControlledMemory: finalStatistics.activeTrackCount
      + finalStatistics.lostTrackCount
      + finalStatistics.pendingObservationCount
      + finalBatchRetainedTrackCount
      + finalBatchRetainedPhysicalInstanceCount,
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
    assertion("batch-tracks-disposed", observed.finalBatchRetainedTrackCount === 0, 0, observed.finalBatchRetainedTrackCount, "Batch cleanup must clear retained track snapshots."),
    assertion("batch-physical-instances-disposed", observed.finalBatchRetainedPhysicalInstanceCount === 0, 0, observed.finalBatchRetainedPhysicalInstanceCount, "Batch cleanup must clear retained physical-instance evidence."),
    assertion("controlled-memory-disposed", observed.finalControlledMemory === 0, 0, observed.finalControlledMemory, "All benchmark-controlled tracking state must be released."),
  ];

  if (expected.samePayloadInstanceSeparation) {
    const histories = Object.values(evaluation.objectTrackHistory);
    const firstIds = histories.map((history) => history[0]).filter((id): id is string => id !== undefined);
    const groundTruthPayloads = [...new Set(scenario.groundTruthTracks.map((track) => track.payload))];
    const groundTruthActuallySharesPayload = scenario.groundTruthTracks.length > 1 && groundTruthPayloads.length === 1;
    const separated = groundTruthActuallySharesPayload
      && histories.every((history) => history.length === 1)
      && new Set(firstIds).size === expected.groundTruthObjectCount;
    assertions.push(assertion(
      "same-payload-physical-instance-separation",
      separated,
      { sharedPayloadCount: 1, distinctStableTrackIds: expected.groundTruthObjectCount },
      { groundTruthPayloads, objectTrackHistory: evaluation.objectTrackHistory },
      "Ground Truth must contain multiple equal-payload objects and Track ID must not equal payload identity.",
    ));
  }
  if (expected.lifecycle) {
    const lifecycle = expected.lifecycle;
    for (const [type, count] of [
      ["new", lifecycle.newTrackCount],
      ["lost", lifecycle.lostTransitionCount],
      ["restored", lifecycle.restoredTransitionCount],
      ["retired", lifecycle.retiredTransitionCount],
    ] as const) {
      const observedCount = transitionTimeline.filter((entry) => entry.type === type).length;
      assertions.push(assertion(
        `lifecycle-${type}-transition-count`,
        observedCount === count,
        count,
        observedCount,
        `Lifecycle ${type} transitions must be executed and reported rather than inferred from final tracks.`,
      ));
    }
    let orderCursor = 0;
    for (const entry of transitionTimeline) {
      if (entry.type === lifecycle.requiredOrder[orderCursor]) orderCursor += 1;
    }
    assertions.push(assertion(
      "lifecycle-transition-order",
      orderCursor === lifecycle.requiredOrder.length,
      lifecycle.requiredOrder,
      transitionTimeline.map(({ type, frameIndex, trackId }) => ({ type, frameIndex, trackId })),
      "Lifecycle transitions must occur in the Ground Truth-declared order.",
    ));
    if (lifecycle.restoredTrackMustMatchLostTrack) {
      const lostTrackIds = new Set(transitionTimeline.filter(({ type }) => type === "lost").map(({ trackId }) => trackId));
      const restored = transitionTimeline.filter(({ type }) => type === "restored");
      assertions.push(assertion(
        "lifecycle-restored-identity",
        restored.length > 0 && restored.every(({ trackId }) => lostTrackIds.has(trackId)),
        "every restored trackId previously appeared as lost",
        restored.map(({ trackId }) => trackId),
        "Bounded occlusion must restore the same physical track identity.",
      ));
    }
  }
  if (expected.batch && batchObserved) assertions.push(...assertBatch(expected.batch, batchObserved, batchEventTimeline));

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
    transitionTimeline,
    batchEventTimeline,
  };
}
