import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { TrackingEvaluator } from "../../benchmark/tracking/evaluator";
import { runTrackingSuite } from "../../benchmark/tracking/report";
import {
  REQUIRED_BATCH_SCENARIOS_BY_MODE,
  REQUIRED_SAME_PAYLOAD_SCENARIO_IDS,
  REQUIRED_TRACKING_SCENARIO_IDS,
  serializeTrackingExecutableSemantics,
  serializeTrackingSemanticContract,
  TRACKING_EXECUTABLE_SEMANTICS_SHA256,
  TRACKING_SEMANTIC_CONTRACT_SHA256,
} from "../../benchmark/tracking/semantic-contract";
import { TRACKING_SEQUENCE_SCENARIOS, trackingGeometry } from "../../benchmark/tracking/sequence-fixtures";
import type { GroundTruthTrack, PredictedTrackSnapshot } from "../../benchmark/tracking/types";

function predicted(trackId: string, frameIndex: number, x: number): PredictedTrackSnapshot {
  return {
    trackId,
    physicalInstanceId: `physical-${trackId}`,
    payload: "EVALUATOR",
    format: "qr_code",
    state: "confirmed",
    firstFrameId: 0,
    lastFrameId: frameIndex,
    observationCount: frameIndex + 1,
    missedFrameCount: 0,
    geometry: trackingGeometry(x, 100),
  };
}

describe("tracking benchmark ground truth", () => {
  it("matches the independently frozen 34-scenario semantic contract", () => {
    expect(TRACKING_SEQUENCE_SCENARIOS).toHaveLength(34);
    expect(TRACKING_SEQUENCE_SCENARIOS.map(({ id }) => id)).toEqual(REQUIRED_TRACKING_SCENARIO_IDS);
    expect(new Set(TRACKING_SEQUENCE_SCENARIOS.map(({ category }) => category))).toEqual(new Set([
      "basic", "multi-object", "identity", "lifecycle", "batch", "stress",
    ]));
    expect(TRACKING_SEQUENCE_SCENARIOS.map(({ id }) => id).length).toBe(new Set(TRACKING_SEQUENCE_SCENARIOS.map(({ id }) => id)).size);
    expect(REQUIRED_SAME_PAYLOAD_SCENARIO_IDS).toHaveLength(6);
    expect(Object.fromEntries(Object.entries(REQUIRED_BATCH_SCENARIOS_BY_MODE).map(([mode, ids]) => [mode, ids.length]))).toEqual({
      continuous: 1,
      "expected-count": 2,
      checklist: 4,
      "unique-physical-instance": 1,
    });
    expect(createHash("sha256").update(serializeTrackingSemanticContract()).digest("hex")).toBe(TRACKING_SEMANTIC_CONTRACT_SHA256);
    expect(createHash("sha256").update(serializeTrackingExecutableSemantics(TRACKING_SEQUENCE_SCENARIOS)).digest("hex"))
      .toBe(TRACKING_EXECUTABLE_SEMANTICS_SHA256);
  });

  it("keeps decoder stimuli structurally independent from object identity truth", () => {
    for (const scenario of TRACKING_SEQUENCE_SCENARIOS) {
      expect(scenario.groundTruthTracks.every((track) => track.objectId.length > 0)).toBe(true);
      for (const frame of scenario.observationFrames) {
        for (const observation of frame.observations) {
          expect("objectId" in observation).toBe(false);
          expect(observation.observationId).not.toContain("objectId");
        }
      }
    }
  });

  it("uses the real maxMissedFrames lifecycle option without benchmark-only aliases", () => {
    const lifecycleScenarios = TRACKING_SEQUENCE_SCENARIOS.filter(({ category }) => category === "lifecycle");
    expect(lifecycleScenarios.length).toBeGreaterThan(0);
    for (const scenario of lifecycleScenarios) {
      expect(scenario.trackerOptions?.maxMissedFrames).toBeTypeOf("number");
      expect(scenario.trackerOptions).not.toHaveProperty("lostGraceFrames");
      expect(scenario.trackerOptions).not.toHaveProperty("retirementFrames");
    }
  });

  it("computes identity switches, fragmentation, misses, false tracks, recall, precision, and lifetime", () => {
    const truth: GroundTruthTrack[] = [{
      objectId: "truth-a",
      payload: "EVALUATOR",
      format: "qr_code",
      frames: [0, 1, 2].map((frameIndex) => ({ frameIndex, visible: true, geometry: trackingGeometry(100 + frameIndex * 10, 100) })),
    }];
    const evaluator = new TrackingEvaluator(truth);
    evaluator.evaluateFrame(0, [predicted("track-a", 0, 100)]);
    evaluator.evaluateFrame(1, [predicted("track-b", 1, 110)]);
    evaluator.evaluateFrame(2, [predicted("false-track", 2, 500)]);
    const result = evaluator.finish();
    expect(result.metrics).toMatchObject({
      groundTruthObjectCount: 1,
      confirmedTrackCount: 3,
      identitySwitchCount: 1,
      trackFragmentationCount: 1,
      falseTrackCount: 1,
      matchedObservationCount: 2,
      missedObservationCount: 1,
      falseTrackObservationCount: 1,
      falseConfirmedTrackObservationCount: 1,
      unmatchedTentativeTrackObservationCount: 0,
    });
    expect(result.metrics.trackRecall).toBeCloseTo(2 / 3);
    expect(result.metrics.trackPrecision).toBeCloseTo(2 / 3);
    // The synthetic snapshots explicitly declare lifetimes of 1, 2, and 3 frames.
    expect(result.metrics.averageTrackLifetimeFrames).toBe(2);
  });

  it("does not let a tentative Ground Truth match exempt a later false confirmed track", () => {
    const truth: GroundTruthTrack[] = [{
      objectId: "brief-truth",
      payload: "EVALUATOR",
      format: "qr_code",
      frames: [
        { frameIndex: 0, visible: true, geometry: trackingGeometry(100, 100) },
        { frameIndex: 1, visible: false },
      ],
    }];
    const evaluator = new TrackingEvaluator(truth);
    evaluator.evaluateFrame(0, [{ ...predicted("track-a", 0, 100), state: "tentative" }]);
    evaluator.evaluateFrame(1, [predicted("track-a", 1, 100)]);

    const result = evaluator.finish();
    expect(result.falseTrackIds).toEqual(["track-a"]);
    expect(result.metrics).toMatchObject({
      confirmedTrackCount: 1,
      falseTrackCount: 1,
      falseConfirmedTrackObservationCount: 1,
      unmatchedTentativeTrackObservationCount: 0,
    });
  });

  it("observes unmatched tentative noise without counting it as a false confirmed track", () => {
    const evaluator = new TrackingEvaluator([]);
    evaluator.evaluateFrame(0, [{ ...predicted("noise", 0, 500), state: "tentative" }]);

    const result = evaluator.finish();
    expect(result.falseTrackIds).toEqual([]);
    expect(result.metrics).toMatchObject({
      confirmedTrackCount: 0,
      falseTrackCount: 0,
      falseConfirmedTrackObservationCount: 0,
      unmatchedTentativeTrackObservationCount: 1,
    });
    expect(result.frameEvaluations[0]).toMatchObject({
      unmatchedConfirmedTrackIds: [],
      unmatchedTentativeTrackIds: ["noise"],
    });
  });
});

