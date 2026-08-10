import type { BarcodeFormat } from "@scanly/core";
import type {
  GroundTruthTrack,
  TrackingBatchExpectation,
  TrackingGeometrySpec,
  TrackingObservationFrame,
  TrackingObservationSpec,
  TrackingScenarioCategory,
  TrackingScenarioExpected,
  TrackingSequenceScenario,
} from "./types.js";
import {
  REQUIRED_TRACKING_SCENARIO_IDS,
  TRACKING_SEMANTIC_SCENARIOS,
} from "./semantic-contract.js";

export const TRACKING_FRAME_WIDTH = 640;
export const TRACKING_FRAME_HEIGHT = 480;

interface ObjectPath {
  objectId: string;
  payload: string;
  format?: BarcodeFormat;
  firstFrame?: number;
  lastFrame?: number;
  invisibleFrames?: readonly number[];
  decoderMissFrames?: readonly number[];
  geometry(frameIndex: number, progress: number): TrackingGeometrySpec;
}

interface ScenarioOptions {
  id: string;
  category: TrackingScenarioCategory;
  description: string;
  frameCount?: number;
  objects: readonly ObjectPath[];
  expected?: Partial<TrackingScenarioExpected>;
  batch?: TrackingBatchExpectation;
  emptyObservationFrames?: readonly number[];
  trackerOptions?: TrackingSequenceScenario["trackerOptions"];
  /** Decoder-only noise/stimuli that intentionally has no Ground Truth identity. */
  additionalObservations?: (frameIndex: number) => readonly TrackingObservationSpec[];
}

export function trackingGeometry(x: number, y: number, width = 52, height = 34): TrackingGeometrySpec {
  return {
    boundingBox: { x, y, width, height },
    cornerPoints: [
      { x, y },
      { x: x + width, y },
      { x: x + width, y: y + height },
      { x, y: y + height },
    ],
    frameWidth: TRACKING_FRAME_WIDTH,
    frameHeight: TRACKING_FRAME_HEIGHT,
  };
}

function linear(startX: number, startY: number, endX = startX, endY = startY, width = 52, height = 34) {
  return (_frameIndex: number, progress: number): TrackingGeometrySpec => trackingGeometry(
    startX + (endX - startX) * progress,
    startY + (endY - startY) * progress,
    width,
    height,
  );
}

function object(
  objectId: string,
  payload: string,
  geometry: ObjectPath["geometry"],
  options: Omit<Partial<ObjectPath>, "objectId" | "payload" | "geometry"> = {},
): ObjectPath {
  return { objectId, payload, geometry, ...options };
}

function gridObjects(count: number, moving = false, prefix = "GRID"): ObjectPath[] {
  return Array.from({ length: count }, (_, index) => {
    const columns = count > 16 ? 8 : 4;
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = count > 16 ? 28 + column * 76 : 36 + column * 145;
    const y = count > 16 ? 42 + row * 104 : 42 + row * 92;
    const dx = moving ? (index % 2 === 0 ? 22 : -22) : 0;
    const dy = moving ? ((index % 3) - 1) * 12 : 0;
    return object(`${prefix.toLowerCase()}-${index + 1}`, `${prefix}-${String(index + 1).padStart(2, "0")}`, linear(x, y, x + dx, y + dy), {
      format: index % 3 === 0 ? "data_matrix" : "code_128",
    });
  });
}

function isVisible(path: ObjectPath, frameIndex: number, frameCount: number): boolean {
  const first = path.firstFrame ?? 0;
  const last = path.lastFrame ?? frameCount - 1;
  return frameIndex >= first && frameIndex <= last && !path.invisibleFrames?.includes(frameIndex);
}

