import type { BarcodeFormat } from "@scanly/core";

export type TrackingScenarioCategory = "basic" | "multi-object" | "identity" | "lifecycle" | "batch" | "stress";

export interface TrackingBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TrackingGeometrySpec {
  cornerPoints: readonly { x: number; y: number }[];
  boundingBox: TrackingBoundingBox;
  frameWidth: number;
  frameHeight: number;
}

export interface GroundTruthFrame {
  frameIndex: number;
  visible: boolean;
  geometry?: TrackingGeometrySpec;
}

/** Decoder-independent identity truth. This data is only consumed by the evaluator. */
export interface GroundTruthTrack {
  objectId: string;
  payload: string;
  format: BarcodeFormat;
  frames: readonly GroundTruthFrame[];
}

/** A decoder stimulus intentionally has no ground-truth object identity. */
export interface TrackingObservationSpec {
  observationId: string;
  payload: string;
  format: BarcodeFormat;
  geometry: TrackingGeometrySpec;
  confidence?: number;
}

export interface TrackingObservationFrame {
  frameIndex: number;
  timestampMs: number;
  observations: readonly TrackingObservationSpec[];
}

export interface TrackingBatchExpectedItem {
  payload: string;
  format?: BarcodeFormat;
  quantity?: number;
}

export interface TrackingBatchExpectedClassification {
  /** Ground-truth object identity; never passed into the tracker/controller. */
  objectId: string;
  payload: string;
  format: BarcodeFormat;
}

export interface TrackingBatchMissingDetail {
  payload: string;
  format?: BarcodeFormat;
  quantity: number;
}

export type TrackingBatchExpectation =
  | { mode: "continuous"; status: "collecting" }
  | { mode: "expected-count"; expectedCount: number; status: "complete" | "collecting"; confirmedPhysicalInstanceCount?: number }
  | { mode: "unique-physical-instance"; expectedCount: number; status: "complete" | "collecting"; confirmedPhysicalInstanceCount?: number }
  | {
      mode: "checklist";
      expected: readonly TrackingBatchExpectedItem[];
      status: "complete" | "collecting";
      matchedQuantity: number;
      missingQuantity: number;
      unexpectedQuantity: number;
      duplicateQuantity: number;
      /** Independent, per-object classification oracle. */
      matched: readonly TrackingBatchExpectedClassification[];
      missing: readonly TrackingBatchMissingDetail[];
      unexpected: readonly TrackingBatchExpectedClassification[];
      duplicate: readonly TrackingBatchExpectedClassification[];
    };

export interface TrackingScenarioExpected {
  groundTruthObjectCount: number;
  minimumConfirmedTrackCount?: number;
  maximumConfirmedTrackCount?: number;
  maximumIdentitySwitchCount: number;
  maximumTrackFragmentationCount: number;
  maximumFalseTrackCount: number;
  minimumTrackRecall: number;
  minimumTrackPrecision: number;
  samePayloadInstanceSeparation?: boolean;
  batch?: TrackingBatchExpectation;
  lifecycle?: {
    newTrackCount: number;
    lostTransitionCount: number;
    restoredTransitionCount: number;
    retiredTransitionCount: number;
    requiredOrder: readonly TrackingTrackTransitionType[];
    restoredTrackMustMatchLostTrack?: boolean;
  };
}

export interface TrackingSequenceScenario {
  id: string;
  category: TrackingScenarioCategory;
  description: string;
  /** Input to the tracking runtime. It never contains objectId. */
  observationFrames: readonly TrackingObservationFrame[];
  /** Independent correctness oracle. It is never passed into the tracker. */
  groundTruthTracks: readonly GroundTruthTrack[];
  expected: TrackingScenarioExpected;
  trackerOptions?: {
    confirmationObservations?: number;
    /** Exact BarcodeTracker missed-frame retention boundary. */
    maxMissedFrames?: number;
    maxTracks?: number;
    maxObservations?: number;
    associationThreshold?: number;
  };
}

export type PredictedTrackState = "tentative" | "confirmed" | "lost" | "retired";