describe("tracking benchmark execution", () => {
  it("executes all semantic drivers and derives every deterministic gate from observations", async () => {
    const result = await runTrackingSuite();
    expect(result.scenarios).toHaveLength(TRACKING_SEQUENCE_SCENARIOS.length);
    expect(result.scenarios.filter(({ pass }) => !pass).map(({ id, failureReasons }) => ({ id, failureReasons }))).toEqual([]);
    expect(result.aggregateGates.filter(({ pass }) => !pass)).toEqual([]);
    expect(result.aggregateMetrics).toMatchObject({ falseTrackCount: 0, identitySwitchCount: 0, falseBatchCompletionCount: 0 });
    expect(result.aggregateMetrics.samePayloadScenarioPassCount).toBe(result.aggregateMetrics.samePayloadScenarioCount);
    expect(result.aggregateMetrics.batchScenarioPassCount).toBe(result.aggregateMetrics.batchScenarioCount);
    expect(result.semanticContract).toMatchObject({
      sha256: TRACKING_SEMANTIC_CONTRACT_SHA256,
      executableSemanticsSha256: TRACKING_EXECUTABLE_SEMANTICS_SHA256,
      requiredScenarioIds: REQUIRED_TRACKING_SCENARIO_IDS,
    });
    expect(result.pass).toBe(true);
  });

  it("records bounded 1/4/8/16 target development baselines", async () => {
    const result = await runTrackingSuite();
    expect(result.scales.map(({ targetCount }) => targetCount)).toEqual([1, 4, 8, 16]);
    for (const scale of result.scales) {
      expect(scale.decoderEvidence).toBe("deterministic-observation-driver");
      expect(scale.decoderCalls).toBeGreaterThan(0);
      expect(scale.decoderCallsPerFrame).toBe(1);
      expect(scale.maximumAssociationPairs).toBeLessThanOrEqual(scale.targetCount ** 2);
      expect(scale.associationP50Ms).toBeGreaterThanOrEqual(0);
      expect(scale.associationP95Ms).toBeGreaterThanOrEqual(scale.associationP50Ms);
      expect(scale.decoderP95Ms).toBeGreaterThanOrEqual(scale.decoderP50Ms);
      expect(scale.trackingP95Ms).toBeGreaterThanOrEqual(scale.trackingP50Ms);
      expect(scale.totalFrameP95Ms).toBeGreaterThanOrEqual(scale.totalFrameP50Ms);
      expect(scale.effectiveFps).toBeGreaterThan(0);
    }
  });

  it("reports per-object checklist classifications and a traceable event timeline", async () => {
    const result = await runTrackingSuite();
    const scenario = result.scenarios.find(({ id }) => id === "batch-duplicate-quantity");
    expect(scenario?.pass).toBe(true);
    expect(scenario?.expected.batch).toMatchObject({
      mode: "checklist",
      matchedQuantity: 3,
      unexpectedQuantity: 1,
      duplicateQuantity: 1,
    });
    expect((scenario?.observed.batch as { matched: unknown[] }).matched).toHaveLength(3);
    expect((scenario?.observed.batch as { unexpected: unknown[] }).unexpected).toHaveLength(1);
    expect((scenario?.observed.batch as { duplicate: unknown[] }).duplicate).toHaveLength(1);
    expect(scenario?.assertions.filter(({ id }) => id.startsWith("batch-classification")).every(({ pass }) => pass)).toBe(true);
    const classificationEvents = scenario?.batchEventTimeline.filter(({ type }) =>
      type === "item-matched" || type === "unexpected-item" || type === "duplicate-item",
    ) ?? [];
    expect(classificationEvents).toHaveLength(5);
    expect(classificationEvents.every(({ payload, format, physicalInstanceId }) =>
      Boolean(payload && format && physicalInstanceId),
    )).toBe(true);
    expect(scenario?.batchEventTimeline.filter(({ type }) => type === "batch-completed")).toHaveLength(1);
  });

  it("exercises the 32-target ceiling and false-confirmation noise negatives", async () => {
    const result = await runTrackingSuite();
    const bounded = result.scenarios.find(({ id }) => id === "multi-bounded-32-static");
    expect(bounded).toBeDefined();
    expect(bounded?.observed).toMatchObject({
      groundTruthObjectCount: 32,
      confirmedTrackCount: 32,
      falseTrackCount: 0,
    });
    expect(bounded?.metrics.maximumAssociationPairs).toBe(32 ** 2);

    const emptyNoise = result.scenarios.find(({ id }) => id === "stress-empty-ground-truth-transient-noise");
    const truthNoise = result.scenarios.find(({ id }) => id === "stress-truth-with-transient-noise");
    const repeatedNoise = result.scenarios.find(({ id }) => id === "stress-repeated-spatial-noise");
    expect(emptyNoise?.observed).toMatchObject({
      groundTruthObjectCount: 0,
      confirmedTrackCount: 0,
      falseTrackCount: 0,
      falseConfirmedTrackObservationCount: 0,
      unmatchedTentativeTrackObservationCount: 1,
    });
    expect(truthNoise?.observed).toMatchObject({
      groundTruthObjectCount: 1,
      confirmedTrackCount: 1,
      falseTrackCount: 0,
      falseConfirmedTrackObservationCount: 0,
      unmatchedTentativeTrackObservationCount: 1,
    });
    expect(repeatedNoise?.observed).toMatchObject({
      groundTruthObjectCount: 0,
      confirmedTrackCount: 0,
      falseTrackCount: 0,
      falseConfirmedTrackObservationCount: 0,
      unmatchedTentativeTrackObservationCount: 4,
    });
  });

  it("reports executed lost, restored, retired, and re-entry transition order", async () => {
    const result = await runTrackingSuite();
    const brief = result.scenarios.find(({ id }) => id === "lifecycle-brief-occlusion");
    const long = result.scenarios.find(({ id }) => id === "lifecycle-long-disappearance");
    expect(brief?.transitionTimeline.map(({ type }) => type)).toEqual(["new", "lost", "restored"]);
    const briefLost = brief?.transitionTimeline.find(({ type }) => type === "lost");
    const briefRestored = brief?.transitionTimeline.find(({ type }) => type === "restored");
    expect(briefRestored?.trackId).toBe(briefLost?.trackId);
    expect(long?.transitionTimeline.map(({ type }) => type)).toEqual(["new", "lost", "retired", "new"]);
    for (const scenario of [brief, long]) {
      expect(scenario?.assertions.filter(({ id }) => id.startsWith("lifecycle-")).every(({ pass }) => pass)).toBe(true);
    }
  });
});