function buildScenario(options: ScenarioOptions): TrackingSequenceScenario {
  const frameCount = options.frameCount ?? 12;

  // Ground truth and decoder observations are materialized into separate arrays.
  // No objectId is copied into observationFrames.
  const groundTruthTracks: GroundTruthTrack[] = options.objects.map((path) => ({
    objectId: path.objectId,
    payload: path.payload,
    format: path.format ?? "qr_code",
    frames: Array.from({ length: frameCount }, (_, frameIndex) => {
      const visible = isVisible(path, frameIndex, frameCount);
      const span = Math.max(1, (path.lastFrame ?? frameCount - 1) - (path.firstFrame ?? 0));
      const progress = Math.max(0, Math.min(1, (frameIndex - (path.firstFrame ?? 0)) / span));
      return { frameIndex, visible, geometry: visible ? path.geometry(frameIndex, progress) : undefined };
    }),
  }));

  const observationFrames: TrackingObservationFrame[] = Array.from({ length: frameCount }, (_, frameIndex) => {
    const objectObservations = options.emptyObservationFrames?.includes(frameIndex)
      ? []
      : options.objects.flatMap((path, pathIndex) => {
          if (!isVisible(path, frameIndex, frameCount) || path.decoderMissFrames?.includes(frameIndex)) return [];
          const span = Math.max(1, (path.lastFrame ?? frameCount - 1) - (path.firstFrame ?? 0));
          const progress = Math.max(0, Math.min(1, (frameIndex - (path.firstFrame ?? 0)) / span));
          return [{
            observationId: `${options.id}:frame-${frameIndex}:observation-${pathIndex}`,
            payload: path.payload,
            format: path.format ?? "qr_code" as const,
            geometry: path.geometry(frameIndex, progress),
            confidence: 0.99,
          }];
        });
    const observations = [
      ...objectObservations,
      ...(options.additionalObservations?.(frameIndex) ?? []),
    ];
    // Alternating order catches implementations that equate array position with identity.
    if (frameIndex % 2 === 1) observations.reverse();
    return { frameIndex, timestampMs: 1_000 + frameIndex * 33, observations };
  });

  return {
    id: options.id,
    category: options.category,
    description: options.description,
    observationFrames,
    groundTruthTracks,
    expected: {
      groundTruthObjectCount: options.objects.length,
      minimumConfirmedTrackCount: options.objects.length,
      maximumConfirmedTrackCount: options.objects.length,
      maximumIdentitySwitchCount: 0,
      maximumTrackFragmentationCount: 0,
      maximumFalseTrackCount: 0,
      minimumTrackRecall: 1,
      minimumTrackPrecision: 1,
      ...options.expected,
      ...(options.batch ? { batch: options.batch } : {}),
    },
    trackerOptions: {
      confirmationObservations: 2,
      maxMissedFrames: 8,
      maxTracks: 32,
      maxObservations: 32,
      associationThreshold: 1.35,
      ...options.trackerOptions,
    },
  };
}

const SAME_UPC = "012345678905";
const occluded = [5, 6, 7, 8] as const;

/**
 * Decoder-independent deterministic tracking corpus. Twenty-eight scenarios
 * cover the requested basic, multi-object, identity, lifecycle, batch, and
 * stress families. The four `scale-*` scenarios feed the 1/4/8/16 baseline.
 */