/** Structural evaluator input keeps benchmark code independent of public export wiring. */
export interface PredictedTrackSnapshot {
  trackId: string;
  physicalInstanceId: string;
  payload: string;
  format: BarcodeFormat;
  state: PredictedTrackState;
  firstFrameId: number;
  lastFrameId: number;
  observationCount: number;
  missedFrameCount: number;
  geometry: TrackingGeometrySpec;
}

export interface TrackingFrameMatch {
  objectId: string;
  trackId: string;
  cost: number;
}

export interface TrackingFrameEvaluation {
  frameIndex: number;
  visibleGroundTruthCount: number;
  predictedVisibleTrackCount: number;
  matches: readonly TrackingFrameMatch[];
  missedObjectIds: readonly string[];
  unmatchedTrackIds: readonly string[];
  unmatchedConfirmedTrackIds: readonly string[];
  unmatchedTentativeTrackIds: readonly string[];
  identitySwitches: number;
}

export interface TrackingEvaluationMetrics {
  groundTruthObjectCount: number;
  confirmedTrackCount: number;
  identitySwitchCount: number;
  trackFragmentationCount: number;
  falseTrackCount: number;
  matchedObservationCount: number;
  missedObservationCount: number;
  falseTrackObservationCount: number;
  falseConfirmedTrackObservationCount: number;
  unmatchedTentativeTrackObservationCount: number;
  trackRecall: number;
  trackPrecision: number;
  averageTrackLifetimeFrames: number;
}

export interface TrackingEvaluationResult {
  metrics: TrackingEvaluationMetrics;
  frameEvaluations: readonly TrackingFrameEvaluation[];
  objectTrackHistory: Readonly<Record<string, readonly string[]>>;
  falseTrackIds: readonly string[];
}

export interface TrackingAssertion {
  id: string;
  expected: unknown;
  observed: unknown;
  pass: boolean;
  message: string;
}

export interface TrackingLatencyMetrics {
  /** Deterministic scenarios measure an instrumented observation-driver call. */
  decoderEvidence: "deterministic-observation-driver";
  associationP50Ms: number;
  associationP95Ms: number;
  trackingP50Ms: number;
  trackingP95Ms: number;
  decoderP50Ms: number;
  decoderP95Ms: number;
  totalFrameP50Ms: number;
  totalFrameP95Ms: number;
  effectiveFps: number;
  decoderCalls: number;
  decoderCallsPerFrame: number;
  maximumAssociationPairs: number;
}

export interface TrackingScenarioReport {
  id: string;
  category: TrackingScenarioCategory;
  description: string;
  expected: TrackingScenarioExpected;
  observed: TrackingEvaluationMetrics & {
    batch?: Record<string, unknown>;
    finalActiveTrackCount: number;
    finalLostTrackCount: number;
    finalPendingObservationCount: number;
    finalBatchRetainedTrackCount: number;
    finalBatchRetainedPhysicalInstanceCount: number;
    finalControlledMemory: number;
  };
  assertions: readonly TrackingAssertion[];
  pass: boolean;
  failureReasons: readonly string[];
  metrics: TrackingLatencyMetrics;
  frameEvaluations: readonly TrackingFrameEvaluation[];
  objectTrackHistory: Readonly<Record<string, readonly string[]>>;
  trackTimeline: ReadonlyArray<{ frameIndex: number; tracks: readonly PredictedTrackSnapshot[] }>;
  transitionTimeline: readonly TrackingTrackTransitionTimelineEntry[];
  batchEventTimeline: readonly TrackingBatchEventTimelineEntry[];
}

export type TrackingTrackTransitionType = "new" | "lost" | "restored" | "retired";

export interface TrackingTrackTransitionTimelineEntry {
  sequence: number;
  frameIndex: number;
  timestampMs: number;
  type: TrackingTrackTransitionType;
  trackId: string;
  physicalInstanceId: string;
  payload: string;
  format: BarcodeFormat;
  state: PredictedTrackState;
}

export interface TrackingBatchEventTimelineEntry {
  sequence: number;
  frameIndex: number;
  timestampMs: number;
  type: string;
  trackId?: string;
  physicalInstanceId?: string;
  payload?: string;
  format?: BarcodeFormat;
  status?: string;
}