export const TRACKING_SEQUENCE_SCENARIOS: readonly TrackingSequenceScenario[] = [
  buildScenario({
    id: "basic-scale-1-static", category: "basic", description: "One static barcode retains one identity.",
    objects: [object("static-1", "BASIC-STATIC", linear(120, 90))],
  }),
  buildScenario({
    id: "basic-single-moving", category: "basic", description: "One barcode moves with a stable track ID.",
    objects: [object("moving-1", "BASIC-MOVING", linear(50, 120, 470, 260))],
  }),
  buildScenario({
    id: "basic-size-change", category: "basic", description: "Approach motion changes geometry size without fragmenting identity.",
    objects: [object("size-1", "BASIC-SIZE", (_frame, progress) => trackingGeometry(240 - progress * 18, 170 - progress * 12, 38 + progress * 70, 26 + progress * 44))],
  }),
  buildScenario({
    id: "multi-scale-4-static", category: "multi-object", description: "Four static targets are independently tracked.", objects: gridObjects(4),
  }),
  buildScenario({
    id: "multi-scale-8-static", category: "multi-object", description: "Eight static targets are independently tracked.", objects: gridObjects(8),
  }),
  buildScenario({
    id: "multi-scale-16-static", category: "multi-object", description: "Sixteen static targets remain within configured bounds.", objects: gridObjects(16),
  }),
  buildScenario({
    id: "multi-bounded-32-static", category: "multi-object", description: "Thirty-two static targets exercise the configured association ceiling.",
    frameCount: 8, objects: gridObjects(32, false, "BOUND32"), trackerOptions: { maxTracks: 32, maxObservations: 32 },
  }),
  buildScenario({
    id: "multi-4-moving", category: "multi-object", description: "Four targets move independently.", objects: gridObjects(4, true, "MOVE4"),
  }),
  buildScenario({
    id: "multi-8-moving", category: "multi-object", description: "Eight targets move independently.", objects: gridObjects(8, true, "MOVE8"),
  }),
  buildScenario({
    id: "identity-same-payload-two", category: "identity", description: "Two equal UPC payloads produce distinct stable physical identities.",
    objects: [
      object("same-2-a", SAME_UPC, linear(50, 90, 250, 110), { format: "upc_a" }),
      object("same-2-b", SAME_UPC, linear(470, 300, 290, 280), { format: "upc_a" }),
    ], expected: { samePayloadInstanceSeparation: true },
  }),
  buildScenario({
    id: "identity-same-payload-four", category: "identity", description: "Four equal UPC objects retain four identities while moving.",
    objects: [
      object("same-4-a", SAME_UPC, linear(45, 45, 90, 70), { format: "upc_a" }),
      object("same-4-b", SAME_UPC, linear(500, 50, 450, 90), { format: "upc_a" }),
      object("same-4-c", SAME_UPC, linear(60, 330, 120, 290), { format: "upc_a" }),
      object("same-4-d", SAME_UPC, linear(490, 330, 430, 285), { format: "upc_a" }),
    ], expected: { samePayloadInstanceSeparation: true },
  }),
  buildScenario({
    id: "identity-different-payload-crossing", category: "identity", description: "Different payload paths cross without identity switches.",
    objects: [object("cross-diff-a", "CROSS-A", linear(40, 205, 525, 225)), object("cross-diff-b", "CROSS-B", linear(525, 225, 40, 205))],
  }),
  buildScenario({
    id: "identity-same-payload-crossing", category: "identity", description: "Equal payload paths cross between frames with motion-based identity continuity.",
    objects: [
      object("cross-same-a", SAME_UPC, linear(35, 202, 535, 222), { format: "upc_a" }),
      object("cross-same-b", SAME_UPC, linear(535, 222, 35, 202), { format: "upc_a" }),
    ], expected: { samePayloadInstanceSeparation: true }, trackerOptions: { associationThreshold: 1.6 },
  }),
  buildScenario({
    id: "identity-same-payload-parallel", category: "identity", description: "Equal payload targets moving in parallel do not collapse.",
    objects: [
      object("parallel-a", SAME_UPC, linear(60, 120, 480, 120), { format: "upc_a" }),
      object("parallel-b", SAME_UPC, linear(60, 220, 480, 220), { format: "upc_a" }),
    ], expected: { samePayloadInstanceSeparation: true },
  }),
  buildScenario({
    id: "identity-close-proximity", category: "identity", description: "Nearby different payloads remain distinct.",
    objects: [object("close-a", "CLOSE-A", linear(210, 180, 250, 180)), object("close-b", "CLOSE-B", linear(280, 185, 240, 185))],
  }),
  buildScenario({
    id: "lifecycle-brief-occlusion", category: "lifecycle", description: "A four-frame occlusion restores the original track.", frameCount: 16,
    objects: [object("occlusion-brief", "OCCLUDED", linear(80, 160, 460, 160), { invisibleFrames: occluded })],
    expected: {
      minimumTrackRecall: 0.75,
      lifecycle: { newTrackCount: 1, lostTransitionCount: 1, restoredTransitionCount: 1, retiredTransitionCount: 0, requiredOrder: ["lost", "restored"], restoredTrackMustMatchLostTrack: true },
    }, trackerOptions: { maxMissedFrames: 5 },
  }),
  buildScenario({
    id: "lifecycle-long-disappearance", category: "lifecycle", description: "A disappearance beyond retirement creates one documented fragment.", frameCount: 20,
    objects: [object("occlusion-long", "LONG-GAP", linear(90, 180, 450, 180), { invisibleFrames: [4, 5, 6, 7, 8, 9, 10, 11, 12] })],
    expected: {
      minimumConfirmedTrackCount: 2, maximumConfirmedTrackCount: 2, maximumIdentitySwitchCount: 1, maximumTrackFragmentationCount: 1, minimumTrackRecall: 0.9,
      lifecycle: { newTrackCount: 2, lostTransitionCount: 1, restoredTransitionCount: 0, retiredTransitionCount: 1, requiredOrder: ["lost", "retired", "new"] },
    },
    trackerOptions: { maxMissedFrames: 5 },
  }),
  buildScenario({
    id: "lifecycle-leave-reentry", category: "lifecycle", description: "Leave and re-entry after retirement has bounded, explicit fragmentation.", frameCount: 22,
    objects: [object("leave-reentry", "LEAVE-REENTRY", linear(30, 250, 520, 250), { invisibleFrames: [5, 6, 7, 8, 9, 10, 11, 12, 13] })],
    expected: {
      minimumConfirmedTrackCount: 2, maximumConfirmedTrackCount: 2, maximumIdentitySwitchCount: 1, maximumTrackFragmentationCount: 1, minimumTrackRecall: 0.9,
      lifecycle: { newTrackCount: 2, lostTransitionCount: 1, restoredTransitionCount: 0, retiredTransitionCount: 1, requiredOrder: ["lost", "retired", "new"] },
    },
    trackerOptions: { maxMissedFrames: 5 },
  }),
  buildScenario({
    id: "lifecycle-decoder-gap", category: "lifecycle", description: "Short decoder misses preserve the same track through the grace window.",
    objects: [object("decoder-gap", "DECODER-GAP", linear(80, 100, 470, 100), { decoderMissFrames: [5, 6] })],
    expected: {
      minimumTrackRecall: 0.8,
      lifecycle: { newTrackCount: 1, lostTransitionCount: 1, restoredTransitionCount: 1, retiredTransitionCount: 0, requiredOrder: ["lost", "restored"], restoredTrackMustMatchLostTrack: true },
    }, trackerOptions: { maxMissedFrames: 3 },
  }),
  buildScenario({
    id: "batch-expected-count", category: "batch", description: "Expected-count completes from three confirmed physical tracks.",
    objects: gridObjects(3, false, "COUNT"), batch: { mode: "expected-count", expectedCount: 3, status: "complete" },
  }),
  buildScenario({
    id: "batch-expected-count-incomplete", category: "batch", description: "Expected-count cannot complete from only two of three required physical tracks.",
    objects: gridObjects(2, false, "COUNT-PARTIAL"), batch: { mode: "expected-count", expectedCount: 3, confirmedPhysicalInstanceCount: 2, status: "collecting" },
  }),
  buildScenario({
    id: "batch-checklist", category: "batch", description: "Checklist reports every expected payload exactly once.",
    objects: [object("list-1", "ABC-001", linear(60, 80), { format: "code_128" }), object("list-2", "ABC-002", linear(250, 80), { format: "code_128" }), object("list-3", "XYZ", linear(440, 80), { format: "data_matrix" })],
    batch: {
      mode: "checklist",
      expected: [{ payload: "ABC-001", format: "code_128" }, { payload: "ABC-002", format: "code_128" }, { payload: "XYZ", format: "data_matrix" }],
      status: "complete", matchedQuantity: 3, missingQuantity: 0, unexpectedQuantity: 0, duplicateQuantity: 0,
      matched: [
        { objectId: "list-1", payload: "ABC-001", format: "code_128" },
        { objectId: "list-2", payload: "ABC-002", format: "code_128" },
        { objectId: "list-3", payload: "XYZ", format: "data_matrix" },
      ],
      missing: [],
      unexpected: [],
      duplicate: [],
    },
  }),
  buildScenario({
    id: "batch-duplicate-quantity", category: "batch", description: "Equal UPC quantity, overflow, and wrong-format instances receive physical-identity-aware classifications.",
    objects: [
      object("quantity-a", SAME_UPC, linear(30, 200), { format: "upc_a" }),
      object("quantity-b", SAME_UPC, linear(150, 200), { format: "upc_a" }),
      object("quantity-c", SAME_UPC, linear(270, 200), { format: "upc_a" }),
      object("quantity-overflow", SAME_UPC, linear(390, 200), { format: "upc_a" }),
      object("quantity-wrong-format", SAME_UPC, linear(510, 200), { format: "code_128" }),
    ],
    expected: { samePayloadInstanceSeparation: true },
    batch: {
      mode: "checklist", expected: [{ payload: SAME_UPC, format: "upc_a", quantity: 3 }],
      status: "complete", matchedQuantity: 3, missingQuantity: 0, unexpectedQuantity: 1, duplicateQuantity: 1,
      matched: [
        { objectId: "quantity-a", payload: SAME_UPC, format: "upc_a" },
        { objectId: "quantity-b", payload: SAME_UPC, format: "upc_a" },
        { objectId: "quantity-c", payload: SAME_UPC, format: "upc_a" },
      ],
      missing: [],
      unexpected: [{ objectId: "quantity-wrong-format", payload: SAME_UPC, format: "code_128" }],
      duplicate: [{ objectId: "quantity-overflow", payload: SAME_UPC, format: "upc_a" }],
    },
  }),
  buildScenario({
    id: "batch-unexpected-item", category: "batch", description: "An extra physical item is classified as unexpected and cannot falsely satisfy the checklist.",
    objects: [object("expected-1", "EXPECTED", linear(100, 120), { format: "code_128" }), object("unexpected-1", "UNEXPECTED", linear(400, 120), { format: "code_128" })],
    batch: {
      mode: "checklist", expected: [{ payload: "EXPECTED", format: "code_128" }],
      status: "complete", matchedQuantity: 1, missingQuantity: 0, unexpectedQuantity: 1, duplicateQuantity: 0,
      matched: [{ objectId: "expected-1", payload: "EXPECTED", format: "code_128" }],
      missing: [],
      unexpected: [{ objectId: "unexpected-1", payload: "UNEXPECTED", format: "code_128" }],
      duplicate: [],
    },
  }),
  buildScenario({
    id: "batch-checklist-missing", category: "batch", description: "A checklist with one missing quantity remains collecting and cannot falsely complete.",
    objects: [object("present-1", "PRESENT", linear(180, 150), { format: "code_128" })],
    batch: {
      mode: "checklist", expected: [{ payload: "PRESENT", format: "code_128" }, { payload: "MISSING", format: "code_128" }],
      status: "collecting", matchedQuantity: 1, missingQuantity: 1, unexpectedQuantity: 0, duplicateQuantity: 0,
      matched: [{ objectId: "present-1", payload: "PRESENT", format: "code_128" }],
      missing: [{ payload: "MISSING", format: "code_128", quantity: 1 }],
      unexpected: [],
      duplicate: [],
    },
  }),
  buildScenario({
    id: "batch-unique-physical-instance", category: "batch", description: "Unique-instance completion counts equal payload objects by track identity.",
    objects: [object("unique-a", SAME_UPC, linear(100, 300), { format: "upc_a" }), object("unique-b", SAME_UPC, linear(400, 300), { format: "upc_a" })],
    expected: { samePayloadInstanceSeparation: true }, batch: { mode: "unique-physical-instance", expectedCount: 2, status: "complete" },
  }),
  buildScenario({
    id: "batch-continuous", category: "batch", description: "Continuous mode remains collecting after confirmed tracks.",
    objects: gridObjects(2, true, "CONTINUOUS"), batch: { mode: "continuous", status: "collecting" },
  }),
  buildScenario({
    id: "stress-16-moving", category: "stress", description: "Sixteen independently moving tracks remain bounded.", frameCount: 24, objects: gridObjects(16, true, "STRESS16"),
  }),
  buildScenario({
    id: "stress-frame-drops", category: "stress", description: "Dropped observation frames do not fragment tracks within grace.", frameCount: 18,
    objects: gridObjects(8, true, "DROP"), emptyObservationFrames: [4, 5, 11], expected: { minimumTrackRecall: 0.8 }, trackerOptions: { maxMissedFrames: 4 },
  }),
  buildScenario({
    id: "stress-decoder-misses", category: "stress", description: "Per-object decoder misses are isolated without identity churn.", frameCount: 18,
    objects: gridObjects(8, true, "MISS").map((path, index) => ({ ...path, decoderMissFrames: [4 + index % 3, 10 + index % 2] })),
    expected: { minimumTrackRecall: 0.85 }, trackerOptions: { maxMissedFrames: 3 },
  }),
  buildScenario({
    id: "stress-camera-motion", category: "stress", description: "Coherent camera translation preserves all eight identities.", frameCount: 18,
    objects: gridObjects(8, false, "CAMERA").map((path, index) => ({ ...path, geometry: (_frame: number, progress: number) => {
      const column = index % 4;
      const row = Math.floor(index / 4);
      return trackingGeometry(36 + column * 145 + progress * 48, 60 + row * 150 + progress * 24);
    } })),
  }),
  buildScenario({
    id: "stress-empty-ground-truth-transient-noise", category: "stress", description: "One-frame decoder noise remains tentative with no false confirmed track.",
    frameCount: 6,
    objects: [],
    additionalObservations: (frameIndex) => frameIndex === 2 ? [{
      observationId: "empty-gt-transient-noise",
      payload: "TRANSIENT-NOISE",
      format: "qr_code",
      geometry: trackingGeometry(280, 210),
      confidence: 0.51,
    }] : [],
    expected: { minimumTrackPrecision: 0 },
  }),
  buildScenario({
    id: "stress-truth-with-transient-noise", category: "stress", description: "A true moving target remains correct while one-frame spatial noise stays tentative.",
    objects: [object("truth-with-noise", "TRUE-TARGET", linear(80, 170, 470, 170))],
    additionalObservations: (frameIndex) => frameIndex === 5 ? [{
      observationId: "truth-plus-transient-noise",
      payload: "TRANSIENT-NOISE",
      format: "data_matrix",
      geometry: trackingGeometry(520, 360),
      confidence: 0.54,
    }] : [],
    expected: { minimumTrackPrecision: 0.9 },
  }),
  buildScenario({
    id: "stress-repeated-spatial-noise", category: "stress", description: "Repeated equal-payload noise separated by empty frames never reaches confirmation.",
    frameCount: 8,
    objects: [],
    additionalObservations: (frameIndex) => frameIndex % 2 === 0 ? [{
      observationId: `repeated-spatial-noise-${frameIndex}`,
      payload: "REPEATED-NOISE",
      format: "qr_code",
      geometry: trackingGeometry(300, 220),
      confidence: 0.5,
    }] : [],
    trackerOptions: { confirmationObservations: 2, maxMissedFrames: 0 },
    expected: { minimumTrackPrecision: 0 },
  }),
] as const;

const executableScenarioIds = TRACKING_SEQUENCE_SCENARIOS.map(({ id }) => id);
if (executableScenarioIds.join("\n") !== REQUIRED_TRACKING_SCENARIO_IDS.join("\n")) {
  throw new Error("Tracking executable scenarios do not match the frozen Beta 2 semantic scenario contract.");
}
const executableById = new Map(TRACKING_SEQUENCE_SCENARIOS.map((scenario) => [scenario.id, scenario]));
for (const required of TRACKING_SEMANTIC_SCENARIOS) {
  const scenario = executableById.get(required.id);
  if (!scenario || scenario.category !== required.category) {
    throw new Error(`Tracking scenario ${required.id} does not match required category ${required.category}.`);
  }
  const requiredBatchMode = "batchMode" in required ? required.batchMode : undefined;
  if (scenario.expected.batch?.mode !== requiredBatchMode) {
    throw new Error(`Tracking scenario ${required.id} does not match required batch mode ${requiredBatchMode ?? "none"}.`);
  }
  const requiredSamePayload = "samePayload" in required && required.samePayload;
  if (Boolean(scenario.expected.samePayloadInstanceSeparation) !== requiredSamePayload) {
    throw new Error(`Tracking scenario ${required.id} does not match the same-payload evidence contract.`);
  }
}
